import { createLogger } from '../logger';
import {
  REDIS_KEYS,
  SNAP_HISTORY_MAX,
  SNAP_LATEST_TTL_SECONDS,
  SNAP_TTL_SECONDS,
} from '../constants';
import type { FinSnap } from '../snapshot/types';
import type { StoragePort } from './types';

const log = createLogger('snap-store');

/** Persistence for live snapshots. See `ReportStore` on why this takes a port. */
export class SnapStore {
  constructor(private storage: StoragePort) {}

  async saveSnap(snap: FinSnap): Promise<void> {
    const json = JSON.stringify(snap);
    try {
      await this.storage.set(`${REDIS_KEYS.snap}:${snap.id}`, json, SNAP_TTL_SECONDS);
      await this.storage.set(REDIS_KEYS.snapLatest, json, SNAP_LATEST_TTL_SECONDS);
      await this.storage.listPush(REDIS_KEYS.snapHistory, snap.id);
      await this.storage.listTrim(REDIS_KEYS.snapHistory, SNAP_HISTORY_MAX);
      log.info(`saved snap ${snap.id}`);
    } catch (err) {
      log.error(`failed to save snap ${snap.id}: ${err}`);
      throw err;
    }
  }

  async getLatest(): Promise<FinSnap | null> {
    return this.read(REDIS_KEYS.snapLatest);
  }

  async getById(id: string): Promise<FinSnap | null> {
    return this.read(`${REDIS_KEYS.snap}:${id}`);
  }

  async getHistory(limit = 10): Promise<FinSnap[]> {
    const ids = await this.storage.listRange(REDIS_KEYS.snapHistory, limit);
    const snaps = await Promise.all(ids.map((id) => this.getById(id)));
    return snaps.filter((s): s is FinSnap => s !== null);
  }

  async count(): Promise<number> {
    return this.storage.listLength(REDIS_KEYS.snapHistory);
  }

  private async read(key: string): Promise<FinSnap | null> {
    const raw = await this.storage.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as FinSnap;
    } catch (err) {
      log.warn(`failed to parse snap at ${key}: ${err}`);
      return null;
    }
  }
}
