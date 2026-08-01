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
import { assetInfo } from '../constants/assets';
import { AssetCategory } from '../constants/enums';

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

function makeAsset(
  symbol: string,
  daily: StrategyReport[],
  assetClass: AssetClass = AssetClass.Equity
): AssetOpportunity {
  return {
    symbol,
    label: symbol,
    assetClass,
    category: assetInfo(symbol, assetClass).category,
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
    pairs: [],
    summary: {
      assetsAnalyzed: assets.length,
      strategiesRun: 20,
      backtestsRun: 200,
      freshEntries: 0,
      freshExits: 0,
      avgConsensus: 60,
      bullishAssets: 0,
      bearishAssets: 0,
      pairsScanned: 0,
      pairsCointegrated: 0,
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

  /**
   * Ranking first is not the same as winning. Over the harvested universe every
   * rule loses to buy-and-hold — the top row wins 29% of its asset-window pairs
   * with negative average excess CAGR — so the UI must be able to tell "leads a
   * losing field" from "beats holding" instead of asserting the latter.
   */
  it('does not claim the leader beats buy-and-hold when it loses most of its windows', () => {
    const losesMost = makeStrategy('loses_most', {
      windows: [
        makeWindow(WindowId.Y1, { beatsBenchmark: false, excessCagrPct: -4 }),
        makeWindow(WindowId.Y3, { beatsBenchmark: false, excessCagrPct: -6 }),
        makeWindow(WindowId.Max, { beatsBenchmark: true, excessCagrPct: 1 }),
      ],
    });

    const board = buildLeaderboard(makeReport([makeAsset('SPY', [losesMost])]));

    expect(board.bestOverall).toBe('loses_most');
    expect(board.rows[0].overallWinRatePct).toBeLessThan(50);
    expect(board.bestBeatsBenchmark).toBe(false);
  });

  it('confirms the leader beats buy-and-hold when it genuinely does', () => {
    const winsMost = makeStrategy('wins_most', {
      windows: [
        makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 5 }),
        makeWindow(WindowId.Y3, { beatsBenchmark: true, excessCagrPct: 4 }),
        makeWindow(WindowId.Max, { beatsBenchmark: false, excessCagrPct: -1 }),
      ],
    });

    const board = buildLeaderboard(makeReport([makeAsset('SPY', [winsMost])]));

    expect(board.rows[0].overallWinRatePct).toBeGreaterThan(50);
    expect(board.bestBeatsBenchmark).toBe(true);
  });

  // Every rule is scored over the same asset-window grid, so win rates tie
  // constantly. Without a tie-break the table's order could disagree with the
  // row it stars.
  it('orders tied rows by average excess CAGR, matching the starred row', () => {
    const report = makeReport([
      makeAsset('SPY', [
        makeStrategy('worse_excess', {
          windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 1 })],
        }),
        makeStrategy('better_excess', {
          windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 9 })],
        }),
      ]),
    ]);

    const board = buildLeaderboard(report);

    expect(board.rows[0].overallWinRatePct).toBe(board.rows[1].overallWinRatePct);
    expect(board.rows[0].strategyId).toBe('better_excess');
    expect(board.bestOverall).toBe('better_excess');
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

  it('pools win rate separately by asset category, not just asset class', () => {
    const report = makeReport([
      // Both equities, but different categories — a sector index and a broad
      // market index — which is the whole point of pooling by category.
      makeAsset(
        'SPY',
        [
          makeStrategy('a', {
            windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 4 })],
          }),
        ],
        AssetClass.Equity
      ),
      makeAsset(
        'QQQ',
        [
          makeStrategy('a', {
            windows: [makeWindow(WindowId.Y1, { beatsBenchmark: false, excessCagrPct: -2 })],
          }),
        ],
        AssetClass.Equity
      ),
      makeAsset(
        'XLK',
        [
          makeStrategy('a', {
            windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 6 })],
          }),
        ],
        AssetClass.Equity
      ),
      makeAsset(
        'BTC-USD',
        [
          makeStrategy('a', {
            windows: [makeWindow(WindowId.Y1, { beatsBenchmark: true, excessCagrPct: 10 })],
          }),
        ],
        AssetClass.Crypto
      ),
    ]);

    const board = buildLeaderboard(report);
    const row = board.rows.find((r) => r.strategyId === 'a')!;
    const equityIndex = row.byCategory.find((c) => c.category === AssetCategory.EquityIndex)!;
    const sector = row.byCategory.find((c) => c.category === AssetCategory.Sector)!;
    const crypto = row.byCategory.find((c) => c.category === AssetCategory.Crypto)!;

    expect(equityIndex.assetsCovered).toBe(2);
    expect(equityIndex.winRatePct).toBe(50);
    expect(equityIndex.avgExcessCagrPct).toBe(1);
    expect(sector.assetsCovered).toBe(1);
    expect(sector.winRatePct).toBe(100);
    expect(sector.avgExcessCagrPct).toBe(6);
    expect(crypto.assetsCovered).toBe(1);
    expect(crypto.winRatePct).toBe(100);
    expect(crypto.avgExcessCagrPct).toBe(10);
  });
});

