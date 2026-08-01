import { describe, it, expect } from 'vitest';
import { adl, cmf, mfi, obv } from '../backtest/indicators';
import {
  adlTrend,
  cmfTrend,
  mfiReversion,
  obvTrend,
  volumeConfirmedBreakout,
} from '../backtest/strategies/volume';
import { donchianBreakout } from '../backtest/strategies/breakout';
import {
  barsFromOhlc,
  barsFromCloses,
  oscillatingCloses,
  risingCloses,
  withVolume,
} from './helpers/bars';

describe('obv', () => {
  it('adds volume on an up close, subtracts on a down close, holds on a flat one', () => {
    const bars = barsFromOhlc([
      { open: 10, close: 10 },
      { open: 10, close: 12 },
      { open: 12, close: 11 },
      { open: 11, close: 11 },
      { open: 11, close: 13 },
    ]);
    expect(obv(bars)).toEqual([0, 1000, 0, 0, 1000]);
  });
});

describe('adl and cmf', () => {
  // Bar 1 closes at its own high (multiplier +1), bar 2 at its own low
  // (multiplier -1), bar 3 has no range at all (multiplier 0) — the three
  // corners of the money-flow-multiplier formula.
  const bars = barsFromOhlc([
    { open: 10, close: 14 },
    { open: 14, close: 10 },
    { open: 10, close: 10 },
  ]);

  it('accumulates money flow volume', () => {
    expect(adl(bars)).toEqual([1000, 0, 0]);
  });

  it('nets a full up bar against a full down bar to zero', () => {
    const flow = cmf(bars, 3);
    expect(flow[2]).toBeCloseTo(0, 6);
  });
});

describe('mfi', () => {
  it('reads near zero after two straight bars of declining typical price', () => {
    const bars = barsFromOhlc([
      { open: 10, close: 14 },
      { open: 14, close: 10 },
      { open: 10, close: 10 },
    ]);
    const flow = mfi(bars, 2);
    expect(flow[2]).toBeCloseTo(0, 6);
  });

  it('stays inside 0-100 over an oscillating series', () => {
    const bars = barsFromCloses(oscillatingCloses(200, 100, 15, 30));
    const flow = mfi(bars, 14).filter(Number.isFinite);
    expect(flow.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
});

describe('volume-flow trend strategies', () => {
  it('obv and adl trend hold a steadily rising market', () => {
    const bars = barsFromCloses(risingCloses(60, 100, 1));
    expect(obvTrend(20).signals(bars).at(-1)).toBe(1);
    expect(adlTrend(20).signals(bars).at(-1)).toBe(1);
  });

  it('obv and adl trend go flat in a steadily falling market', () => {
    const bars = barsFromCloses(risingCloses(60, 100, 1).reverse());
    expect(obvTrend(20).signals(bars).at(-1)).toBe(0);
    expect(adlTrend(20).signals(bars).at(-1)).toBe(0);
  });

  it('cmf trend holds a steadily rising market and goes flat in a falling one', () => {
    const rising = barsFromCloses(risingCloses(60, 100, 1));
    const falling = barsFromCloses(risingCloses(60, 100, 1).reverse());
    expect(cmfTrend(20, 0).signals(rising).at(-1)).toBe(1);
    expect(cmfTrend(20, 0).signals(falling).at(-1)).toBe(0);
  });
});

describe('mfi reversion', () => {
  it('trades an oscillating market rather than sitting in one position', () => {
    const bars = barsFromCloses(oscillatingCloses(400, 100, 15, 30));
    const signals = mfiReversion(14, 20, 80).signals(bars);
    expect(new Set(signals.slice(60)).size).toBe(2);
  });
});

describe('volume-confirmed breakout', () => {
  it('never enters a clean breakout if volume never varies from its own average', () => {
    // Plain Donchian breakout enters this series immediately — the gate is
    // the only thing that can be holding this one flat.
    const bars = barsFromCloses(risingCloses(60, 100, 1));
    expect(donchianBreakout(20, 10).signals(bars).at(-1)).toBe(1);
    expect(volumeConfirmedBreakout(20, 10, 20, 1).signals(bars).every((s) => s === 0)).toBe(true);
  });

  it('enters once a breakout bar actually comes on a volume spike', () => {
    const closes = risingCloses(60, 100, 1);
    const volumes = closes.map((_, i) => 900 + (i % 3) * 100); // mild, varying baseline
    volumes[50] = 10_000; // a clear spike well after warmup
    const bars = withVolume(barsFromCloses(closes), volumes);

    expect(volumeConfirmedBreakout(20, 10, 20, 1).signals(bars).at(-1)).toBe(1);
  });
});
