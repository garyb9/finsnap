import { describe, expect, it } from 'vitest';
import { alignBars, testPairCointegration } from '../analyzers/pairs';
import { evaluatePair } from '../backtest/pairsRunner';
import { PairRegimeStatus } from '../backtest/pairsTypes';
import type { Bar } from '../collectors/types';
import { randomWalk, simulateOu } from './stats/helpers';

const DAY_MS = 86_400_000;
const START = Date.UTC(2022, 0, 1);

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

function cointegratedLegs(n: number, beta: number, alpha: number) {
  const legB = randomWalk(n, 40, 0.4).map((v) => 150 + v);
  const spread = simulateOu(n, 41, 0.08, 0, 1); // half-life ~ ln(2)/0.08 ~= 8.7 days
  const legA = legB.map((v, i) => beta * v + alpha + spread[i]);
  return { legA, legB };
}

const EXECUTION = { initialCapital: 10_000, feeBps: 5, slippageBps: 5 };

describe('evaluatePair', () => {
  it('produces a report with windows, a today signal, and a computed regime status', () => {
    const n = 800;
    const { legA, legB } = cointegratedLegs(n, 1.2, 5);
    const barsA = makeBars(legA);
    const barsB = makeBars(legB);
    const aligned = alignBars(barsA, barsB);

    const candidate = testPairCointegration(
      { legA: 'A', legB: 'B', rationale: 'synthetic' },
      { dates: [], a: legA, b: legB }
    );
    expect(candidate.cointegrated).toBe(true);

    const report = evaluatePair(candidate, aligned, EXECUTION, 252);

    expect(report).not.toBeNull();
    expect(report!.pairId).toBe('A/B');
    expect(report!.windows.length).toBeGreaterThan(0);
    expect(report!.signal.lastBarTime).toBe(aligned[aligned.length - 1].time);
    expect(Object.values(PairRegimeStatus)).toContain(report!.regimeStatus);

    for (const w of report!.windows) {
      expect(w.stats.bars).toBeGreaterThan(0);
    }
  });

  it('returns null when there is not enough shared history', () => {
    const barsA = makeBars([100, 101, 102]);
    const barsB = makeBars([50, 51, 52]);
    const aligned = alignBars(barsA, barsB);

    const candidate = testPairCointegration(
      { legA: 'A', legB: 'B', rationale: 'synthetic' },
      { dates: [], a: [100, 101, 102], b: [50, 51, 52] }
    );

    const report = evaluatePair(candidate, aligned, EXECUTION, 252);
    expect(report).toBeNull();
  });
});
