import { describe, it, expect } from 'vitest';
import { tsmomScores, tsmomTrend } from '../backtest/strategies/tsmom';
import { STRATEGIES } from '../backtest/strategies';
import { StrategyKind } from '../backtest/types';
import { barsFromCloses, risingCloses } from './helpers/bars';

/** A steady decline, mirroring `risingCloses`. */
function fallingCloses(count: number, start = 300, step = 0.4): number[] {
  return Array.from({ length: count }, (_, i) => start - i * step);
}

/** Flat with small alternating noise — no trend for the score to find. */
function chopCloses(count: number, base = 100): number[] {
  return Array.from({ length: count }, (_, i) => base + (i % 2 === 0 ? 0.4 : -0.4));
}

describe('tsmomScores', () => {
  const LONG = 400;

  it('returns NaN through warm-up rather than a misleading neutral', () => {
    // A 50 would read as "no trend" and be acted on; NaN cannot be.
    const scores = tsmomScores(barsFromCloses(risingCloses(LONG)));
    const warm = scores.findIndex((s) => Number.isFinite(s));

    expect(warm).toBeGreaterThan(60);
    expect(scores.slice(0, warm).every(Number.isNaN)).toBe(true);
  });

  it('stays inside 0-100', () => {
    for (const closes of [risingCloses(LONG), fallingCloses(LONG), chopCloses(LONG)]) {
      const scores = tsmomScores(barsFromCloses(closes)).filter(Number.isFinite);
      expect(scores.every((s) => s >= 0 && s <= 100)).toBe(true);
    }
  });

  it('scores a sustained uptrend above neutral', () => {
    const scores = tsmomScores(barsFromCloses(risingCloses(LONG))).filter(Number.isFinite);
    expect(scores.at(-1)!).toBeGreaterThan(50);
  });

  it('scores a sustained downtrend below neutral', () => {
    const scores = tsmomScores(barsFromCloses(fallingCloses(LONG))).filter(Number.isFinite);
    expect(scores.at(-1)!).toBeLessThan(50);
  });

  it('separates an uptrend from a downtrend by a wide margin', () => {
    const up = tsmomScores(barsFromCloses(risingCloses(LONG)))
      .filter(Number.isFinite)
      .at(-1)!;
    const down = tsmomScores(barsFromCloses(fallingCloses(LONG)))
      .filter(Number.isFinite)
      .at(-1)!;

    expect(up - down).toBeGreaterThan(25);
  });

  it('handles a series shorter than its own warm-up', () => {
    const scores = tsmomScores(barsFromCloses(risingCloses(20)));
    expect(scores).toHaveLength(20);
    expect(scores.every(Number.isNaN)).toBe(true);
  });

  it('returns nothing for an empty series', () => {
    expect(tsmomScores([])).toEqual([]);
  });
});

describe('tsmomTrend', () => {
  it('holds long through a sustained uptrend', () => {
    const signals = tsmomTrend(55).signals(barsFromCloses(risingCloses(400)));
    const settled = signals.slice(200);

    expect(settled.filter((s) => s === 1).length).toBeGreaterThan(settled.length * 0.7);
  });

  it('stays flat through a sustained downtrend', () => {
    const signals = tsmomTrend(55).signals(barsFromCloses(fallingCloses(400)));
    expect(signals.slice(200).every((s) => s === 0)).toBe(true);
  });

  it('emits a signal for every bar', () => {
    const bars = barsFromCloses(risingCloses(300));
    expect(tsmomTrend(55).signals(bars)).toHaveLength(bars.length);
  });

  it('is flat while warming up, never long on unformed data', () => {
    const strategy = tsmomTrend(55);
    const signals = strategy.signals(barsFromCloses(risingCloses(400)));

    expect(signals.slice(0, strategy.warmup).every((s) => s === 0)).toBe(true);
  });

  it('a lower threshold is long at least as often', () => {
    const bars = barsFromCloses(risingCloses(400, 100, 0.15));
    const strict = tsmomTrend(60)
      .signals(bars)
      .filter((s) => s === 1).length;
    const loose = tsmomTrend(45)
      .signals(bars)
      .filter((s) => s === 1).length;

    expect(loose).toBeGreaterThanOrEqual(strict);
  });
});

describe('registry', () => {
  it('includes the TSMOM strategies', () => {
    const ids = STRATEGIES.map((s) => s.id);
    expect(ids).toContain('tsmom_55');
    expect(ids).toContain('tsmom_50');
  });

  it('files them under momentum', () => {
    const tsmom = STRATEGIES.filter((s) => s.id.startsWith('tsmom_'));
    expect(tsmom.every((s) => s.kind === StrategyKind.Momentum)).toBe(true);
  });

  it('keeps every strategy id unique', () => {
    const ids = STRATEGIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
