import { describe, it, expect } from 'vitest';
import {
  buildRationale,
  computeEdgeScore,
  computeOpportunityScore,
  readSignal,
  scoreWindow,
} from '../backtest/opportunity';
import {
  SignalAction,
  WindowId,
  type BacktestStats,
  type TodaySignal,
  type WindowResult,
} from '../backtest/types';
import { barsFromCloses, risingCloses } from './helpers/bars';

function makeStats(overrides: Partial<BacktestStats> = {}): BacktestStats {
  return {
    startTime: 0,
    endTime: 1,
    bars: 500,
    initialCapital: 10_000,
    finalValue: 12_000,
    totalReturnPct: 20,
    cagrPct: 10,
    volatilityPct: 15,
    sharpe: 0.7,
    sortino: 1,
    maxDrawdownPct: -20,
    calmar: 0.5,
    winRatePct: 55,
    profitFactor: 1.4,
    numTrades: 40,
    avgTradeReturnPct: 2,
    avgBarsHeld: 12,
    exposurePct: 60,
    bestTradePct: 20,
    worstTradePct: -8,
    ...overrides,
  };
}

function makeWindow(
  id: WindowId,
  strategyCagr: number,
  benchmarkCagr: number,
  overrides: { strategyDd?: number; benchmarkDd?: number; sharpe?: number } = {}
): WindowResult {
  const strategyDd = overrides.strategyDd ?? -20;
  const benchmarkDd = overrides.benchmarkDd ?? -40;

  return {
    window: id,
    label: String(id),
    stats: makeStats({
      cagrPct: strategyCagr,
      maxDrawdownPct: strategyDd,
      sharpe: overrides.sharpe ?? 0.9,
    }),
    benchmark: {
      totalReturnPct: benchmarkCagr * 2,
      cagrPct: benchmarkCagr,
      maxDrawdownPct: benchmarkDd,
      sharpe: 0.5,
    },
    excessCagrPct: strategyCagr - benchmarkCagr,
    beatsBenchmark: strategyCagr > benchmarkCagr && Math.abs(strategyDd) <= Math.abs(benchmarkDd),
  };
}

function makeSignal(overrides: Partial<TodaySignal> = {}): TodaySignal {
  return {
    action: SignalAction.Enter,
    target: 1,
    previous: 0,
    barsInState: 1,
    lastClose: 100,
    lastBarTime: 0,
    ...overrides,
  };
}

describe('scoreWindow', () => {
  it('is near neutral when the strategy matches buy-and-hold', () => {
    const window = makeWindow(WindowId.Y5, 10, 10, {
      strategyDd: -30,
      benchmarkDd: -30,
      sharpe: 0.5,
    });
    expect(scoreWindow(window)).toBeCloseTo(50, 0);
  });

  it('rises when the strategy outperforms', () => {
    expect(scoreWindow(makeWindow(WindowId.Y5, 20, 5))).toBeGreaterThan(60);
  });

  it('falls when the strategy underperforms', () => {
    expect(
      scoreWindow(makeWindow(WindowId.Y5, 2, 15, { strategyDd: -50, benchmarkDd: -30 }))
    ).toBeLessThan(40);
  });

  it('stays inside 0-100 for extreme inputs', () => {
    expect(scoreWindow(makeWindow(WindowId.Y5, 500, -50))).toBeLessThanOrEqual(100);
    expect(scoreWindow(makeWindow(WindowId.Y5, -90, 200))).toBeGreaterThanOrEqual(0);
  });
});

describe('computeEdgeScore', () => {
  it('returns neutral with no windows', () => {
    expect(computeEdgeScore([], 100)).toBe(50);
  });

  it('rewards consistent outperformance', () => {
    const windows = [WindowId.Max, WindowId.Y5, WindowId.Y3, WindowId.Y1].map((id) =>
      makeWindow(id, 20, 8)
    );
    expect(computeEdgeScore(windows, 100)).toBeGreaterThan(65);
  });

  it('punishes consistent underperformance', () => {
    const windows = [WindowId.Max, WindowId.Y5, WindowId.Y3, WindowId.Y1].map((id) =>
      makeWindow(id, 1, 15, { strategyDd: -50, benchmarkDd: -30 })
    );
    expect(computeEdgeScore(windows, 100)).toBeLessThan(35);
  });

  it('shrinks toward neutral when the trade sample is thin', () => {
    const windows = [WindowId.Max, WindowId.Y5, WindowId.Y3].map((id) => makeWindow(id, 25, 5));
    const thin = computeEdgeScore(windows, 2);
    const rich = computeEdgeScore(windows, 100);

    expect(Math.abs(thin - 50)).toBeLessThan(Math.abs(rich - 50));
  });

  it('collapses to exactly neutral with zero trades', () => {
    expect(computeEdgeScore([makeWindow(WindowId.Max, 30, 5)], 0)).toBe(50);
  });
});

