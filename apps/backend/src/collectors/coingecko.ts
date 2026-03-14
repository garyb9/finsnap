import { createLogger } from '../logger';
import type { EthPriceHistory, PricePoint, VolumePoint } from './types';

const log = createLogger('coingecko');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const ETH_COIN_ID = 'ethereum';
const BTC_COIN_ID = 'bitcoin';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 6_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    if (res.ok) return res.json();

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
      log.warn(`rate limited, retrying in ${backoff / 1000}s...`);
      await wait(backoff);
      continue;
    }

    const body = await res.text();
    log.warn(`request failed (${res.status}): ${body} — skipping`);
    return null;
  }

  log.warn('max retries exceeded — skipping');
  return null;
}

/** Fetch current ETH price in USD using the simple price endpoint */
export async function fetchEthPrice(): Promise<number | null> {
  const url = `${COINGECKO_BASE}/simple/price?ids=${ETH_COIN_ID}&vs_currencies=usd`;
  const data = (await fetchWithRetry(url)) as Record<string, Record<string, number>> | null;
  if (!data) return null;
  return data?.[ETH_COIN_ID]?.usd ?? null;
}

/** Fetch current BTC price in USD using the simple price endpoint */
export async function fetchBtcPrice(): Promise<number | null> {
  const url = `${COINGECKO_BASE}/simple/price?ids=${BTC_COIN_ID}&vs_currencies=usd`;
  const data = (await fetchWithRetry(url)) as Record<string, Record<string, number>> | null;
  if (!data) return null;
  return data?.[BTC_COIN_ID]?.usd ?? null;
}

/** Fetch ETH price/volume history for the last N days (hourly granularity for days > 1). */
export async function fetchEthHistory(days: number): Promise<EthPriceHistory | null> {
  const url = `${COINGECKO_BASE}/coins/${ETH_COIN_ID}/market_chart?vs_currency=usd&days=${days}`;
  const data = (await fetchWithRetry(url)) as {
    prices: [number, number][];
    total_volumes: [number, number][];
  } | null;
  if (!data) return null;

  const prices: PricePoint[] = data.prices.map(([ts, price]) => ({ timestamp: ts, price }));
  const volumes: VolumePoint[] = data.total_volumes.map(([ts, volume]) => ({
    timestamp: ts,
    volume,
  }));

  log.info(`ETH ${days}d history: ${prices.length} price points`);
  return { prices, volumes };
}

/** Fetch BTC price/volume history for the last N days (hourly granularity for days > 1). */
export async function fetchBtcHistory(days: number): Promise<EthPriceHistory | null> {
  const url = `${COINGECKO_BASE}/coins/${BTC_COIN_ID}/market_chart?vs_currency=usd&days=${days}`;
  const data = (await fetchWithRetry(url)) as {
    prices: [number, number][];
    total_volumes: [number, number][];
  } | null;
  if (!data) return null;

  const prices: PricePoint[] = data.prices.map(([ts, price]) => ({ timestamp: ts, price }));
  const volumes: VolumePoint[] = data.total_volumes.map(([ts, volume]) => ({
    timestamp: ts,
    volume,
  }));

  log.info(`BTC ${days}d history: ${prices.length} price points`);
  return { prices, volumes };
}

/**
 * Fetch last 24h with 5-min granularity by using explicit from/to range.
 * CoinGecko returns 5-min data when the range is ≤ 1 day with explicit timestamps.
 */
export async function fetchEthHistoryLast24h(): Promise<EthPriceHistory | null> {
  const toSec = Math.floor(Date.now() / 1000);
  const fromSec = toSec - 24 * 3600;
  const url = `${COINGECKO_BASE}/coins/${ETH_COIN_ID}/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`;

  const data = (await fetchWithRetry(url)) as {
    prices: [number, number][];
    total_volumes: [number, number][];
  } | null;
  if (!data) return null;

  const prices: PricePoint[] = data.prices.map(([ts, price]) => ({ timestamp: ts, price }));
  const volumes: VolumePoint[] = data.total_volumes.map(([ts, volume]) => ({
    timestamp: ts,
    volume,
  }));

  log.info(`ETH last 24h: ${prices.length} price points (5m expected ~288)`);
  return { prices, volumes };
}

/**
 * Fetch BTC last 24h with 5-min granularity by using explicit from/to range.
 * CoinGecko returns 5-min data when the range is ≤ 1 day with explicit timestamps.
 */
export async function fetchBtcHistoryLast24h(): Promise<EthPriceHistory | null> {
  const toSec = Math.floor(Date.now() / 1000);
  const fromSec = toSec - 24 * 3600;
  const url = `${COINGECKO_BASE}/coins/${BTC_COIN_ID}/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`;

  const data = (await fetchWithRetry(url)) as {
    prices: [number, number][];
    total_volumes: [number, number][];
  } | null;
  if (!data) return null;

  const prices: PricePoint[] = data.prices.map(([ts, price]) => ({ timestamp: ts, price }));
  const volumes: VolumePoint[] = data.total_volumes.map(([ts, volume]) => ({
    timestamp: ts,
    volume,
  }));

  log.info(`BTC last 24h: ${prices.length} price points (5m expected ~288)`);
  return { prices, volumes };
}
