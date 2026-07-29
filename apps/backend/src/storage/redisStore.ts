import type Redis from 'ioredis';
import { createLogger } from '../logger';
import type { StoragePort } from './types';

const log = createLogger('storage:redis');

/**
 * Redis implementation of the storage port.
 *
 * Reads degrade to null/empty rather than throwing: a snapshot that cannot be
 * read should leave the dashboard showing stale data, not a 500. Writes do
 * throw, because silently losing a report is worse than a failed job that gets
 * retried and logged.
 */
export class RedisStorage implements StoragePort {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      log.warn(`read failed for ${key}: ${err}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async listPush(key: string, value: string): Promise<void> {
    await this.redis.lpush(key, value);
  }

  async listRange(key: string, limit: number): Promise<string[]> {
    try {
      return await this.redis.lrange(key, 0, limit - 1);
    } catch (err) {
      log.warn(`list read failed for ${key}: ${err}`);
      return [];
    }
  }

  async listTrim(key: string, max: number): Promise<void> {
    await this.redis.ltrim(key, 0, max - 1);
  }

  async listLength(key: string): Promise<number> {
    try {
      return await this.redis.llen(key);
    } catch {
      return 0;
    }
  }
}
