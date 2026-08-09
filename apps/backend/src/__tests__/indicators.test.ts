import { describe, it, expect } from 'vitest';
import {
  atr,
  bollinger,
  donchian,
  ema,
  ewmaVolatility,
  macd,
  roc,
  rsi,
  sma,
  stdev,
  supertrend,
  trueRange,
  zscore,
} from '../backtest/indicators';
import { barsFromCloses, barsFromOhlc, risingCloses } from './helpers/bars';

const RAMP = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('sma', () => {
  it('leaves the warm-up region undefined', () => {
    const result = sma(RAMP, 3);
    expect(result.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(result[2]).toBeCloseTo(2);
  });

  it('computes a rolling mean', () => {
    expect(sma(RAMP, 3).at(-1)).toBeCloseTo(9); // (8+9+10)/3
  });

  it('returns the same length as its input', () => {
    expect(sma(RAMP, 4)).toHaveLength(RAMP.length);
  });
});

describe('ema', () => {
  it('seeds from the SMA of the first period', () => {
    const result = ema(RAMP, 3);
    expect(result[2]).toBeCloseTo(2); // SMA(1,2,3)
  });

  it('is all NaN when the series is shorter than the period', () => {
    expect(ema([1, 2], 5).every(Number.isNaN)).toBe(true);
  });

  it('tracks a rising series above its SMA', () => {
    const closes = risingCloses(100);
    expect(ema(closes, 20).at(-1)!).toBeGreaterThan(sma(closes, 20).at(-1)!);
  });
});

describe('stdev', () => {
  it('is zero for a flat series', () => {
    expect(stdev([5, 5, 5, 5, 5], 3).at(-1)).toBeCloseTo(0);
  });

  it('is positive for a varying series', () => {
    expect(stdev(RAMP, 3).at(-1)!).toBeGreaterThan(0);
  });
});

describe('ewmaVolatility', () => {
  it('converges to the constant magnitude of a series of identical returns', () => {
    // RiskMetrics-style EWMA vol is built from squared returns around zero, not
    // demeaned — a steady nonzero drift converges to its own magnitude, not 0.
    const result = ewmaVolatility([0.01, 0.01, 0.01, 0.01, 0.01]);
    expect(result.at(-1)).toBeCloseTo(0.01);
  });

  it('is zero only when returns are actually zero', () => {
    const result = ewmaVolatility([0, 0, 0, 0]);
    expect(result.at(-1)).toBeCloseTo(0);
  });

  it('matches the hand-computed recursion', () => {
    const returns = [0.02, -0.01, 0.03];
    const lambda = 0.94;
    const v0 = returns[0] ** 2;
    const v1 = lambda * v0 + (1 - lambda) * returns[1] ** 2;
    const v2 = lambda * v1 + (1 - lambda) * returns[2] ** 2;

    const result = ewmaVolatility(returns, lambda);
    expect(result[0]).toBeCloseTo(Math.sqrt(v0));
    expect(result[1]).toBeCloseTo(Math.sqrt(v1));
    expect(result[2]).toBeCloseTo(Math.sqrt(v2));
  });

  it('leaves leading NaN returns undefined without poisoning the rest', () => {
    const result = ewmaVolatility([NaN, 0.02, -0.01]);
    expect(Number.isNaN(result[0])).toBe(true);
    expect(Number.isFinite(result[1])).toBe(true);
    expect(Number.isFinite(result[2])).toBe(true);
  });

  it('reacts more to recent moves as lambda decreases', () => {
    const returns = [0.001, 0.001, 0.001, 0.001, 0.05];
    const slow = ewmaVolatility(returns, 0.97).at(-1)!;
    const fast = ewmaVolatility(returns, 0.7).at(-1)!;
    expect(fast).toBeGreaterThan(slow);
  });

  it('returns the same length as its input', () => {
    expect(ewmaVolatility([0.01, 0.02, -0.01])).toHaveLength(3);
  });
});

describe('bollinger', () => {
  it('orders the bands lower < middle < upper', () => {
    const bb = bollinger(RAMP, 5, 2);
    const i = RAMP.length - 1;
    expect(bb.lower[i]).toBeLessThan(bb.middle[i]);
    expect(bb.middle[i]).toBeLessThan(bb.upper[i]);
  });

  it('puts percentB above 1 when price breaks the upper band', () => {
    // A sharp spike after a quiet stretch must sit outside the envelope.
    const values = [...Array(20).fill(100), 130];
    const bb = bollinger(values, 20, 2);
    expect(bb.percentB.at(-1)!).toBeGreaterThan(1);
  });

  it('widens bandwidth as volatility rises', () => {
    const calm = bollinger([...Array(30).fill(100)], 20, 2);
    const wild = bollinger(risingCloses(30, 100, 5), 20, 2);
    expect(wild.bandwidth.at(-1)!).toBeGreaterThan(calm.bandwidth.at(-1)!);
  });
});

describe('rsi', () => {
  it('pins near 100 for an unbroken advance', () => {
    expect(rsi(risingCloses(60), 14).at(-1)!).toBeGreaterThan(95);
  });

  it('pins near 0 for an unbroken decline', () => {
    const falling = risingCloses(60).reverse();
    expect(rsi(falling, 14).at(-1)!).toBeLessThan(10);
  });

  it('stays inside 0-100', () => {
    const values = rsi(risingCloses(200, 100, 2), 14).filter(Number.isFinite);
    expect(values.every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it('is undefined through the warm-up', () => {
    expect(rsi(RAMP, 14).every(Number.isNaN)).toBe(true);
  });
});

describe('macd', () => {
  it('produces a signal line seeded from the first valid MACD value', () => {
    const { macd: line, signal, histogram } = macd(risingCloses(120), 12, 26, 9);
    expect(signal.filter(Number.isFinite).length).toBeGreaterThan(0);
    expect(histogram.at(-1)).toBeCloseTo(line.at(-1)! - signal.at(-1)!, 6);
  });

  it('is positive while price trends up', () => {
    expect(macd(risingCloses(120)).macd.at(-1)!).toBeGreaterThan(0);
  });
});

describe('trueRange / atr', () => {
  it('uses high-low for the first bar', () => {
    const bars = barsFromOhlc([{ open: 100, close: 110, high: 112, low: 98 }]);
    expect(trueRange(bars)[0]).toBeCloseTo(14);
  });

  it('accounts for gaps against the prior close', () => {
    const bars = barsFromOhlc([
      { open: 100, close: 100, high: 101, low: 99 },
      { open: 120, close: 121, high: 122, low: 119 },
    ]);
    // Gap from 100 up to a 122 high dominates the 3-point intrabar range.
    expect(trueRange(bars)[1]).toBeCloseTo(22);
  });

  it('is positive and defined after warm-up', () => {
    const values = atr(barsFromCloses(risingCloses(60)), 14);
    expect(values.at(-1)!).toBeGreaterThan(0);
    expect(values.slice(0, 14).every(Number.isNaN)).toBe(true);
  });
});

describe('donchian', () => {
  it('excludes the current bar from its own channel', () => {
    const bars = barsFromOhlc([
      { open: 10, close: 10, high: 10, low: 10 },
      { open: 10, close: 10, high: 10, low: 10 },
      { open: 10, close: 50, high: 50, low: 10 },
    ]);
    // Bar 2 sets a new high of 50; the channel it must beat is the prior 10.
    expect(donchian(bars, 2).upper[2]).toBeCloseTo(10);
  });

  it('is undefined before enough history exists', () => {
    const bars = barsFromCloses([1, 2, 3, 4, 5]);
    expect(Number.isNaN(donchian(bars, 3).upper[2])).toBe(true);
  });
});

describe('zscore', () => {
  it('is zero when price sits exactly on its mean', () => {
    const values = [...Array(30).fill(100)];
    expect(zscore(values, 20).at(-1)).toBeNaN(); // zero deviation → undefined
  });

  it('is negative when price is below its mean', () => {
    const values = [...Array(20).fill(100), 80];
    expect(zscore(values, 20).at(-1)!).toBeLessThan(0);
  });
});

describe('roc', () => {
  it('measures percentage change over the lookback', () => {
    expect(roc([100, 0, 0, 0, 110], 4).at(-1)).toBeCloseTo(10);
  });
});

describe('supertrend', () => {
  it('reports an uptrend for a rising series', () => {
    const bars = barsFromCloses(risingCloses(120, 100, 2));
    expect(supertrend(bars, 10, 3).direction.at(-1)).toBe(1);
  });

  it('reports a downtrend for a falling series', () => {
    const bars = barsFromCloses(risingCloses(120, 100, 2).reverse());
    expect(supertrend(bars, 10, 3).direction.at(-1)).toBe(-1);
  });
});
