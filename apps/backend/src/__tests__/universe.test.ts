import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetClass, AssetCategory, type AssetSpec, type Config } from '../config';
import { BarInterval } from '../constants/enums';
import type { SearchedTickerStore } from '../storage/searchedTickerStore';
import type { BarsStore } from '../storage/barsStore';

const fetchSeries = vi.fn();

vi.mock('../collectors/bars', () => ({
  BarCollector: vi.fn().mockImplementation(() => ({ fetchSeries })),
}));

import { InvalidTickerError, TickerNotFoundError, UniverseRegistry } from '../universe/registry';

function makeConfig(): Config {
  return {
    universe: [
      {
        symbol: 'SPY',
        label: 'SPY',
        name: 'SPDR S&P 500 ETF Trust',
        shortName: 'S&P 500',
        assetClass: AssetClass.Equity,
        category: AssetCategory.EquityIndex,
        periodsPerYear: 252,
        hasOptions: true,
      },
    ],
  } as Config;
}

/** Minimal in-memory double for the searched-ticker registry's Postgres store. */
function makeSearchedTickerStore(): SearchedTickerStore {
  const store = new Map<string, { spec: AssetSpec; expiresAt: number }>();

  return {
    async upsert(symbol: string, spec: AssetSpec, expiresAt: number) {
      store.set(symbol, { spec, expiresAt });
    },
    async hydrate() {
      return Array.from(store.entries())
        .filter(([, v]) => v.expiresAt > Date.now())
        .map(([symbol, v]) => ({ symbol, spec: v.spec, expiresAt: v.expiresAt }));
    },
    async deleteExpired() {
      for (const [symbol, v] of store) {
        if (v.expiresAt <= Date.now()) store.delete(symbol);
      }
    },
  } as unknown as SearchedTickerStore;
}

/** BarCollector is mocked above, so this never gets touched — a stand-in satisfies the constructor. */
function makeBarsStore(): BarsStore {
  return {} as unknown as BarsStore;
}

describe('UniverseRegistry', () => {
  beforeEach(() => {
    fetchSeries.mockReset();
  });

  it('rejects an empty or malformed symbol without touching the network', async () => {
    const registry = new UniverseRegistry(makeConfig(), makeSearchedTickerStore(), makeBarsStore());
    await expect(registry.search('')).rejects.toThrow(InvalidTickerError);
    await expect(registry.search('not a ticker!')).rejects.toThrow(InvalidTickerError);
    expect(fetchSeries).not.toHaveBeenCalled();
  });

  it('returns the existing spec for a symbol already in the base universe, with no expiry', async () => {
    const registry = new UniverseRegistry(makeConfig(), makeSearchedTickerStore(), makeBarsStore());
    const { spec, expiresAt } = await registry.search('spy');

    expect(spec.symbol).toBe('SPY');
    expect(expiresAt).toBeNull();
    expect(fetchSeries).not.toHaveBeenCalled();
  });

  it('rejects a symbol Yahoo has no bars for', async () => {
    fetchSeries.mockResolvedValue(null);
    const registry = new UniverseRegistry(makeConfig(), makeSearchedTickerStore(), makeBarsStore());

    await expect(registry.search('BOGUS')).rejects.toThrow(TickerNotFoundError);
  });

  it('adds a valid new ticker to config.universe, tagged with an expiry', async () => {
    fetchSeries.mockResolvedValue({
      symbol: 'NVDA',
      interval: BarInterval.Daily,
      bars: [{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      fetchedAt: Date.now(),
    });
    const config = makeConfig();
    const registry = new UniverseRegistry(config, makeSearchedTickerStore(), makeBarsStore());

    const { spec, expiresAt } = await registry.search('nvda');

    expect(spec.symbol).toBe('NVDA');
    expect(spec.hasOptions).toBe(true);
    expect(expiresAt).not.toBeNull();
    expect(config.universe.map((s) => s.symbol)).toEqual(['SPY', 'NVDA']);
  });

  it('classifies a -USD pair as crypto with no options', async () => {
    fetchSeries.mockResolvedValue({
      symbol: 'ETH-USD',
      interval: BarInterval.Daily,
      bars: [{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      fetchedAt: Date.now(),
    });
    const config = makeConfig();
    const registry = new UniverseRegistry(config, makeSearchedTickerStore(), makeBarsStore());

    const { spec } = await registry.search('ETH-USD');

    expect(spec.assetClass).toBe(AssetClass.Crypto);
    expect(spec.hasOptions).toBe(false);
    expect(spec.label).toBe('ETH');
  });

  it('restores a searched ticker from storage on hydrate, before it expires', async () => {
    fetchSeries.mockResolvedValue({
      symbol: 'NVDA',
      interval: BarInterval.Daily,
      bars: [{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      fetchedAt: Date.now(),
    });
    const searchedTickerStore = makeSearchedTickerStore();
    const config = makeConfig();
    const first = new UniverseRegistry(config, searchedTickerStore, makeBarsStore());
    await first.search('NVDA');

    // A fresh process, same store and a fresh base config.
    const restarted = makeConfig();
    const second = new UniverseRegistry(restarted, searchedTickerStore, makeBarsStore());
    await second.start();
    second.stop();

    expect(restarted.universe.map((s) => s.symbol)).toEqual(['SPY', 'NVDA']);
  });
});