/**
 * Numbers lifted straight out of a real sync (report of 2026-07-28) rather than
 * invented, so the aggregation is checked against the shape of data it actually
 * receives — including the awkward parts of it.
 *
 * Buy & hold, five assets, three windows. BTC is in here on purpose: it is the
 * asset that broke the benchmark row.
 */
const SYNCED_BUY_AND_HOLD: Record<string, Partial<Record<WindowId, [number, number]>>> = {
  // symbol: window → [totalReturnPct, cagrPct]
  SPY: {
    [WindowId.Y1]: [16.9469, 16.9972],
    [WindowId.Y10]: [299.0968, 14.8439],
    [WindowId.Max]: [2959.8449, 10.7473],
  },
  XLK: {
    [WindowId.Y1]: [31.7073, 31.807],
    [WindowId.Y10]: [732.8672, 23.6111],
    [WindowId.Max]: [1330.7332, 10.1153],
  },
  'BTC-USD': {
    [WindowId.Y1]: [-45.8977, -45.8977],
    [WindowId.Y10]: [9639.8795, 58.0721],
    [WindowId.Max]: [13865.9946, 51.6131],
  },
  GLD: {
    [WindowId.Y1]: [22.3854, 22.4533],
    [WindowId.Y10]: [191.0924, 11.2764],
    [WindowId.Max]: [741.2149, 10.3113],
  },
  TLT: {
    [WindowId.Y1]: [1.4487, 1.4527],
    [WindowId.Y10]: [-20.8898, -2.316],
    [WindowId.Max]: [132.2477, 3.5721],
  },
};

/** The same sync's SMA Cross 50/200, as [excessCagrPct, beatsBenchmark]. */
const SYNCED_SMA_CROSS: Record<string, Partial<Record<WindowId, [number, boolean]>>> = {
  SPY: {
    [WindowId.Y1]: [0, false],
    [WindowId.Y10]: [-4.7338, false],
    [WindowId.Max]: [-1.3828, false],
  },
  XLK: {
    [WindowId.Y1]: [0, false],
    [WindowId.Y10]: [-4.0015, false],
    [WindowId.Max]: [0.0238, true],
  },
  'BTC-USD': {
    [WindowId.Y1]: [25.594, true],
    [WindowId.Y10]: [-3.1612, false],
    [WindowId.Max]: [-0.2627, false],
  },
  GLD: {
    [WindowId.Y1]: [-1.2426, false],
    [WindowId.Y10]: [-3.3799, false],
    [WindowId.Max]: [-2.27, false],
  },
  TLT: {
    [WindowId.Y1]: [-3.283, false],
    [WindowId.Y10]: [1.4458, true],
    [WindowId.Max]: [-2.1272, false],
  },
};

