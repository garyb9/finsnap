import { describe, it, expect } from 'vitest';
import { buildLeaderboard } from '../report/leaderboard';
import type { AssetOpportunity, DailyReport } from '../report/types';
import { Verdict } from '../report/types';
import {
  SignalAction,
  StrategyKind,
  WindowId,
  type BacktestStats,
  type StrategyReport,
  type WindowResult,
} from '../backtest/types';
import { AssetClass } from '../config';

function makeStats(overrides: Partial<BacktestStats> = {}): BacktestStats {
  return {
    startTime: 0,
    endTime: 1,
    bars: 500,
    initialCapital: 10_000,
    finalValue: 15_000,
    totalReturnPct: 50,
    cagrPct: 12,
    volatilityPct: 20,
    sharpe: 0.8,
    sortino: 1.1,
    maxDrawdownPct: -25,
    calmar: 0.48,
    winRatePct: 58,
    profitFactor: 1.6,
    numTrades: 30,
    avgTradeReturnPct: 3,
    avgBarsHeld: 15,
    exposurePct: 65,
    bestTradePct: 30,
    worstTradePct: -10,
    ...overrides,
  };
}

function makeWindow(id: WindowId, overrides: Partial<WindowResult> = {}): WindowResult {
  return {
    window: id,
    label: String(id),
    stats: makeStats(),
    benchmark: { totalReturnPct: 40, cagrPct: 9, maxDrawdownPct: -45, sharpe: 0.5 },
    excessCagrPct: 3,
    beatsBenchmark: true,
    ...overrides,
  };
}

function makeStrategy(id: string, overrides: Partial<StrategyReport> = {}): StrategyReport {
  return {
    strategyId: id,
    name: id,
    kind: StrategyKind.Trend,
    description: 'test rule',
    params: {},
    signal: {
      action: SignalAction.Enter,
      target: 1,
      previous: 0,
      barsInState: 1,
      lastClose: 100,
      lastBarTime: Date.UTC(2026, 6, 27),
    },
    windows: [makeWindow(WindowId.Max), makeWindow(WindowId.Y1)],
    edgeScore: 70,
    opportunityScore: 75,
    rationale: 'test',
    ...overrides,
  };
}

function makeAsset(symbol: string, daily: StrategyReport[]): AssetOpportunity {
  return {
    symbol,
    label: symbol,
    assetClass: AssetClass.Equity,
    lastClose: 100,
    lastChangePct: 1,
    lastBarTime: Date.UTC(2026, 6, 27),
    historyStart: Date.UTC(2010, 0, 1),
    barsAnalyzed: 4000,
    consensus: {
      score: 60,
      verdict: Verdict.Accumulate,
      longWeight: 1,
      flatWeight: 1,
      longCount: 1,
      votingCount: 2,
      qualifiedCount: 1,
      qualifiedLongCount: 1,
      freshEntries: 0,
      freshExits: 0,
    },
    daily,
    intraday: [],
    notes: [],
  };
}

function makeReport(assets: AssetOpportunity[]): DailyReport {
  return {
    id: '01HZ000000000000000000000',
    date: '2026-07-27',
    generatedAt: new Date().toISOString(),
    version: '1.0',
    execution: { initialCapital: 10_000, feeBps: 5, slippageBps: 5 },
    assets,
    topOpportunities: [],
    summary: {
      assetsAnalyzed: assets.length,
      strategiesRun: 20,
      backtestsRun: 200,
      freshEntries: 0,
      freshExits: 0,
      avgConsensus: 60,
      bullishAssets: 0,
      bearishAssets: 0,
    },
  };
}

