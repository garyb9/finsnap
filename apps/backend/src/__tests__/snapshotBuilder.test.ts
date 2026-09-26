import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '../config';
import { AssetClass } from '../config';
import type { Bar, OptionsData, SymbolBars } from '../collectors/types';
import type { OptionsStore } from '../storage/optionsStore';
import type { BarsStore } from '../storage/barsStore';

const DAY_MS = 86_400_000;
const START = Date.UTC(2024, 0, 1);

/** A rising daily bar series long enough for every indicator to warm up. */
function makeBars(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + i;
    return { time: START + i * DAY_MS, open: close, high: close + 1, low: close - 1, close };
  });
}

const OPTIONS: OptionsData = {
  ticker: 'SPY',
  price: 100,
  fetchedAt: Date.now(),
  chains: [
    {
      expiration: '2026-04-17',
      calls: [
        { strike: 100, volume: 1000, openInterest: 5000 },
        { strike: 105, volume: 200, openInterest: 1000 },
      ],
      puts: [
        { strike: 100, volume: 800, openInterest: 4000 },
        { strike: 95, volume: 300, openInterest: 900 },
      ],
    },
  ],
};

vi.mock('../collectors/options', () => ({
  fetchOptionsData: vi.fn(async () => OPTIONS),
}));

vi.mock('../collectors/quote', () => ({
  fetchAssetSizes: vi.fn(async () => new Map()),
}));

const fetchSymbol = vi.fn(
  async (): Promise<SymbolBars> => ({ symbol: 'SPY', daily: makeBars(300), hourly: null })
);

vi.mock('../collectors/bars', () => ({
  BarCollector: class {
    fetchSymbol = fetchSymbol;
  },
}));

const { SnapBuilder } = await import('../snapshot/builder');

function fakeConfig(): Config {
  return {
    universe: [
      {
        symbol: 'SPY',
        label: 'SPY',
        assetClass: AssetClass.Equity,
        hasOptions: true,
        searched: false,
      },
    ],
  } as unknown as Config;
}

const emptyStore = {} as unknown as OptionsStore;
const emptyBars = {} as unknown as BarsStore;

describe('SnapBuilder options strike profile', () => {
  beforeEach(() => {
    fetchSymbol.mockClear();
  });

  it('attaches a per-strike profile summed across expiries to the snap', async () => {
    const snap = await new SnapBuilder(fakeConfig(), emptyBars, emptyStore).build();
    const options = snap.assets.SPY.options;

    expect(options).toBeDefined();
    expect(options!.strikeProfile).toEqual([
      { strike: 95, callVolume: 0, putVolume: 300, callOI: 0, putOI: 900, total: 1200 },
      { strike: 100, callVolume: 1000, putVolume: 800, callOI: 5000, putOI: 4000, total: 10800 },
      { strike: 105, callVolume: 200, putVolume: 0, callOI: 1000, putOI: 0, total: 1200 },
    ]);
  });

  it('keeps the profile sorted ascending by strike', async () => {
    const snap = await new SnapBuilder(fakeConfig(), emptyBars, emptyStore).build();
    const strikes = snap.assets.SPY.options!.strikeProfile.map((r) => r.strike);
    expect(strikes).toEqual([...strikes].sort((a, b) => a - b));
  });
});
