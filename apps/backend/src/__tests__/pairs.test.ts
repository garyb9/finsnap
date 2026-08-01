import { describe, expect, it } from 'vitest';
import {
  alignSeries,
  computeSpreadZScore,
  generatePairSignals,
  minimumEntryZ,
  ouPositionSize,
  regimeStatus,
  scanPairs,
  testPairCointegration,
} from '../analyzers/pairs';
import { PairRegimeStatus, SpreadDirection } from '../backtest/pairsTypes';
import type { Bar } from '../collectors/types';
import { randomWalk, simulateOu } from './stats/helpers';

const DAY_MS = 86_400_000;
const START = Date.UTC(2023, 0, 1);

function makeBars(closes: number[]): Bar[] {
  return closes.map((close, i) => ({
    time: START + i * DAY_MS,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
  }));
}

/** legA = beta*legB + alpha + a mean-reverting spread — genuinely cointegrated by construction. */
function cointegratedPair(n: number, beta: number, alpha: number) {
  const legBWalk = randomWalk(n, 10, 0.5);
  const legB = legBWalk.map((v) => 200 + v);
  const spread = simulateOu(n, 11, 0.1, 0, 1); // half-life ~ ln(2)/0.1 ~= 6.9 days
  const legA = legB.map((v, i) => beta * v + alpha + spread[i]);
  return { legA, legB, spread };
}

describe('alignSeries', () => {
  it('intersects on shared calendar days and preserves order', () => {
    const barsA = makeBars([1, 2, 3, 4]);
    const barsB = makeBars([10, 20, 30]); // one day shorter
    const aligned = alignSeries(barsA, barsB);
    expect(aligned.dates.length).toBe(3);
    expect(aligned.a).toEqual([1, 2, 3]);
    expect(aligned.b).toEqual([10, 20, 30]);
  });
});

describe('testPairCointegration', () => {
  it('identifies a genuinely cointegrated pair', () => {
    const { legA, legB } = cointegratedPair(400, 1.5, 10);
    const aligned = alignSeries(makeBars(legA), makeBars(legB));

    const result = testPairCointegration({ legA: 'A', legB: 'B', rationale: 'synthetic' }, aligned);

    expect(result.cointegrated).toBe(true);
    // Finite-sample OLS noise, not exact recovery — just check it landed in the right ballpark.
    expect(result.beta).toBeGreaterThan(1.0);
    expect(result.beta).toBeLessThan(2.0);
    expect(result.hurst).toBeLessThan(0.5);
  });

  it('rejects two unrelated random walks', () => {
    const legA = randomWalk(400, 20, 1).map((v) => 100 + v);
    const legB = randomWalk(400, 21, 1).map((v) => 50 + v);
    const aligned = alignSeries(makeBars(legA), makeBars(legB));

    const result = testPairCointegration({ legA: 'A', legB: 'B', rationale: 'synthetic' }, aligned);

    expect(result.cointegrated).toBe(false);
  });
});

describe('scanPairs', () => {
  it('skips a candidate pair missing bar history rather than throwing', () => {
    const barsBySymbol = new Map([['A', makeBars([1, 2, 3])]]);
    const out = scanPairs(barsBySymbol, [{ legA: 'A', legB: 'B', rationale: 'x' }]);
    expect(out).toEqual([]);
  });

  it('skips a pair with too little shared history', () => {
    const barsBySymbol = new Map([
      ['A', makeBars([1, 2, 3])],
      ['B', makeBars([1, 2, 3])],
    ]);
    const out = scanPairs(barsBySymbol, [{ legA: 'A', legB: 'B', rationale: 'x' }]);
    expect(out).toEqual([]);
  });
});

describe('computeSpreadZScore', () => {
  it('is NaN during warm-up and centers around 0 once past it', () => {
    const spread = simulateOu(500, 30, 0.15, 5, 1);
    const z = computeSpreadZScore(spread, 40);

    for (let i = 0; i < 40; i++) expect(Number.isNaN(z[i])).toBe(true);

    const settled = z.slice(200);
    const meanZ = settled.reduce((s, v) => s + v, 0) / settled.length;
    expect(Math.abs(meanZ)).toBeLessThan(0.5);
  });
});

describe('minimumEntryZ / ouPositionSize', () => {
  it('returns Infinity for a non-positive equilibrium std', () => {
    expect(minimumEntryZ(0, 5)).toBe(Infinity);
  });

  it('scales up with cost and down with equilibrium std', () => {
    expect(minimumEntryZ(1, 10)).toBeGreaterThan(minimumEntryZ(1, 5));
    expect(minimumEntryZ(2, 5)).toBeLessThan(minimumEntryZ(1, 5));
  });

  it('sizes proportionally to |z|/entryZ, clamped to [0,1]', () => {
    expect(ouPositionSize(1, 2)).toBeCloseTo(0.5, 5);
    expect(ouPositionSize(3, 2)).toBe(1);
    expect(ouPositionSize(-1, 2)).toBeCloseTo(0.5, 5);
  });
});

describe('generatePairSignals', () => {
  it('enters short-spread above entryZ and exits back at exitZ', () => {
    const z = [0, 1, 2.5, 2.0, 0.9, 0.4, -0.1];
    const signals = generatePairSignals(z, 2, 1);
    expect(signals).toEqual([
      SpreadDirection.Flat,
      SpreadDirection.Flat,
      SpreadDirection.ShortSpread,
      SpreadDirection.ShortSpread,
      // z=0.9 <= exitZ(1) — exits the moment it crosses back through the threshold.
      SpreadDirection.Flat,
      SpreadDirection.Flat,
      SpreadDirection.Flat,
    ]);
  });

  it('enters long-spread below -entryZ and exits back at -exitZ', () => {
    const z = [0, -1, -2.5, -2.0, -0.9, -0.4];
    const signals = generatePairSignals(z, 2, 1);
    expect(signals).toEqual([
      SpreadDirection.Flat,
      SpreadDirection.Flat,
      SpreadDirection.LongSpread,
      SpreadDirection.LongSpread,
      // z=-0.9 >= -exitZ(-1) — exits the moment it crosses back through the threshold.
      SpreadDirection.Flat,
      SpreadDirection.Flat,
    ]);
  });

  it('ignores NaN warm-up values and stays flat', () => {
    const z = [NaN, NaN, NaN];
    expect(generatePairSignals(z, 2, 1)).toEqual([
      SpreadDirection.Flat,
      SpreadDirection.Flat,
      SpreadDirection.Flat,
    ]);
  });
});

describe('regimeStatus', () => {
  it('is Active for a healthy p-value and half-life', () => {
    expect(regimeStatus(0.02, 20)).toBe(PairRegimeStatus.Active);
  });

  it('is Warning when the p-value has weakened but half-life is still fine', () => {
    expect(regimeStatus(0.15, 20)).toBe(PairRegimeStatus.Warning);
  });

  it('is Halted when the p-value has broken through the halt threshold', () => {
    expect(regimeStatus(0.5, 20)).toBe(PairRegimeStatus.Halted);
  });

  it('is Halted when half-life has drifted outside the tradeable range even with a good p-value', () => {
    expect(regimeStatus(0.01, 200)).toBe(PairRegimeStatus.Halted);
  });
});
