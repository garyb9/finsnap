import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Redis from 'ioredis';
import { AssetClass, AssetCategory, type Config } from '../config';
import { BarInterval } from '../constants/enums';

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

/** Minimal Redis double — just what the registry touches. */
function makeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    async set(key: string, value: string, _flag: string, ttl: number) {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return 'OK';
    },
    async get(key: string) {
      const entry = store.get(key);
      return entry ? entry.value : null;
    },
    async ttl(key: string) {
      const entry = store.get(key);
      if (!entry) return -2;
      return Math.round((entry.expiresAt - Date.now()) / 1000);
    },
    async scan(cursor: string, _match: string, _pattern: string, _count: string, _n: number) {
      return cursor === '0' ? ['0', Array.from(store.keys())] : ['0', []];
    },
    __store: store,
  } as unknown as Redis & { __store: typeof store };
}

describe('UniverseRegistry', () => {
  beforeEach(() => {
    fetchSeries.mockReset();
  });

  it('rejects an empty or malformed symbol without touching the network', async () => {
    const registry = new UniverseRegistry(makeConfig(), makeRedis());
    await expect(registry.search('')).rejects.toThrow(InvalidTickerError);
    await expect(registry.search('not a ticker!')).rejects.toThrow(InvalidTickerError);
    expect(fetchSeries).not.toHaveBeenCalled();
  });

  it('returns the existing spec for a symbol already in the base universe, with no expiry', async () => {
    const registry = new UniverseRegistry(makeConfig(), makeRedis());
    const { spec, expiresAt } = await registry.search('spy');

    expect(spec.symbol).toBe('SPY');
    expect(expiresAt).toBeNull();
    expect(fetchSeries).not.toHaveBeenCalled();
  });

  it('rejects a symbol Yahoo has no bars for', async () => {
    fetchSeries.mockResolvedValue(null);
    const registry = new UniverseRegistry(makeConfig(), makeRedis());

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
    const registry = new UniverseRegistry(config, makeRedis());

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
    const registry = new UniverseRegistry(config, makeRedis());

    const { spec } = await registry.search('ETH-USD');

    expect(spec.assetClass).toBe(AssetClass.Crypto);
    expect(spec.hasOptions).toBe(false);
    expect(spec.label).toBe('ETH');
  });

  it('restores a searched ticker from Redis on hydrate, before it expires', async () => {
    fetchSeries.mockResolvedValue({
      symbol: 'NVDA',
      interval: BarInterval.Daily,
      bars: [{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      fetchedAt: Date.now(),
    });
    const redis = makeRedis();
    const config = makeConfig();
    const first = new UniverseRegistry(config, redis);
    await first.search('NVDA');

    // A fresh process, same Redis and a fresh base config.
    const restarted = makeConfig();
    const second = new UniverseRegistry(restarted, redis);
    await second.start();
    second.stop();

    expect(restarted.universe.map((s) => s.symbol)).toEqual(['SPY', 'NVDA']);
  });
});
