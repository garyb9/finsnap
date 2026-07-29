import { describe, it, expect } from 'vitest';
import { runBacktest, runBuyAndHold } from '../backtest/engine';
import type { BacktestOptions } from '../backtest/types';
import { barsFromOhlc, risingCloses, barsFromCloses } from './helpers/bars';

const FREE: BacktestOptions = {
  initialCapital: 10_000,
  feeBps: 0,
  slippageBps: 0,
  periodsPerYear: 252,
};

/** Opens and closes deliberately differ so fills can be attributed to one or the other. */
const RAMP = barsFromOhlc([
  { open: 100, close: 105 },
  { open: 110, close: 115 },
  { open: 120, close: 125 },
  { open: 130, close: 135 },
  { open: 140, close: 145 },
]);

describe('runBacktest execution model', () => {
  it('fills at the next bar open, never the signal bar', () => {
    // Signal produced at bar 0's close must be filled at bar 1's open (110).
    const result = runBacktest(RAMP, [1, 0, 0, 0, 0], FREE);

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryPrice).toBeCloseTo(110);
  });

  it('rejects a signal array that does not match the bar count', () => {
    expect(() => runBacktest(RAMP, [1, 0], FREE)).toThrow(/does not match/);
  });

  it('holds no position on the first bar, since no prior signal exists', () => {
    const result = runBacktest(RAMP, [1, 1, 1, 1, 1], FREE);
    expect(result.equity[0]).toBe(FREE.initialCapital);
  });

  it('round-trips a trade at the expected open prices', () => {
    // Long from bar 2's open (120) to bar 3's open (130).
    const result = runBacktest(RAMP, [0, 1, 0, 0, 0], FREE);
    const [trade] = result.trades;

    expect(trade.entryPrice).toBeCloseTo(120);
    expect(trade.exitPrice).toBeCloseTo(130);
    expect(trade.returnPct).toBeCloseTo((130 / 120 - 1) * 100, 6);
    expect(trade.open).toBe(false);
    expect(result.equity.at(-1)).toBeCloseTo(10_000 * (130 / 120), 6);
  });

  it('marks a position still open at the end of the window', () => {
    const result = runBacktest(RAMP, [0, 1, 1, 1, 1], FREE);
    const [trade] = result.trades;

    expect(trade.open).toBe(true);
    expect(trade.exitTime).toBeNull();
    expect(trade.exitPrice).toBeNull();
  });

  it('treats NaN signals as flat rather than throwing', () => {
    const result = runBacktest(RAMP, [NaN, NaN, 1, 0, 0], FREE);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryPrice).toBeCloseTo(130);
  });

  it('clamps out-of-range exposure into [0, 1]', () => {
    const overLong = runBacktest(RAMP, [3, 0, 0, 0, 0], FREE);
    const fullLong = runBacktest(RAMP, [1, 0, 0, 0, 0], FREE);
    expect(overLong.equity.at(-1)).toBeCloseTo(fullLong.equity.at(-1)!, 6);
  });
});

describe('runBacktest costs', () => {
  const COSTLY: BacktestOptions = { ...FREE, feeBps: 100, slippageBps: 100 };

  it('never lets a fully invested position run on negative cash', () => {
    // A buy must leave room for its own fee; otherwise the book runs on margin.
    const result = runBacktest(RAMP, [1, 1, 1, 1, 1], COSTLY);
    expect(result.equity.every((v) => v > 0)).toBe(true);
  });

  it('charges slippage and fees against the round trip', () => {
    const free = runBacktest(RAMP, [0, 1, 0, 0, 0], FREE);
    const costly = runBacktest(RAMP, [0, 1, 0, 0, 0], COSTLY);

    expect(costly.trades[0].returnPct).toBeLessThan(free.trades[0].returnPct);
    // Buy fills above the open, sell fills below it.
    expect(costly.trades[0].entryPrice).toBeGreaterThan(120);
    expect(costly.trades[0].exitPrice!).toBeLessThan(130);
  });

  it('leaves an always-flat strategy at exactly its initial capital', () => {
    const result = runBacktest(RAMP, [0, 0, 0, 0, 0], COSTLY);
    expect(result.equity.at(-1)).toBeCloseTo(FREE.initialCapital, 6);
    expect(result.trades).toHaveLength(0);
    expect(result.stats.exposurePct).toBe(0);
  });
});

describe('runBuyAndHold', () => {
  it('tracks the underlying from the second bar onward', () => {
    const bars = barsFromCloses(risingCloses(50));
    const result = runBuyAndHold(bars, FREE);

    // Entry is at bar 1's open, so the benchmark measures from there.
    const expected = bars.at(-1)!.close / bars[1].open;
    expect(result.equity.at(-1)! / FREE.initialCapital).toBeCloseTo(expected, 6);
    // Every bar but the first, which is flat by construction.
    expect(result.stats.exposurePct).toBeCloseTo(((bars.length - 1) / bars.length) * 100, 6);
  });

  it('reports a single open trade', () => {
    const result = runBuyAndHold(barsFromCloses(risingCloses(50)), FREE);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].open).toBe(true);
  });
});

describe('runBacktest edge cases', () => {
  it('handles an empty series without throwing', () => {
    const result = runBacktest([], [], FREE);
    expect(result.trades).toHaveLength(0);
    expect(result.equity).toEqual([]);
  });

  it('handles a single bar', () => {
    const bars = barsFromCloses([100]);
    const result = runBacktest(bars, [1], FREE);
    expect(result.equity).toEqual([FREE.initialCapital]);
  });
});
