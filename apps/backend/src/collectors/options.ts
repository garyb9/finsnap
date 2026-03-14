import type Redis from 'ioredis';
import { createLogger } from '../logger';
import type { OptionsData, OptionsChain, OptionsContract } from './types';

const log = createLogger('options');

const YAHOO_BASE = 'https://query2.finance.yahoo.com/v7/finance/options';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;
const CALL_DELAY_MS = 300;
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const CRUMB_TTL_SECONDS = 23 * 60 * 60; // 23 hours
const CRUMB_REDIS_KEY = 'finsnap:yahoo:crumb';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redisKey(ticker: string): string {
  return `finsnap:options:${ticker.toUpperCase()}`;
}

interface YahooSession {
  cookie: string;
  crumb: string;
  fetchedAt: number;
}

interface YahooOption {
  strike: number;
  volume?: number;
  openInterest?: number;
}

const TICKER_DESCRIPTIONS: Record<string, string> = {
  IBIT: 'iShares Bitcoin Trust ETF',
  SPY: 'SPDR S&P 500 ETF Trust',
  GLD: 'SPDR Gold Shares',
  XLE: 'Energy Select Sector SPDR Fund',
  XLI: 'Industrial Select Sector SPDR Fund',
  QQQ: 'Invesco QQQ Trust',
  USO: 'United States Oil Fund',
};

interface YahooOptionsResult {
  expirationDates: number[];
  quote: { regularMarketPrice: number; longName?: string; shortName?: string };
  options: {
    expirationDate: number;
    calls: YahooOption[];
    puts: YahooOption[];
  }[];
}

/** Fetch + cache a Yahoo Finance session (cookie + crumb). Valid for ~24h. */
async function getYahooSession(redis: Redis): Promise<YahooSession | null> {
  // Try Redis cache first
  try {
    const cached = await redis.get(CRUMB_REDIS_KEY);
    if (cached) return JSON.parse(cached) as YahooSession;
  } catch {
    /* ignore */
  }

  try {
    // Step 1: hit fc.yahoo.com to receive consent cookie
    const r1 = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      redirect: 'follow',
    });

    // Collect all Set-Cookie values (Node 18+ exposes getSetCookie())
    const rawHeaders = r1.headers as unknown as { getSetCookie?: () => string[] };
    const setCookies: string[] =
      typeof rawHeaders.getSetCookie === 'function'
        ? rawHeaders.getSetCookie()
        : [r1.headers.get('set-cookie') ?? ''].filter(Boolean);

    const cookie = setCookies
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ');

    // Step 2: get crumb using the cookie
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': USER_AGENT, Cookie: cookie, Accept: 'text/plain' },
    });

    if (!r2.ok) {
      log.warn(`crumb fetch failed: HTTP ${r2.status}`);
      return null;
    }

    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.length < 3) {
      log.warn('received empty/invalid crumb');
      return null;
    }

    const session: YahooSession = { cookie, crumb, fetchedAt: Date.now() };
    try {
      await redis.set(CRUMB_REDIS_KEY, JSON.stringify(session), 'EX', CRUMB_TTL_SECONDS);
    } catch {
      /* ignore */
    }

    log.info(`Yahoo session acquired (crumb: ${crumb.slice(0, 6)}...)`);
    return session;
  } catch (err) {
    log.warn(`failed to acquire Yahoo session: ${err}`);
    return null;
  }
}

async function fetchYahooOptions(
  ticker: string,
  session: YahooSession | null,
  dateTs?: number
): Promise<YahooOptionsResult | null> {
  let url = dateTs ? `${YAHOO_BASE}/${ticker}?date=${dateTs}` : `${YAHOO_BASE}/${ticker}`;

  if (session) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}crumb=${encodeURIComponent(session.crumb)}`;
  }

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };
  if (session) headers['Cookie'] = session.cookie;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      log.warn(`network error fetching ${ticker}${dateTs ? `/${dateTs}` : ''}: ${err}`);
      return null;
    }

    if (res.ok) {
      const json = (await res.json()) as { optionChain: { result: YahooOptionsResult[] } };
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
    /* ignore */
  }

  log.info(`fetching ${ticker} options chain...`);

  const session = await getYahooSession(redis);

  // Step 1: fetch base result to get expirationDates + first chain
  const base = await fetchYahooOptions(ticker, session);
  if (!base) {
    log.warn(`${ticker}: failed to fetch options base`);
    return null;
  }

  const price = base.quote?.regularMarketPrice ?? 0;
  const description =
    base.quote?.longName ?? base.quote?.shortName ?? TICKER_DESCRIPTIONS[ticker.toUpperCase()];
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
    const result = await fetchYahooOptions(ticker, session, ts);
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
    description,
    price,
    chains,
    fetchedAt: Date.now(),
  };

  // Cache in Redis
  try {
    await redis.set(redisKey(ticker), JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
  } catch {
    /* ignore */
  }

  return data;
}
