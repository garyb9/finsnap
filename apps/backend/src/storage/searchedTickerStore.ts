import type { Pool } from 'pg';
import { createLogger } from '../logger';
import type { AssetSpec } from '../config';

const log = createLogger('storage:searched-tickers');

export interface SearchedTickerRow {
  symbol: string;
  spec: AssetSpec;
  expiresAt: number;
}

/**
 * Durable backing for tickers a user pulled into the tracked universe by
 * search — replaces the Redis-backed registry so a searched ticker still
 * survives a restart/redeploy.
 */
export class SearchedTickerStore {
  constructor(private pool: Pool) {}

  async upsert(symbol: string, spec: AssetSpec, expiresAt: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO searched_tickers (symbol, spec, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (symbol) DO UPDATE SET spec = EXCLUDED.spec, expires_at = EXCLUDED.expires_at`,
      [symbol, JSON.stringify(spec), new Date(expiresAt).toISOString()]
    );
  }

  /** Only rows that haven't expired yet. Reads degrade to [] on error. */
  async hydrate(): Promise<SearchedTickerRow[]> {
    try {
      const { rows } = await this.pool.query<{
        symbol: string;
        spec: AssetSpec;
        expires_at: string;
      }>('SELECT symbol, spec, expires_at FROM searched_tickers WHERE expires_at > now()');

      return rows.map((r) => ({
        symbol: r.symbol,
        spec: r.spec,
        expiresAt: new Date(r.expires_at).getTime(),
      }));
    } catch (err) {
      log.warn(`hydrate failed (starting with none restored): ${err}`);
      return [];
    }
  }

  async deleteExpired(): Promise<void> {
    await this.pool.query('DELETE FROM searched_tickers WHERE expires_at <= now()');
  }
}
