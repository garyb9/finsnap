import type Redis from 'ioredis';
import { createLogger } from '../logger';
import type { OptionsData, OptionsChain, OptionsContract } from './types';

const log = createLogger('options');

const YAHOO_BASE = 'https://query2.finance.yahoo.com/v7/finance/options';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;
const CALL_DELAY_MS = 300;
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redisKey(ticker: string): string {
  return `finsnap:options:${ticker.toUpperCase()}`;
}

interface YahooOption {
  strike: number;
  volume?: number;
  openInterest?: number;
}

interface YahooOptionsResult {
  expirationDates: number[];
  quote: { regularMarketPrice: number };
  options: {
    expirationDate: number;
    calls: YahooOption[];
    puts: YahooOption[];
  }[];
}

async function fetchYahooOptions(
  ticker: string,
  dateTs?: number
): Promise<YahooOptionsResult | null> {
  const url = dateTs ? `${YAHOO_BASE}/${ticker}?date=${dateTs}` : `${YAHOO_BASE}/${ticker}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
    } catch (err) {
      log.warn(`network error fetching ${ticker}${dateTs ? `/${dateTs}` : ''}: ${err}`);
      return null;
    }

    if (res.ok) {
      const json = (await res.json()) as {
        optionChain: { result: YahooOptionsResult[] };
      };
      return json?.optionChain?.result?.[0] ?? null;
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = 2_000 * Math.pow(2, attempt);
      log.warn(`rate limited on ${ticker}, retrying in ${backoff / 1000}s...`);
      await wait(backoff);
      continue;
    }

    log.warn(`Yahoo options request failed for ${ticker} (${res.status})`);
    return null;
  }

  return null;
}

function normalizeContracts(opts: YahooOption[]): OptionsContract[] {
  return opts
    .filter((o) => o.strike > 0)
    .map((o) => ({
      strike: o.strike,
      volume: o.volume ?? 0,
      openInterest: o.openInterest ?? 0,
    }));
}

function unixToIsoDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export async function fetchOptionsData(ticker: string, redis: Redis): Promise<OptionsData | null> {
  // Return cached result if fresh
  try {
    const cached = await redis.get(redisKey(ticker));
    if (cached) {
      const parsed = JSON.parse(cached) as OptionsData;
      log.info(`${ticker} options: using cached data (${parsed.chains.length} expirations)`);
      return parsed;
    }
  } catch {
    // ignore redis errors
  }

  log.info(`fetching ${ticker} options chain...`);

  // Step 1: fetch base result to get expirationDates + first chain
  const base = await fetchYahooOptions(ticker);
  if (!base) {
    log.warn(`${ticker}: failed to fetch options base`);
    return null;
  }

  const price = base.quote?.regularMarketPrice ?? 0;
  const expirationDates = base.expirationDates ?? [];

  if (expirationDates.length === 0) {
    log.warn(`${ticker}: no expiration dates returned`);
    return null;
  }

  const chains: OptionsChain[] = [];

  // Process first expiration from the base response
  const firstOpts = base.options?.[0];
  if (firstOpts) {
    chains.push({
      expiration: unixToIsoDate(firstOpts.expirationDate),
      calls: normalizeContracts(firstOpts.calls),
      puts: normalizeContracts(firstOpts.puts),
    });
  }

  // Step 2: fetch remaining expirations sequentially
  const remaining = expirationDates.slice(1);
  for (const ts of remaining) {
    await wait(CALL_DELAY_MS);
    const result = await fetchYahooOptions(ticker, ts);
    if (!result?.options?.[0]) continue;

    const opts = result.options[0];
    chains.push({
      expiration: unixToIsoDate(opts.expirationDate),
      calls: normalizeContracts(opts.calls),
      puts: normalizeContracts(opts.puts),
    });
  }

  log.info(`${ticker}: fetched ${chains.length} expirations`);

  const data: OptionsData = {
    ticker: ticker.toUpperCase(),
    price,
    chains,
    fetchedAt: Date.now(),
  };

  // Cache in Redis
  try {
    await redis.set(redisKey(ticker), JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // ignore redis errors
  }

  return data;
}
