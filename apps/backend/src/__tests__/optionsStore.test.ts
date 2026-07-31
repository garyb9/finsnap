import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { flattenOptionsSnapshot, OptionsStore } from '../storage/optionsStore';
import type { OptionsData } from '../collectors/types';

function makeData(overrides: Partial<OptionsData> = {}): OptionsData {
  return {
    ticker: 'IBIT',
    price: 55.25,
    fetchedAt: Date.UTC(2026, 6, 15, 12, 0, 0),
    chains: [
      {
        expiration: '2026-08-01',
        calls: [
          { strike: 50, volume: 1000, openInterest: 5000 },
          { strike: 55, volume: 2500, openInterest: 8000 },
        ],
        puts: [{ strike: 50, volume: 800, openInterest: 3000 }],
      },
      {
        expiration: '2026-09-01',
        calls: [{ strike: 60, volume: 300, openInterest: 1500 }],
        puts: [],
      },
    ],
    ...overrides,
  };
}

describe('flattenOptionsSnapshot', () => {
  it('produces one row per contract across every chain', () => {
    const rows = flattenOptionsSnapshot(makeData(), '2026-07-15');
    // 2 calls + 1 put (chain 1) + 1 call + 0 puts (chain 2) = 4
    expect(rows).toHaveLength(4);
  });

  it('tags each row with the correct side', () => {
    const rows = flattenOptionsSnapshot(makeData(), '2026-07-15');
    expect(rows.filter((r) => r.side === 'call')).toHaveLength(3);
    expect(rows.filter((r) => r.side === 'put')).toHaveLength(1);
  });

  it('carries the ticker, expiration, snapshot date and contract fields through', () => {
    const rows = flattenOptionsSnapshot(makeData(), '2026-07-15');
    const row = rows.find((r) => r.side === 'put')!;

    expect(row.ticker).toBe('IBIT');
    expect(row.expiration).toBe('2026-08-01');
    expect(row.snapshotDate).toBe('2026-07-15');
    expect(row.strike).toBe(50);
    expect(row.volume).toBe(800);
    expect(row.openInterest).toBe(3000);
  });

  it('returns an empty array for a chain with no contracts', () => {
    const rows = flattenOptionsSnapshot(makeData({ chains: [] }), '2026-07-15');
    expect(rows).toEqual([]);
  });
});

describe('OptionsStore.upsertSnapshot', () => {
  function makePool(): { pool: Pool; query: ReturnType<typeof vi.fn> } {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    return { pool: { query } as unknown as Pool, query };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('upserts every contract row keyed by the UTC date of fetchedAt', async () => {
    const { pool, query } = makePool();
    const store = new OptionsStore(pool);
    const data = makeData();

    await store.upsertSnapshot(data);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO option_snapshots');
    expect(sql).toContain('ON CONFLICT (ticker, expiration, side, strike, snapshot_date)');
    expect(params[0]).toBe('IBIT');
    expect(params[1]).toBe('2026-07-15'); // UTC date of fetchedAt
    expect(params[2]).toBe(55.25);
  });

  it('prunes rows for this ticker older than the 30-day retention window, relative to now', async () => {
    // Retention tracks wall-clock time, not the fetch's own timestamp — a
    // snapshot fetched late (or backfilled) still gets pruned on the real
    // current date, so fake the clock rather than relying on `fetchedAt`.
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 6, 15, 12, 0, 0));

    const { pool, query } = makePool();
    const store = new OptionsStore(pool);

    await store.upsertSnapshot(makeData());

    const pruneCall = query.mock.calls.find(([sql]) =>
      sql.includes('DELETE FROM option_snapshots')
    );
    expect(pruneCall).toBeDefined();
    const [, params] = pruneCall!;
    expect(params[0]).toBe('IBIT');
    // 2026-07-15 minus 30 days = 2026-06-15
    expect(params[1]).toBe('2026-06-15');
  });

  it('still prunes when the chain has no contracts to upsert', async () => {
    const { pool, query } = makePool();
    const store = new OptionsStore(pool);

    await store.upsertSnapshot(makeData({ chains: [] }));

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM option_snapshots');
  });
});
