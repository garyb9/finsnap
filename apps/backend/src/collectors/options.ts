import { createLogger } from '../logger';
import { backoffMs, wait } from '../lib/async';
import { MemoCache } from '../lib/memoCache';
import {
  OPTIONS_CACHE_TTL_SECONDS,
  TICKER_DESCRIPTIONS,
  YAHOO_MAX_RETRIES,
  YAHOO_OPTIONS_BASE,
  YAHOO_OPTIONS_CALL_DELAY_MS,
  YAHOO_RATE_LIMIT_BACKOFF_MS,
} from '../constants';
import { getYahooSession, withSession, type YahooSession } from './yahooSession';
import type { OptionsData, OptionsChain, OptionsContract } from './types';
import type { OptionsStore } from '../storage/optionsStore';

const log = createLogger('options');

interface YahooOption {
  strike: number;
  volume?: number;
  openInterest?: number;
}

interface YahooOptionsResult {
  expirationDates: number[];
  quote: { regularMarketPrice: number; longName?: string; shortName?: string };
  options: {
    expirationDate: number;
    calls: YahooOption[];
    puts: YahooOption[];
  }[];
}

const cache = new MemoCache<OptionsData>();

function normalizeContracts(options: YahooOption[]): OptionsContract[] {
  return options
    .filter((o) => o.strike > 0)
    .map((o) => ({
      strike: o.strike,
      volume: o.volume ?? 0,
      openInterest: o.openInterest ?? 0,
    }));
}

function unixToIsoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function toChain(result: YahooOptionsResult['options'][number]): OptionsChain {
  return {
    expiration: unixToIsoDate(result.expirationDate),
    calls: normalizeContracts(result.calls),
    puts: normalizeContracts(result.puts),
  };
}

async function fetchYahooOptions(
  ticker: string,
  session: YahooSession | null,
  dateTs?: number
): Promise<YahooOptionsResult | null> {
  const base = dateTs
    ? `${YAHOO_OPTIONS_BASE}/${ticker}?date=${dateTs}`
    : `${YAHOO_OPTIONS_BASE}/${ticker}`;
  const { url, headers } = withSession(base, session);

  for (let attempt = 0; attempt <= YAHOO_MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (err) {
      log.warn(`network error fetching ${ticker}${dateTs ? `/${dateTs}` : ''}: ${err}`);
      return null;
    }

    if (response.ok) {
      const json = (await response.json()) as { optionChain: { result: YahooOptionsResult[] } };
      return json?.optionChain?.result?.[0] ?? null;
    }

    if (response.status === 429 && attempt < YAHOO_MAX_RETRIES) {
      const delay = backoffMs(YAHOO_RATE_LIMIT_BACKOFF_MS, attempt);
      log.warn(`rate limited on ${ticker}, retrying in ${delay / 1000}s...`);
      await wait(delay);
      continue;
    }

    log.warn(`options request failed for ${ticker} (HTTP ${response.status})`);
    return null;
  }

  return null;
}

/**
 * Fetch a full options chain.
 *
 * Yahoo returns the first expiry inline but requires one request per additional
 * expiry, so the remainder are paged sequentially with a delay — parallelizing
 * these reliably trips the rate limiter.
 *
 * The live cache is in-process; `optionsStore` gets a daily archival copy of
 * every real fetch.
 */
export async function fetchOptionsData(
  ticker: string,
  optionsStore: OptionsStore
): Promise<OptionsData | null> {
  const cached = cache.get(ticker.toUpperCase());
  if (cached) {
    log.info(`${ticker}: using cached chain (${cached.chains.length} expirations)`);
    return cached;
  }

  log.info(`fetching ${ticker} options chain...`);

  const session = await getYahooSession();
  const base = await fetchYahooOptions(ticker, session);

  if (!base) {
    log.warn(`${ticker}: failed to fetch options base`);
    return null;
  }

  const expirationDates = base.expirationDates ?? [];
  if (expirationDates.length === 0) {
    log.warn(`${ticker}: no expiration dates returned`);
    return null;
  }

  const chains: OptionsChain[] = [];
  if (base.options?.[0]) chains.push(toChain(base.options[0]));

  for (const timestamp of expirationDates.slice(1)) {
    await wait(YAHOO_OPTIONS_CALL_DELAY_MS);
    const result = await fetchYahooOptions(ticker, session, timestamp);
    if (result?.options?.[0]) chains.push(toChain(result.options[0]));
  }

  log.info(`${ticker}: fetched ${chains.length} expirations`);

  const data: OptionsData = {
    ticker: ticker.toUpperCase(),
    description:
      base.quote?.longName ?? base.quote?.shortName ?? TICKER_DESCRIPTIONS[ticker.toUpperCase()],
    price: base.quote?.regularMarketPrice ?? 0,
    chains,
    fetchedAt: Date.now(),
  };

  cache.set(data.ticker, data, OPTIONS_CACHE_TTL_SECONDS);

  try {
    await optionsStore.upsertSnapshot(data);
  } catch (err) {
    // A failed archive write is not worth failing the fetch over — the caller
    // still gets today's chain, just without today's row in the archive.
    log.warn(`${ticker}: options snapshot archive write failed: ${err}`);
  }

  return data;
}