describe('readSignal', () => {
  const bars = barsFromCloses(risingCloses(10));

  it('detects a fresh entry', () => {
    const signal = readSignal(bars, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(signal.action).toBe(SignalAction.Enter);
    expect(signal.barsInState).toBe(1);
  });

  it('detects an exit', () => {
    const signal = readSignal(bars, [0, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    expect(signal.action).toBe(SignalAction.Exit);
  });

  it('counts how long a hold has run', () => {
    const signal = readSignal(bars, [0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect(signal.action).toBe(SignalAction.Hold);
    expect(signal.barsInState).toBe(6);
  });

  it('reports staying in cash', () => {
    const signal = readSignal(bars, new Array(10).fill(0));
    expect(signal.action).toBe(SignalAction.StayOut);
    expect(signal.barsInState).toBe(10);
  });

  it('treats NaN as flat', () => {
    const signal = readSignal(bars, new Array(10).fill(NaN));
    expect(signal.action).toBe(SignalAction.StayOut);
    expect(signal.target).toBe(0);
  });

  it('carries the last close through', () => {
    const signal = readSignal(bars, new Array(10).fill(1));
    expect(signal.lastClose).toBe(bars.at(-1)!.close);
  });
});

describe('computeOpportunityScore', () => {
  const STRONG_EDGE = 80;
  const WEAK_EDGE = 20;

  it('scores a fresh entry from a strong rule highest', () => {
    const enter = computeOpportunityScore(makeSignal({ action: SignalAction.Enter }), STRONG_EDGE);
    const hold = computeOpportunityScore(
      makeSignal({ action: SignalAction.Hold, barsInState: 5 }),
      STRONG_EDGE
    );
    expect(enter).toBeGreaterThan(hold);
    expect(enter).toBeGreaterThan(75);
  });

  it('decays a hold as the position ages', () => {
    const fresh = computeOpportunityScore(
      makeSignal({ action: SignalAction.Hold, barsInState: 1 }),
      STRONG_EDGE
    );
    const stale = computeOpportunityScore(
      makeSignal({ action: SignalAction.Hold, barsInState: 400 }),
      STRONG_EDGE
    );
    expect(stale).toBeLessThan(fresh);
  });

  it('inverts the edge on an exit', () => {
    expect(
      computeOpportunityScore(makeSignal({ action: SignalAction.Exit }), STRONG_EDGE)
    ).toBeLessThan(30);
  });

  it('lands near neutral when the rule has no edge', () => {
    for (const action of Object.values(SignalAction)) {
      const score = computeOpportunityScore(makeSignal({ action }), 50);
      expect(score, action).toBeCloseTo(50, 0);
    }
  });

  it('treats an exit from a discredited rule as mildly constructive', () => {
    // If a rule reliably loses money, its sell signal is weak evidence to buy.
    expect(
      computeOpportunityScore(makeSignal({ action: SignalAction.Exit }), WEAK_EDGE)
    ).toBeGreaterThan(50);
  });

  it('always stays inside 0-100', () => {
    for (const edge of [0, 25, 50, 75, 100]) {
      for (const action of Object.values(SignalAction)) {
        const score = computeOpportunityScore(makeSignal({ action }), edge);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('buildRationale', () => {
  it('names the action and the win count', () => {
    const windows = [makeWindow(WindowId.Max, 20, 8), makeWindow(WindowId.Y1, 15, 5)];
    const text = buildRationale(makeSignal({ action: SignalAction.Enter }), 75, windows);

    expect(text).toContain('fires a fresh entry');
    expect(text).toContain('strong historical edge');
    expect(text).toContain('2/2 windows');
  });

  it('mentions position age on a hold', () => {
    const windows = [makeWindow(WindowId.Y1, 15, 5)];
    const text = buildRationale(
      makeSignal({ action: SignalAction.Hold, barsInState: 42 }),
      60,
      windows
    );
    expect(text).toContain('42 bars');
  });

  it('calls out a rule that is worse than holding', () => {
    const windows = [makeWindow(WindowId.Y1, 2, 20, { strategyDd: -60, benchmarkDd: -20 })];
    expect(buildRationale(makeSignal(), 20, windows)).toContain('historically worse than holding');
  });
});
