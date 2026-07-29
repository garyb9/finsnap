import type Redis from 'ioredis';
import { createLogger } from '../logger';
import { backoffMs, wait } from '../lib/async';
import { BAR_CACHE_TTL_SECONDS, REDIS_KEYS } from '../constants';
import { BarInterval, type Bar, type BarSeries } from './types';

const log = createLogger('binance');

const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines';
const BINANCE_MAX_RETRIES = 3;
const BINANCE_RATE_LIMIT_BACKOFF_MS = 1_000;
/** Binance's own cap on rows per request; long daily history needs several. */
const KLINE_LIMIT = 1000;

/** FinSnap's intervals happen to be valid Binance interval strings verbatim. */
const INTERVAL_MAP: Record<BarInterval, string> = {
  [BarInterval.FiveMinute]: '5m',
  [BarInterval.Hourly]: '1h',
  [BarInterval.Daily]: '1d',
};

/**
 * Map a FinSnap crypto symbol to its Binance spot pair.
 *
 * Binance has no USD-quoted spot markets, only USDT — the gap between the two
 * is a few basis points at most, well inside the noise this collector exists
 * to cross-check. Returns null for anything that isn't plainly a `XXX-USD`
 * crypto pair, so callers can skip symbols Binance has no business serving.
 */
export function toBinanceSymbol(symbol: string): string | null {
  const match = /^([A-Z0-9]+)-USD$/i.exec(symbol.trim());
  if (!match) return null;
  return `${match[1].toUpperCase()}USDT`;
}

function cacheKey(symbol: string, interval: BarInterval): string {
  return `${REDIS_KEYS.bars}:binance:${symbol.toUpperCase()}:${interval}`;
}

function isFresh(series: BarSeries): boolean {
  const ageMs = Date.now() - series.fetchedAt;
  return ageMs < BAR_CACHE_TTL_SECONDS[series.interval] * 1000;
}

type KlineRow = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  ...unknown[],
];

function parseKlines(rows: KlineRow[]): Bar[] {
  return rows.map((row) => ({
    time: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
}

async function fetchPage(
  pair: string,
  interval: BarInterval,
  startTime: number
): Promise<KlineRow[] | null> {
  const params = new URLSearchParams({
    symbol: pair,
    interval: INTERVAL_MAP[interval],
    limit: String(KLINE_LIMIT),
    startTime: String(startTime),
  });

  for (let attempt = 0; attempt <= BINANCE_MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${BINANCE_KLINES_URL}?${params}`);
    } catch (err) {
      log.warn(`network error fetching ${pair} ${interval}: ${err}`);
      return null;
    }

    if (response.ok) return (await response.json()) as KlineRow[];

    if (response.status === 429 && attempt < BINANCE_MAX_RETRIES) {
      const delay = backoffMs(BINANCE_RATE_LIMIT_BACKOFF_MS, attempt);
      log.warn(`rate limited on ${pair} ${interval}, retrying in ${delay / 1000}s...`);
      await wait(delay);
      continue;
    }

    log.warn(`klines request failed for ${pair} ${interval} (HTTP ${response.status})`);
    return null;
  }

  return null;
}

/**
 * Page through Binance klines from the pair's listing date to now.
 *
 * Binance caps each response at `KLINE_LIMIT` rows, so full daily history
 * (BTCUSDT has traded since 2017) takes several sequential requests. Starting
 * from epoch 0 matters: an omitted/undefined `startTime` makes Binance answer
 * with the *most recent* `limit` rows instead, which then only ever pages
 * backwards into more recent data, never reaching the listing date. Each
 * page's last open-time plus one interval becomes the next page's start,
 * which also naturally terminates once a page comes back short.
 */
async function fetchAllKlines(pair: string, interval: BarInterval): Promise<Bar[] | null> {
  const bars: Bar[] = [];
  let startTime = 0;

  for (;;) {
    const page = await fetchPage(pair, interval, startTime);
    if (page === null) return bars.length > 0 ? bars : null;
    if (page.length === 0) break;

    bars.push(...parseKlines(page));

    if (page.length < KLINE_LIMIT) break;
    startTime = page[page.length - 1][0] + 1;
    await wait(150);
  }

  return bars;
}

/**
 * Fetch OHLCV bars for a crypto pair straight from the exchange, with a Redis
 * cache matching the Yahoo bar collector's freshness policy.
 *
 * This is an independent read on the same asset Yahoo serves via `BTC-USD`:
 * exchange-native, no session handshake, no rate-limit dance — useful as a
 * cross-check or a fallback when Yahoo's crumb flow is having a bad day.
 */
export async function fetchBinanceSeries(
  symbol: string,
  interval: BarInterval,
  redis: Redis
): Promise<BarSeries | null> {
  const pair = toBinanceSymbol(symbol);
  if (!pair) return null;

  try {
    const raw = await redis.get(cacheKey(symbol, interval));
    if (raw) {
      const cached = JSON.parse(raw) as BarSeries;
      if (isFresh(cached)) {
        log.info(`${symbol} ${interval}: cached (${cached.bars.length} bars)`);
        return cached;
      }
    }
  } catch (err) {
    log.warn(`cache read failed for ${symbol} ${interval}: ${err}`);
  }

  const bars = await fetchAllKlines(pair, interval);
  if (!bars || bars.length === 0) return null;

  const series: BarSeries = { symbol, interval, bars, fetchedAt: Date.now() };

  try {
    await redis.set(
      cacheKey(symbol, interval),
      JSON.stringify(series),
      'EX',
      BAR_CACHE_TTL_SECONDS[interval]
    );
  } catch (err) {
    log.warn(`cache write failed for ${symbol} ${interval}: ${err}`);
  }

  log.info(`${symbol} ${interval}: parsed ${bars.length} bars from Binance (${pair})`);
  return series;
}