function syncedReport(): DailyReport {
  return makeReport(
    Object.keys(SYNCED_BUY_AND_HOLD).map((symbol) =>
      makeAsset(symbol, [
        makeStrategy('buy_and_hold', {
          name: 'Buy & Hold',
          kind: StrategyKind.Benchmark,
          windows: Object.entries(SYNCED_BUY_AND_HOLD[symbol]).map(([window, [total, cagr]]) =>
            makeWindow(window as WindowId, {
              stats: makeStats({ totalReturnPct: total, cagrPct: cagr }),
            })
          ),
        }),
        makeStrategy('sma_cross_50_200', {
          windows: Object.entries(SYNCED_SMA_CROSS[symbol]).map(([window, [excess, beats]]) =>
            makeWindow(window as WindowId, {
              excessCagrPct: excess,
              beatsBenchmark: beats,
            })
          ),
        }),
      ])
    )
  );
}

describe('buildLeaderboard on real synced numbers', () => {
  const board = buildLeaderboard(syncedReport());
  const benchmarkAt = (window: WindowId) =>
    board.benchmark!.perWindow.find((w) => w.window === window)!;
  const strategyAt = (window: WindowId) =>
    board.rows
      .find((r) => r.strategyId === 'sma_cross_50_200')!
      .perWindow.find((w) => w.window === window)!;

  it('reports what holding returned on the typical asset, not the average one', () => {
    // Sorted ten-year returns: −20.9, 191.1, 299.1, 732.9, 9639.9.
    expect(benchmarkAt(WindowId.Y10).medianTotalReturnPct).toBe(299.1);
    expect(benchmarkAt(WindowId.Y1).medianTotalReturnPct).toBe(16.9);
    expect(benchmarkAt(WindowId.Max).medianTotalReturnPct).toBe(1330.7);
  });

  it('is not dragged off by the one asset that returned 9,640%', () => {
    const tenYear = Object.values(SYNCED_BUY_AND_HOLD)
      .map((windows) => windows[WindowId.Y10]![0])
      .sort((a, b) => a - b);
    const mean = tenYear.reduce((s, v) => s + v, 0) / tenYear.length;
    const reported = benchmarkAt(WindowId.Y10).medianTotalReturnPct;

    // The mean of these five is +2168%, a number no asset here went near — and
    // being an average of one runaway, it printed a ten-year cell higher than
    // the twenty-year one on the real report.
    expect(mean).toBeGreaterThan(2000);
    expect(reported).toBeLessThan(mean / 5);

    // Whatever it reports has to be a return some asset actually had, give or
    // take the midpoint on an even count.
    expect(reported).toBeGreaterThanOrEqual(tenYear[0]);
    expect(reported).toBeLessThanOrEqual(tenYear.at(-2)!);
  });

  it('keeps the annualized rate on the same asset as the return', () => {
    // Sorted ten-year CAGRs: −2.3, 11.3, 14.8, 23.6, 58.1 — the median is SPY's,
    // the same asset the median return came from.
    expect(benchmarkAt(WindowId.Y10).medianCagrPct).toBe(14.8);
    expect(benchmarkAt(WindowId.Y1).medianCagrPct).toBe(17);
  });

  it('leaves each window covering only the assets that have that much history', () => {
    expect(benchmarkAt(WindowId.Y10).assetsCovered).toBe(5);
    expect(board.benchmark!.assetsCovered).toBe(5);
  });

  it('counts a win only where the rule beat holding on return and drawdown both', () => {
    // One of five in each window, and never the same asset twice.
    expect(strategyAt(WindowId.Y1).winRatePct).toBe(20);
    expect(strategyAt(WindowId.Y10).winRatePct).toBe(20);
    expect(strategyAt(WindowId.Max).winRatePct).toBe(20);
  });

  it('averages excess CAGR across the assets that ran the window', () => {
    expect(strategyAt(WindowId.Y1).avgExcessCagrPct).toBe(4.2);
    expect(strategyAt(WindowId.Y10).avgExcessCagrPct).toBe(-2.8);
    expect(strategyAt(WindowId.Max).avgExcessCagrPct).toBe(-1.2);
  });

  it('pools the overall win rate over every asset-window pair, not over windows', () => {
    const row = board.rows.find((r) => r.strategyId === 'sma_cross_50_200')!;
    // 3 wins out of 15 pairs.
    expect(row.overallWinRatePct).toBe(20);
    expect(row.assetsCovered).toBe(5);
  });
});
