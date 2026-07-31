import type { Pool } from 'pg';
import { DAY_MS, OPTION_SNAPSHOT_RETENTION_DAYS } from '../constants';
import type { OptionsData } from '../collectors/types';

export interface SnapshotRow {
  ticker: string;
  expiration: string;
  side: 'call' | 'put';
  strike: number;
  snapshotDate: string;
  volume: number;
  openInterest: number;
}

/** Flattens one options-chain fetch into per-contract rows for a given day. */
export function flattenOptionsSnapshot(data: OptionsData, snapshotDate: string): SnapshotRow[] {
  const rows: SnapshotRow[] = [];

  for (const chain of data.chains) {
    for (const contract of chain.calls) {
      rows.push({
        ticker: data.ticker,
        expiration: chain.expiration,
        side: 'call',
        strike: contract.strike,
        snapshotDate,
        volume: contract.volume,
        openInterest: contract.openInterest,
      });
    }
    for (const contract of chain.puts) {
      rows.push({
        ticker: data.ticker,
        expiration: chain.expiration,
        side: 'put',
        strike: contract.strike,
        snapshotDate,
        volume: contract.volume,
        openInterest: contract.openInterest,
      });
    }
  }

  return rows;
}

function utcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Daily archive of options-chain snapshots — collection only, nothing reads
 * it yet. `snapshot_date` (not the fetch timestamp) is part of the row key so
 * repeated same-day fetches overwrite rather than accumulate.
 */
export class OptionsStore {
  constructor(private pool: Pool) {}

  async upsertSnapshot(data: OptionsData): Promise<void> {
    const snapshotDate = utcDateString(data.fetchedAt);
    const rows = flattenOptionsSnapshot(data, snapshotDate);

    if (rows.length > 0) {
      await this.pool.query(
        `INSERT INTO option_snapshots
           (ticker, expiration, side, strike, snapshot_date, volume, open_interest, underlying_price, fetched_at)
         SELECT $1, e, s, st, $2, v, oi, $3, $4
         FROM unnest($5::date[], $6::text[], $7::float8[], $8::integer[], $9::integer[])
           AS u(e, s, st, v, oi)
         ON CONFLICT (ticker, expiration, side, strike, snapshot_date) DO UPDATE SET
           volume = EXCLUDED.volume,
           open_interest = EXCLUDED.open_interest,
           underlying_price = EXCLUDED.underlying_price,
           fetched_at = EXCLUDED.fetched_at`,
        [
          data.ticker,
          snapshotDate,
          data.price,
          new Date(data.fetchedAt).toISOString(),
          rows.map((r) => r.expiration),
          rows.map((r) => r.side),
          rows.map((r) => r.strike),
          rows.map((r) => r.volume),
          rows.map((r) => r.openInterest),
        ]
      );
    }

    const cutoff = utcDateString(Date.now() - OPTION_SNAPSHOT_RETENTION_DAYS * DAY_MS);
    await this.pool.query('DELETE FROM option_snapshots WHERE ticker = $1 AND snapshot_date < $2', [
      data.ticker,
      cutoff,
    ]);
  }
}
