import { describe, it, expect } from 'vitest';
import {
  buildStats,
  cagrPct,
  maxDrawdownPct,
  periodReturns,
  profitFactor,
  sharpe,
  sortino,
  summarizeTrades,
} from '../backtest/metrics';
import type { Trade } from '../backtest/types';

function makeTrade(returnPct: number, overrides: Partial<Trade> = {}): Trade {
  return {
    entryTime: 0,
    exitTime: 1,
    entryPrice: 100,
    exitPrice: 100 * (1 + returnPct / 100),
    returnPct,
    barsHeld: 5,
    open: false,
    ...overrides,
  };
}

describe('periodReturns', () => {
  it('produces one fewer value than the equity curve', () => {
    expect(periodReturns([100, 110, 121])).toHaveLength(2);
  });

  it('computes simple per-bar returns', () => {
    const [first, second] = periodReturns([100, 110, 121]);
    expect(first).toBeCloseTo(0.1);
    expect(second).toBeCloseTo(0.1);
  });
});

describe('maxDrawdownPct', () => {
  it('is zero for a monotonically rising curve', () => {
    expect(maxDrawdownPct([100, 110, 120])).toBe(0);
  });

  it('measures peak-to-trough, not start-to-end', () => {
    // Peak 200, trough 100 → -50%, even though the curve ends higher than it began.
    expect(maxDrawdownPct([100, 200, 100, 150])).toBeCloseTo(-50);
  });

  it('is negative or zero by construction', () => {
    expect(maxDrawdownPct([100, 50, 25])).toBeLessThan(0);
  });
});

describe('sharpe / sortino', () => {
  it('is zero when returns never vary', () => {
    expect(sharpe([0.01, 0.01, 0.01], 252)).toBe(0);
  });

  it('is positive for a mostly-up series', () => {
    expect(sharpe([0.02, -0.01, 0.03, 0.01], 252)).toBeGreaterThan(0);
  });

  it('rates sortino above sharpe when downside is rare', () => {
    // Sortino ignores upside volatility, so a series with one small loss and
    // large gains scores better under it.
    const returns = [0.05, 0.06, -0.005, 0.04, -0.004];
    expect(sortino(returns, 252)).toBeGreaterThan(sharpe(returns, 252));
  });

  it('returns zero sortino without enough downside samples', () => {
    expect(sortino([0.01, 0.02, 0.03], 252)).toBe(0);
  });
});

describe('cagrPct', () => {
  it('annualizes a doubling over one year', () => {
    expect(cagrPct(100, 200, 1)).toBeCloseTo(100, 4);
  });

  it('annualizes a doubling over two years to ~41%', () => {
    expect(cagrPct(100, 200, 2)).toBeCloseTo(41.42, 1);
  });

  it('is zero for degenerate inputs', () => {
    expect(cagrPct(0, 100, 1)).toBe(0);
    expect(cagrPct(100, 100, 0)).toBe(0);
  });
});

describe('profitFactor', () => {
  it('divides gross gains by gross losses', () => {
    expect(profitFactor([makeTrade(10), makeTrade(20), makeTrade(-10)])).toBeCloseTo(3);
  });

  it('is Infinity when nothing ever lost', () => {
    expect(profitFactor([makeTrade(10), makeTrade(5)])).toBe(Infinity);
  });

  it('ignores open trades', () => {
    const closedOnly = profitFactor([makeTrade(10), makeTrade(-5)]);
    const withOpen = profitFactor([makeTrade(10), makeTrade(-5), makeTrade(1000, { open: true })]);
    expect(withOpen).toBeCloseTo(closedOnly);
  });
});

describe('summarizeTrades', () => {
  it('computes win rate over closed trades', () => {
    const summary = summarizeTrades([makeTrade(10), makeTrade(-5), makeTrade(3), makeTrade(-1)]);
    expect(summary.winRatePct).toBeCloseTo(50);
    expect(summary.bestTradePct).toBeCloseTo(10);
    expect(summary.worstTradePct).toBeCloseTo(-5);
  });

  it('counts open trades in numTrades but not in the win rate', () => {
    const summary = summarizeTrades([makeTrade(10), makeTrade(50, { open: true })]);
    expect(summary.numTrades).toBe(2);
    expect(summary.winRatePct).toBeCloseTo(100);
  });

  it('handles an empty trade list', () => {
    const summary = summarizeTrades([]);
    expect(summary.numTrades).toBe(0);
    expect(summary.winRatePct).toBe(0);
  });
});

describe('buildStats', () => {
  it('assembles a coherent stat block', () => {
    const stats = buildStats({
      equity: [100, 110, 105, 120],
      trades: [makeTrade(20)],
      initialCapital: 100,
      periodsPerYear: 252,
      startTime: 0,
      endTime: 3,
      barsExposed: 2,
    });

    expect(stats.finalValue).toBe(120);
    expect(stats.totalReturnPct).toBeCloseTo(20);
    expect(stats.maxDrawdownPct).toBeLessThan(0);
    expect(stats.exposurePct).toBeCloseTo(50);
    expect(stats.bars).toBe(4);
  });

  it('keeps calmar at zero when there was no drawdown', () => {
    const stats = buildStats({
      equity: [100, 110, 120],
      trades: [],
      initialCapital: 100,
      periodsPerYear: 252,
      startTime: 0,
      endTime: 2,
      barsExposed: 2,
    });
    expect(stats.calmar).toBe(0);
  });
});
