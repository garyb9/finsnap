import type { Pool } from 'pg';
import { createLogger } from '../logger';
import type { StoragePort } from './types';

const log = createLogger('storage:postgres');

/**
 * Postgres implementation of `StoragePort`, backed by `kv_entries`/
 * `kv_list_entries`. Postgres has no native per-row TTL, so `set` prunes
 * expired rows on write instead of needing a separate cron.
 *
 * Reads degrade to null/empty rather than throwing; writes throw.
 */
export class PostgresStorage implements StoragePort {
  constructor(private pool: Pool) {}

  async get(key: string): Promise<string | null> {
    try {
      const { rows } = await this.pool.query<{ value: string }>(
        'SELECT value FROM kv_entries WHERE key = $1 AND expires_at > now()',
        [key]
      );
      return rows[0]?.value ?? null;
    } catch (err) {
      log.warn(`read failed for ${key}: ${err}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO kv_entries (key, value, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [key, value, ttlSeconds]
    );
    await this.pool.query('DELETE FROM kv_entries WHERE expires_at <= now()');
  }

  async listPush(key: string, value: string): Promise<void> {
    await this.pool.query('INSERT INTO kv_list_entries (key, value) VALUES ($1, $2)', [key, value]);
  }

  async listRange(key: string, limit: number): Promise<string[]> {
    try {
      const { rows } = await this.pool.query<{ value: string }>(
        'SELECT value FROM kv_list_entries WHERE key = $1 ORDER BY id DESC LIMIT $2',
        [key, limit]
      );
      return rows.map((r) => r.value);
    } catch (err) {
      log.warn(`list read failed for ${key}: ${err}`);
      return [];
    }
  }

  async listTrim(key: string, max: number): Promise<void> {
    await this.pool.query(
      `DELETE FROM kv_list_entries
       WHERE key = $1 AND id NOT IN (
         SELECT id FROM kv_list_entries WHERE key = $1 ORDER BY id DESC LIMIT $2
       )`,
      [key, max]
    );
  }

  async listLength(key: string): Promise<number> {
    try {
      const { rows } = await this.pool.query<{ count: string }>(
        'SELECT count(*) FROM kv_list_entries WHERE key = $1',
        [key]
      );
      return Number(rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }
}
