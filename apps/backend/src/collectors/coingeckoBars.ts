import type Redis from 'ioredis';
import { createLogger } from '../logger';
import { REDIS_KEYS } from '../constants';

const log = createLogger('coingecko');

const COINGECKO_OHLC_URL = 'https://api.coingecko.com/api/v3/coins';
/** Public (keyless) tier hard-caps historical queries to the trailing year. */
const COINGECKO_MAX_DAYS = 365;
const CACHE_TTL_SECONDS = 6 * 60 * 60;

/** Only symbols FinSnap actually watches — deliberately not the full ~17k coin list. */
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  'BTC-USD': 'bitcoin',
};

export interface CoinGeckoPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CoinGeckoSeries {
  symbol: string;
  points: CoinGeckoPoint[];
  /**
   * CoinGecko's free tier auto-picks candle width by range and won't serve
   * true daily bars this far back — at the 365-day cap it's ~4-day candles.
   * Callers must not treat this as interchangeable with a Yahoo/Binance daily
   * series; it's a coarser, independently-sourced cross-check, not a
   * backtest-grade series.
   */
  approxCandleWidthDays: number;
  fetchedAt: number;
}

function cacheKey(symbol: string): string {
  return `${REDIS_KEYS.bars}:coingecko:${symbol.toUpperCase()}`;
}

/**
 * Fetch a coarse, aggregated-across-exchanges OHLC series for a crypto symbol.
 *
 * This is independent of both Yahoo (single quote vendor) and Binance (single
 * exchange's own book) — CoinGecko blends many exchanges, so a large gap
 * between this and the other two is a signal worth investigating rather than
 * dismissing as noise. It trades that independence for coarser candles and a
 * one-year lookback cap on the keyless tier, so use it for sanity-checking
 * price/trend direction, not for running the backtest itself.
 */
export async function fetchCoinGeckoSeries(
  symbol: string,
  redis: Redis
): Promise<CoinGeckoSeries | null> {
  const coinId = SYMBOL_TO_COINGECKO_ID[symbol.toUpperCase()];
  if (!coinId) return null;

  try {
    const raw = await redis.get(cacheKey(symbol));
    if (raw) {
      const cached = JSON.parse(raw) as CoinGeckoSeries;
      if (Date.now() - cached.fetchedAt < CACHE_TTL_SECONDS * 1000) {
        log.info(`${symbol}: cached (${cached.points.length} points)`);
        return cached;
      }
    }
  } catch (err) {
    log.warn(`cache read failed for ${symbol}: ${err}`);
  }

  let response: Response;
  try {
    response = await fetch(
      `${COINGECKO_OHLC_URL}/${coinId}/ohlc?vs_currency=usd&days=${COINGECKO_MAX_DAYS}`
    );
  } catch (err) {
    log.warn(`network error fetching ${symbol}: ${err}`);
    return null;
  }

  if (!response.ok) {
    log.warn(`ohlc request failed for ${symbol} (HTTP ${response.status})`);
    return null;
  }

  const rows = (await response.json()) as [number, number, number, number, number][];
  if (rows.length === 0) return null;

  const points: CoinGeckoPoint[] = rows.map(([time, open, high, low, close]) => ({
    time,
    open,
    high,
    low,
    close,
  }));

  const spanDays = (points[points.length - 1].time - points[0].time) / (points.length * 86_400_000);

  const series: CoinGeckoSeries = {
    symbol,
    points,
    approxCandleWidthDays: Math.max(1, Math.round(spanDays)),
    fetchedAt: Date.now(),
  };

  try {
    await redis.set(cacheKey(symbol), JSON.stringify(series), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    log.warn(`cache write failed for ${symbol}: ${err}`);
  }

  log.info(
    `${symbol}: parsed ${points.length} points from CoinGecko (~${series.approxCandleWidthDays}d candles)`
  );
  return series;
}
