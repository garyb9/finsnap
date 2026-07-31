import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { SearchedTickerStore } from '../storage/searchedTickerStore';
import { AssetCategory, AssetClass } from '../constants/enums';
import type { AssetSpec } from '../config';

function makePool(): { pool: Pool; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { pool: { query } as unknown as Pool, query };
}

function makeSpec(): AssetSpec {
  return {
    symbol: 'NVDA',
    label: 'NVDA',
    name: 'NVIDIA Corporation',
    shortName: 'NVIDIA',
    assetClass: AssetClass.Equity,
    category: AssetCategory.Stock,
    periodsPerYear: 252,
    hasOptions: true,
    searched: true,
  };
}

describe('SearchedTickerStore', () => {
  it('upserts a symbol as JSON with an ISO expiry', async () => {
    const { pool, query } = makePool();
    const store = new SearchedTickerStore(pool);
    const expiresAt = Date.UTC(2026, 6, 16);

    await store.upsert('NVDA', makeSpec(), expiresAt);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (symbol) DO UPDATE');
    expect(params[0]).toBe('NVDA');
    expect(JSON.parse(params[1])).toMatchObject({ symbol: 'NVDA' });
    expect(params[2]).toBe(new Date(expiresAt).toISOString());
  });

  it('hydrates only non-expired rows, converting expires_at back to a timestamp', async () => {
    const { pool, query } = makePool();
    const isoExpiry = '2026-07-16T00:00:00.000Z';
    query.mockResolvedValueOnce({
      rows: [{ symbol: 'NVDA', spec: makeSpec(), expires_at: isoExpiry }],
    });
    const store = new SearchedTickerStore(pool);

    const rows = await store.hydrate();

    expect(query.mock.calls[0][0]).toContain('WHERE expires_at > now()');
    expect(rows).toEqual([
      { symbol: 'NVDA', spec: makeSpec(), expiresAt: new Date(isoExpiry).getTime() },
    ]);
  });

  it('degrades to [] on a hydrate error rather than throwing', async () => {
    const { pool, query } = makePool();
    query.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const store = new SearchedTickerStore(pool);

    expect(await store.hydrate()).toEqual([]);
  });

  it('deletes expired rows', async () => {
    const { pool, query } = makePool();
    const store = new SearchedTickerStore(pool);

    await store.deleteExpired();

    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM searched_tickers'));
  });
});
