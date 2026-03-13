import type Redis from 'ioredis';
import { createLogger } from '../logger';
import type { FinSnap } from '../snapshot/types';

const log = createLogger('snap-store');

const HISTORY_MAX = 100;
const SNAP_TTL = 86400; // 24h for individual snaps
const LATEST_TTL = 7200; // 2h for latest snap

export class SnapStore {
  constructor(private redis: Redis) {}

  async saveSnap(snap: FinSnap): Promise<void> {
    const json = JSON.stringify(snap);
    try {
      await this.redis.set(`snap:${snap.id}`, json, 'EX', SNAP_TTL);
      await this.redis.set('snap:latest', json, 'EX', LATEST_TTL);
      await this.redis.lpush('snap:history', snap.id);
      await this.redis.ltrim('snap:history', 0, HISTORY_MAX - 1);
      log.info(`saved snap ${snap.id}`);
    } catch (err) {
      log.error(`failed to save snap ${snap.id}: ${err}`);
      throw err;
    }
  }

  async getLatest(): Promise<FinSnap | null> {
    try {
      const raw = await this.redis.get('snap:latest');
      return raw ? (JSON.parse(raw) as FinSnap) : null;
    } catch (err) {
      log.warn(`failed to get latest snap: ${err}`);
      return null;
    }
  }

  async getById(id: string): Promise<FinSnap | null> {
    try {
      const raw = await this.redis.get(`snap:${id}`);
      return raw ? (JSON.parse(raw) as FinSnap) : null;
    } catch (err) {
      log.warn(`failed to get snap ${id}: ${err}`);
      return null;
    }
  }

  async getHistory(limit = 10): Promise<FinSnap[]> {
    try {
      const ids = await this.redis.lrange('snap:history', 0, limit - 1);
      const snaps = await Promise.all(ids.map((id) => this.getById(id)));
      return snaps.filter((s): s is FinSnap => s !== null);
    } catch (err) {
      log.warn(`failed to get snap history: ${err}`);
      return [];
    }
  }

  async count(): Promise<number> {
    try {
      return await this.redis.llen('snap:history');
    } catch {
      return 0;
    }
  }
}
