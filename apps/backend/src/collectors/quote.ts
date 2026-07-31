import { createLogger } from '../logger';
import { QUOTE_CACHE_TTL_SECONDS, YAHOO_QUOTE_BASE } from '../constants';
import { SizeKind } from '../constants/enums';
import { getYahooSession, withSession } from './yahooSession';
import { MemoCache } from '../lib/memoCache';

const log = createLogger('quote');

/**
 * How big an instrument is, and by which measure.
 *
 * Yahoo reports `marketCap` for companies and cryptocurrencies but `netAssets`
 * for funds — it does not return a market cap for an ETF, and that is correct
 * rather than a gap: an ETF creates and redeems shares on demand, so price ×
 * shares is an artefact of flows, not a measure of the fund. Since this
 * universe is one cryptocurrency and twenty-two ETFs, the measure that applies
 * is carried alongside the number so nothing has to guess later.
 */
export interface AssetSize {
  value: number;
  kind: SizeKind;
}

interface QuoteRow {
  symbol?: string;
  marketCap?: number;
  netAssets?: number;
}

const cache = new MemoCache<Record<string, AssetSize>>();
const CACHE_KEY = 'sizes';

function readSize(row: QuoteRow): AssetSize | null {
  // Market cap first: for anything that has one it is the more meaningful
  // figure, and only funds fall through to net assets.
  if (typeof row.marketCap === 'number' && row.marketCap > 0) {
    return { value: row.marketCap, kind: SizeKind.MarketCap };
  }
  if (typeof row.netAssets === 'number' && row.netAssets > 0) {
    return { value: row.netAssets, kind: SizeKind.NetAssets };
  }
  return null;
}

/**
 * Fetch the size of every symbol in one request.
 *
 * Batched deliberately: one call for the whole universe rather than one per
 * symbol keeps this a rounding error against the bar fetches, which is the only
 * reason it is worth pulling at all for a figure that moves slowly.
 *
 * Returns an empty map on any failure. Size is decoration on the report — it
 * must never be the reason an asset is missing from it.
 */
export async function fetchAssetSizes(symbols: string[]): Promise<Map<string, AssetSize>> {
  if (symbols.length === 0) return new Map();

  const cached = cache.get(CACHE_KEY);
  if (cached) return new Map(Object.entries(cached));

  try {
    const session = await getYahooSession();
    const query = symbols.map((s) => encodeURIComponent(s)).join(',');
    const { url, headers } = withSession(`${YAHOO_QUOTE_BASE}?symbols=${query}`, session);

    const response = await fetch(url, { headers });
    if (!response.ok) {
      log.warn(`quote request failed: HTTP ${response.status}`);
      return new Map();
    }

    const body = (await response.json()) as { quoteResponse?: { result?: QuoteRow[] } };
    const rows = body.quoteResponse?.result ?? [];

    const sizes = new Map<string, AssetSize>();
    for (const row of rows) {
      if (!row.symbol) continue;
      const size = readSize(row);
      if (size) sizes.set(row.symbol.toUpperCase(), size);
    }

    if (sizes.size > 0) {
      cache.set(CACHE_KEY, Object.fromEntries(sizes), QUOTE_CACHE_TTL_SECONDS);
    }

    log.info(`sizes resolved for ${sizes.size}/${symbols.length} symbols`);
    return sizes;
  } catch (err) {
    log.warn(`failed to fetch sizes (continuing without): ${err}`);
    return new Map();
  }
}
