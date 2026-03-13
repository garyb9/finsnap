import type Redis from 'ioredis';
import { createLogger } from '../logger';
import { fetchEthPrice } from './coingecko';

const log = createLogger('price-cache');

const REDIS_KEY = 'finsnap:eth-price';
const STALENESS_MS = 10 * 60 * 1000; // 10 minutes
const TTL_SECONDS = 3600; // 1 hour Redis TTL

interface CachedPrice {
  price: number;
  fetchedAt: number;
}

export class PriceCache {
  constructor(private redis: Redis) {}

  async getEthPriceUsd(): Promise<number> {
    const cached = await this.loadFromRedis();

    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      if (age < STALENESS_MS) {
        log.info(`ETH price cached: $${cached.price} (${Math.round(age / 1000)}s old)`);
        return cached.price;
      }
      log.info(`ETH price stale (${Math.round(age / 1000)}s old), refreshing...`);
    }

    const price = await fetchEthPrice();
    if (price !== null) {
      await this.saveToRedis(price);
      log.info(`ETH price fetched: $${price}`);
      return price;
    }

    // Fallback to stale cache if available
    if (cached) {
      log.warn(`using stale ETH price: $${cached.price}`);
      return cached.price;
    }

    log.warn('ETH price unavailable, using 0');
    return 0;
  }

  private async loadFromRedis(): Promise<CachedPrice | null> {
    try {
      const raw = await this.redis.get(REDIS_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CachedPrice;
    } catch (err) {
      log.warn(`redis read failed: ${err}`);
      return null;
    }
  }

  private async saveToRedis(price: number): Promise<void> {
    try {
      const entry: CachedPrice = { price, fetchedAt: Date.now() };
      await this.redis.set(REDIS_KEY, JSON.stringify(entry), 'EX', TTL_SECONDS);
    } catch (err) {
      log.warn(`redis write failed: ${err}`);
    }
  }
}
