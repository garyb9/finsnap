import { describe, expect, it } from 'vitest';
import { runPairsBacktest } from '../backtest/pairsEngine';
import { SpreadDirection } from '../backtest/pairsTypes';
import type { AlignedBarPair } from '../analyzers/pairs';
import type { BacktestOptions } from '../backtest/types';

const DAY_MS = 86_400_000;
const START = Date.UTC(2024, 0, 1);

function bar(close: number) {
  return { time: 0, open: close, high: close, low: close, close, volume: 0 };
}

function align(closesA: number[], closesB: number[]): AlignedBarPair[] {
  return closesA.map((a, i) => ({
    time: START + i * DAY_MS,
    a: { ...bar(a), time: START + i * DAY_MS },
    b: { ...bar(closesB[i]), time: START + i * DAY_MS },
  }));
}

const ZERO_COST: BacktestOptions = {
  initialCapital: 10_000,
  feeBps: 0,
  slippageBps: 0,
  periodsPerYear: 252,
};

describe('runPairsBacktest', () => {
  it('never uses a bar it could not have seen yet (signal shifted one bar)', () => {
    const n = 20;
    const closesA = Array.from({ length: n }, (_, i) => 100 + i);
    const closesB = Array.from({ length: n }, (_, i) => 50 + i * 0.3);
    const aligned = align(closesA, closesB);
    const zscore = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? -2.5 : 0));

    const signalsA = Array.from({ length: n }, (_, i) =>
      zscore[i] < -2 ? SpreadDirection.LongSpread : SpreadDirection.Flat
    );
    const signalsB = [...signalsA];
    // Only the very last signal differs — since signals[i-1] drives bar i's
    // fill, and there is no bar `n` to execute it on, this must change nothing.
    signalsB[n - 1] =
      signalsB[n - 1] === SpreadDirection.Flat ? SpreadDirection.ShortSpread : SpreadDirection.Flat;

    const resultA = runPairsBacktest(aligned, signalsA, zscore, 2, 1, ZERO_COST);
    const resultB = runPairsBacktest(aligned, signalsB, zscore, 2, 1, ZERO_COST);

    expect(resultB.equity).toEqual(resultA.equity);
    expect(resultB.stats).toEqual(resultA.stats);
  });

  it('hedges out a common move in both legs (dollar-neutral by construction)', () => {
    const n = 60;
    // Both legs move identically — a pure "market" move with no spread divergence.
    const closes = Array.from({ length: n }, (_, i) => 100 * 1.02 ** i);
    const aligned = align(closes, closes);

    // Force a long-spread position for the whole window; zscore is only used
    // for sizing here, kept constant and away from 0 so size doesn't collapse.
    const signals = Array.from({ length: n }, (_, i) =>
      i === 0 ? SpreadDirection.Flat : SpreadDirection.LongSpread
    );
    const zscore = new Array(n).fill(-1.5);

    const result = runPairsBacktest(aligned, signals, zscore, 2, 1, ZERO_COST);

    // Both legs individually returned ~230%; a hedged, beta=1 book holding
    // long A / short B of equal price should show only a small residual.
    expect(Math.abs(result.stats.totalReturnPct)).toBeLessThan(5);
  });

  it('captures a profit when a divergent spread reverts to its mean', () => {
    // legA starts cheap relative to legB, then converges — the textbook long-spread win.
    const closesA = [90, 91, 93, 95, 97, 99, 100, 100, 100, 100];
    const closesB = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const aligned = align(closesA, closesB);
    const zscore = [-2.5, -2, -1.5, -1, -0.5, 0, 0, 0, 0, 0];
    const signals = zscore.map((z) =>
      z <= -1 ? SpreadDirection.LongSpread : SpreadDirection.Flat
    );

    const result = runPairsBacktest(aligned, signals, zscore, 2, 1, ZERO_COST);
    expect(result.stats.totalReturnPct).toBeGreaterThan(0);
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it('fees and slippage strictly reduce net return versus the zero-cost run', () => {
    const n = 40;
    const closesA = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const closesB = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 3 + 1) * 5);
    const aligned = align(closesA, closesB);
    const zscore = Array.from({ length: n }, (_, i) => Math.sin(i / 2) * 3);
    const signals = zscore.map((z) =>
      z <= -1.5
        ? SpreadDirection.LongSpread
        : z >= 1.5
          ? SpreadDirection.ShortSpread
          : SpreadDirection.Flat
    );

    const cheap = runPairsBacktest(aligned, signals, zscore, 2, 1, ZERO_COST);
    const costly = runPairsBacktest(aligned, signals, zscore, 2, 1, {
      ...ZERO_COST,
      feeBps: 20,
      slippageBps: 20,
    });

    expect(costly.stats.totalReturnPct).toBeLessThan(cheap.stats.totalReturnPct);
  });
});
