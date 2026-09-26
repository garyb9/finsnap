import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { BarsStore } from '../storage/barsStore';
import { BarInterval } from '../constants/enums';

function makePool(): { pool: Pool; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { pool: { query } as unknown as Pool, query };
}

describe('BarsStore', () => {
  it('maps stored rows back into Bar objects, ordered by time', async () => {
    const { pool, query } = makePool();
    query.mockResolvedValueOnce({
      rows: [
        { time: '0', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { time: '86400000', open: 1.5, high: 2.5, low: 1, close: 2, volume: 200 },
      ],
    });
    const store = new BarsStore(pool);

    const bars = await store.getBars('SPY', BarInterval.Daily);

    // pg returns bigint columns as strings — must come back as numbers.
    expect(bars).toEqual([
      { time: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
      { time: 86_400_000, open: 1.5, high: 2.5, low: 1, close: 2, volume: 200 },
    ]);
  });

  it('degrades to [] on a read error rather than throwing', async () => {
    const { pool, query } = makePool();
    query.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const store = new BarsStore(pool);

    expect(await store.getBars('SPY', BarInterval.Daily)).toEqual([]);
  });

  it('upserts every bar in one call via unnest, keyed by symbol/interval', async () => {
    const { pool, query } = makePool();
    const store = new BarsStore(pool);
    const bars = [
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: 86_400_000, open: 2, high: 2, low: 2, close: 2, volume: 2 },
    ];

    await store.upsertBars('SPY', BarInterval.Daily, bars);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO bars');
    expect(sql).toContain('ON CONFLICT (symbol, interval, time)');
    expect(params[0]).toBe('SPY');
    expect(params[1]).toBe(BarInterval.Daily);
    expect(params[2]).toEqual([0, 86_400_000]); // time[]
    expect(params[3]).toEqual([1, 2]); // open[]
  });

  it('skips the insert entirely for an empty batch, but still prunes when a cutoff is given', async () => {
    const { pool, query } = makePool();
    const store = new BarsStore(pool);

    await store.upsertBars('SPY', BarInterval.Hourly, [], 12345);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM bars');
  });

  it('prunes rows older than the retention cutoff in the same call as the upsert', async () => {
    const { pool, query } = makePool();
    const store = new BarsStore(pool);
    const bars = [{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }];

    await store.upsertBars('BTC-USD', BarInterval.FiveMinute, bars, 999);

    expect(query).toHaveBeenCalledTimes(2);
    const deleteCall = query.mock.calls.find(([sql]) => sql.includes('DELETE FROM bars'))!;
    expect(deleteCall[1]).toEqual(['BTC-USD', BarInterval.FiveMinute, 999]);
  });

  it('does not prune when no retention cutoff is given (daily bars, kept forever)', async () => {
    const { pool, query } = makePool();
    const store = new BarsStore(pool);

    await store.upsertBars('SPY', BarInterval.Daily, [
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toContain('DELETE');
  });
});
