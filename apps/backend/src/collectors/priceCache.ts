import { hoursToMilliseconds, minutesToMilliseconds } from 'date-fns';
import type Redis from 'ioredis';
import { createLogger } from '../logger';
import {
  fetchEthHistory,
  fetchEthHistoryLast24h,
  fetchBtcHistory,
  fetchBtcHistoryLast24h,
} from './coingecko';
import type { AssetPriceDataSet, AssetPriceCachedBucket } from './types';

const log = createLogger('price-cache');

/**
 * Staleness thresholds: how old a cached bucket can be before we re-fetch.
 * day1 (5-min data): refresh if stale by 10 minutes
 * day7 / day30 (hourly data): refresh if stale by 24 hours
 */
const STALENESS_MS = {
  day1: minutesToMilliseconds(10),
  day7: hoursToMilliseconds(24),
  day30: hoursToMilliseconds(24),
} as const;

/** Redis TTLs — longer than staleness so we keep warm cache between snaps. */
const REDIS_TTL_SECONDS = {
  day1: 3600, // 1h
  day7: 24 * 3600, // 24h
  day30: 48 * 3600, // 48h
} as const;

type BucketKey = keyof typeof STALENESS_MS;
type AssetSymbol = 'ETH' | 'BTC';

const REDIS_KEY_PREFIX = 'finsnap:prices';

function redisKey(asset: AssetSymbol, bucket: BucketKey): string {
  return `${REDIS_KEY_PREFIX}:${asset}:${bucket}`;
}

const INTER_FETCH_DELAY_MS = 6_000;

function formatAge(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PriceCache {
  constructor(private redis: Redis) {}

  async fetch(asset: AssetSymbol): Promise<AssetPriceDataSet> {
    const result: AssetPriceDataSet = { day1: null, day7: null, day30: null };

    const buckets: BucketKey[] = ['day1', 'day7', 'day30'];

    for (let i = 0; i < buckets.length; i++) {
      const key = buckets[i];
      const cached = await this.loadBucket(asset, key);
      const threshold = STALENESS_MS[key];

      if (cached) {
        const age = Date.now() - cached.fetchedAt;
        if (age < threshold) {
          log.info(`${asset} ${key}: cached (${formatAge(age)} old)`);
          result[key] = cached.data;
          continue;
        }
        log.info(`${asset} ${key}: stale (${formatAge(age)} old), refreshing...`);
      } else {
        log.info(`${asset} ${key}: no cache, fetching...`);
      }

      if (i > 0) await wait(INTER_FETCH_DELAY_MS);

      let data: AssetPriceDataSet['day1'] = null;
      if (asset === 'ETH') {
        data =
          key === 'day1'
            ? await fetchEthHistoryLast24h()
            : await fetchEthHistory(key === 'day7' ? 7 : 30);
      } else if (asset === 'BTC') {
        data =
          key === 'day1'
            ? await fetchBtcHistoryLast24h()
            : await fetchBtcHistory(key === 'day7' ? 7 : 30);
      }

      if (data) {
        const bucket: AssetPriceCachedBucket = { fetchedAt: Date.now(), data };
        await this.saveBucket(asset, key, bucket);
        result[key] = data;
      } else if (cached) {
        log.warn(`${asset} ${key}: fetch failed, using stale cache`);
        result[key] = cached.data;
      }
    }

    return result;
  }

  private async loadBucket(
    asset: AssetSymbol,
    key: BucketKey
  ): Promise<AssetPriceCachedBucket | null> {
    try {
      const raw = await this.redis.get(redisKey(asset, key));
      if (!raw) return null;
      return JSON.parse(raw) as AssetPriceCachedBucket;
    } catch (err) {
      log.warn(`redis read failed for ${asset} ${key}: ${err}`);
      return null;
    }
  }

  private async saveBucket(
    asset: AssetSymbol,
    key: BucketKey,
    bucket: AssetPriceCachedBucket
  ): Promise<void> {
    try {
      await this.redis.set(
        redisKey(asset, key),
        JSON.stringify(bucket),
        'EX',
        REDIS_TTL_SECONDS[key]
      );
    } catch (err) {
      log.warn(`redis write failed for ${asset} ${key}: ${err}`);
    }
  }
}
