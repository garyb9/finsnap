import type Redis from 'ioredis';
import { createLogger } from '../logger';
import { backoffMs, wait } from '../lib/async';
import {
  OPTIONS_CACHE_TTL_SECONDS,
  REDIS_KEYS,
  TICKER_DESCRIPTIONS,
  YAHOO_MAX_RETRIES,
  YAHOO_OPTIONS_BASE,
  YAHOO_OPTIONS_CALL_DELAY_MS,
  YAHOO_RATE_LIMIT_BACKOFF_MS,
} from '../constants';
import { getYahooSession, withSession, type YahooSession } from './yahooSession';
import type { OptionsData, OptionsChain, OptionsContract } from './types';

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

function cacheKey(ticker: string): string {
  return `${REDIS_KEYS.options}:${ticker.toUpperCase()}`;
}

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

async function readCache(ticker: string, redis: Redis): Promise<OptionsData | null> {
  try {
    const cached = await redis.get(cacheKey(ticker));
    if (!cached) return null;

    const parsed = JSON.parse(cached) as OptionsData;
    log.info(`${ticker}: using cached chain (${parsed.chains.length} expirations)`);
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(data: OptionsData, redis: Redis): Promise<void> {
  try {
    await redis.set(cacheKey(data.ticker), JSON.stringify(data), 'EX', OPTIONS_CACHE_TTL_SECONDS);
  } catch {
    /* a cache miss next time is not worth failing the fetch over */
  }
}

/**
 * Fetch a full options chain.
 *
 * Yahoo returns the first expiry inline but requires one request per additional
 * expiry, so the remainder are paged sequentially with a delay — parallelizing
 * these reliably trips the rate limiter.
 */
export async function fetchOptionsData(ticker: string, redis: Redis): Promise<OptionsData | null> {
  const cached = await readCache(ticker, redis);
  if (cached) return cached;

  log.info(`fetching ${ticker} options chain...`);

  const session = await getYahooSession(redis);
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

  await writeCache(data, redis);
  return data;
}