describe('buildLeaderboard', () => {
  it('drops the benchmark strategy from the rows', () => {
    const report = makeReport([
      makeAsset('SPY', [
        makeStrategy('buy_and_hold', { kind: StrategyKind.Benchmark }),
        makeStrategy('sma_cross_50_200'),
      ]),
    ]);

    const board = buildLeaderboard(report);
    expect(board.rows.map((r) => r.strategyId)).toEqual(['sma_cross_50_200']);
  });

  it('pools win rate across assets, per window', () => {
    const report = makeReport([
      makeAsset('SPY', [
        makeStrategy('a', {
          windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 4 })],
        }),
      ]),
      makeAsset('QQQ', [
        makeStrategy('a', {
          windows: [makeWindow(WindowId.Y1, { beatsBenchmark: false, excessCagrPct: -2 })],
        }),
      ]),
    ]);

    const board = buildLeaderboard(report);
    const row = board.rows.find((r) => r.strategyId === 'a')!;
    const cell = row.perWindow.find((w) => w.window === WindowId.Y1)!;

    expect(cell.assetsCovered).toBe(2);
    expect(cell.winRatePct).toBe(50);
    expect(cell.avgExcessCagrPct).toBe(1);
    expect(row.overallWinRatePct).toBe(50);
  });

  it('picks the strategy with the best overall win rate, requiring adequate coverage', () => {
    const wideWinner = makeStrategy('wide_winner', {
      windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true })],
    });
    const thinLucky = makeStrategy('thin_lucky', {
      windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true })],
    });

    const report = makeReport([
      makeAsset('SPY', [wideWinner, thinLucky]),
      makeAsset('QQQ', [wideWinner]),
      makeAsset('DIA', [wideWinner]),
    ]);

    const board = buildLeaderboard(report);
    // thin_lucky ran on only 1 of 3 assets, below the 50% coverage floor.
    expect(board.bestOverall).toBe('wide_winner');
    expect(board.bestPerWindow[WindowId.Y1]).toBe('wide_winner');
  });

  it('breaks a win-rate tie on average excess CAGR', () => {
    const report = makeReport([
      makeAsset('SPY', [
        makeStrategy('a', {
          windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 2 })],
        }),
        makeStrategy('b', {
          windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 6 })],
        }),
      ]),
    ]);

    const board = buildLeaderboard(report);
    expect(board.bestOverall).toBe('b');
  });

  it('returns null bestOverall when there are no non-benchmark strategies', () => {
    const report = makeReport([
      makeAsset('SPY', [makeStrategy('buy_and_hold', { kind: StrategyKind.Benchmark })]),
    ]);

    expect(buildLeaderboard(report).bestOverall).toBeNull();
  });

  it('pools the buy-and-hold benchmark CAGR separately from the ranked rows', () => {
    const report = makeReport([
      makeAsset('SPY', [
        makeStrategy('buy_and_hold', {
          name: 'Buy & Hold',
          kind: StrategyKind.Benchmark,
          windows: [makeWindow(WindowId.Y1, { stats: makeStats({ cagrPct: 10 }) })],
        }),
        makeStrategy('a'),
      ]),
      makeAsset('QQQ', [
        makeStrategy('buy_and_hold', {
          name: 'Buy & Hold',
          kind: StrategyKind.Benchmark,
          windows: [makeWindow(WindowId.Y1, { stats: makeStats({ cagrPct: 20 }) })],
        }),
        makeStrategy('a'),
      ]),
    ]);

    const board = buildLeaderboard(report);
    expect(board.benchmark).not.toBeNull();
    expect(board.benchmark!.name).toBe('Buy & Hold');
    expect(board.benchmark!.assetsCovered).toBe(2);
    expect(board.benchmark!.overallAvgCagrPct).toBe(15);

    const cell = board.benchmark!.perWindow.find((w) => w.window === WindowId.Y1)!;
    expect(cell.avgCagrPct).toBe(15);
    expect(cell.assetsCovered).toBe(2);

    // The benchmark itself never shows up among the ranked, beatable rows.
    expect(board.rows.map((r) => r.strategyId)).not.toContain('buy_and_hold');
  });

  it('returns a null benchmark when the report has no assets', () => {
    expect(buildLeaderboard(makeReport([])).benchmark).toBeNull();
  });
});
