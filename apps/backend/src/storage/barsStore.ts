import type { Pool } from 'pg';
import { createLogger } from '../logger';
import type { Bar, BarInterval } from '../collectors/types';

const log = createLogger('storage:bars');

interface BarRow {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Durable OHLCV history. Not folded into `StoragePort` — bars need range queries and bulk upsert. */
export class BarsStore {
  constructor(private pool: Pool) {}

  /** Degrades to [] on error rather than throwing. */
  async getBars(symbol: string, interval: BarInterval): Promise<Bar[]> {
    try {
      const { rows } = await this.pool.query<BarRow>(
        `SELECT time, open, high, low, close, volume
         FROM bars
         WHERE symbol = $1 AND interval = $2
         ORDER BY time ASC`,
        [symbol, interval]
      );

      return rows.map((r) => ({
        time: Number(r.time),
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));
    } catch (err) {
      log.warn(`read failed for ${symbol} ${interval}: ${err}`);
      return [];
    }
  }

  /** Bulk upsert in one round trip; prunes rows older than `retentionCutoffMs` when given. */
  async upsertBars(
    symbol: string,
    interval: BarInterval,
    bars: Bar[],
    retentionCutoffMs?: number
  ): Promise<void> {
    if (bars.length > 0) {
      await this.pool.query(
        `INSERT INTO bars (symbol, interval, time, open, high, low, close, volume)
         SELECT $1, $2, t, o, h, l, c, v
         FROM unnest($3::bigint[], $4::float8[], $5::float8[], $6::float8[], $7::float8[], $8::float8[])
           AS u(t, o, h, l, c, v)
         ON CONFLICT (symbol, interval, time) DO UPDATE SET
           open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, volume = EXCLUDED.volume`,
        [
          symbol,
          interval,
          bars.map((b) => b.time),
          bars.map((b) => b.open),
          bars.map((b) => b.high),
          bars.map((b) => b.low),
          bars.map((b) => b.close),
          bars.map((b) => b.volume),
        ]
      );
    }

    if (retentionCutoffMs != null) {
      await this.pool.query('DELETE FROM bars WHERE symbol = $1 AND interval = $2 AND time < $3', [
        symbol,
        interval,
        retentionCutoffMs,
      ]);
    }
  }
}
