/**
 * Cross-asset strategy leaderboard.
 *
 * The daily report answers "how did this strategy do on this asset". This
 * answers the question one level up: pooled across the whole universe, which
 * strategy actually has an edge, at which horizon, and does any of them beat
 * simply buying the asset at the start of the backtest and holding.
 *
 * Built entirely from numbers the report already computed per asset — this is
 * an aggregation, not a new backtest.
 */

import { StrategyKind, WindowId } from '../backtest/types';
import { DAILY_WINDOWS } from '../constants';
import { round } from '../lib/math';
import type { DailyReport } from './types';

/** A strategy's record on one lookback window, pooled across every asset that ran it. */
export interface WindowLeaderboardCell {
  window: WindowId;
  label: string;
  /** How many assets contributed a result for this strategy at this window */
  assetsCovered: number;
  /** Share of those assets where the strategy beat buy-and-hold, 0-100 */
  winRatePct: number;
  /** Mean of (strategy CAGR − buy-and-hold CAGR) across those assets */
  avgExcessCagrPct: number;
}

export interface StrategyLeaderboardRow {
  strategyId: string;
  name: string;
  kind: StrategyKind;
  /** Distinct assets this strategy produced any result for */
  assetsCovered: number;
  /** Win rate against buy-and-hold, pooled across every asset × window pair */
  overallWinRatePct: number;
  overallAvgExcessCagrPct: number;
  /** Mean of the per-asset edge scores this strategy earned */
  avgEdgeScore: number;
  /** Longest window first, matching the report's own ordering */
  perWindow: WindowLeaderboardCell[];
}

/** Buy-and-hold's own realized return on one window — the bar every row above is measured against. */
export interface BenchmarkWindowCell {
  window: WindowId;
  label: string;
  assetsCovered: number;
  avgCagrPct: number;
}

export interface BenchmarkSummary {
  name: string;
  assetsCovered: number;
  overallAvgCagrPct: number;
  perWindow: BenchmarkWindowCell[];
}

export interface StrategyLeaderboard {
  id: string;
  date: string;
  generatedAt: string;
  assetsAnalyzed: number;
  windows: { id: WindowId; label: string }[];
  /** Ranked by overall win rate against buy-and-hold, best first */
  rows: StrategyLeaderboardRow[];
  /** The strategy that beats buy-and-hold most consistently across the whole universe */
  bestOverall: string | null;
  /** The strategy that wins each individual horizon, where enough assets ran it */
  bestPerWindow: Partial<Record<WindowId, string>>;
  /** Buy-and-hold itself, pooled the same way — null only when the report has no assets */
  benchmark: BenchmarkSummary | null;
}

/**
 * A window only enters the ranking once at least this share of the universe
 * ran it. Without a floor, a strategy that only cleared warm-up on one or two
 * young tickers could "win" a window on an n of 1.
 */
const MIN_COVERAGE_RATIO = 0.5;

interface Accumulator {
  strategyId: string;
  name: string;
  kind: StrategyKind;
  assets: Set<string>;
  edgeScoreSum: number;
  edgeScoreCount: number;
  totalBeats: number;
  totalCount: number;
  totalExcessCagrSum: number;
  perWindow: Map<
    WindowId,
    { label: string; assetsCovered: number; beats: number; excessCagrSum: number }
  >;
}

function accumulate(report: DailyReport): Map<string, Accumulator> {
  const accs = new Map<string, Accumulator>();

  for (const asset of report.assets) {
    for (const strategy of asset.daily) {
      if (strategy.kind === StrategyKind.Benchmark) continue;

      let acc = accs.get(strategy.strategyId);
      if (!acc) {
        acc = {
          strategyId: strategy.strategyId,
          name: strategy.name,
          kind: strategy.kind,
          assets: new Set(),
          edgeScoreSum: 0,
          edgeScoreCount: 0,
          totalBeats: 0,
          totalCount: 0,
          totalExcessCagrSum: 0,
          perWindow: new Map(),
        };
        accs.set(strategy.strategyId, acc);
      }

      acc.assets.add(asset.symbol);
      acc.edgeScoreSum += strategy.edgeScore;
      acc.edgeScoreCount += 1;

      for (const w of strategy.windows) {
        acc.totalBeats += w.beatsBenchmark ? 1 : 0;
        acc.totalCount += 1;
        acc.totalExcessCagrSum += w.excessCagrPct;

        let wAcc = acc.perWindow.get(w.window);
        if (!wAcc) {
          wAcc = { label: w.label, assetsCovered: 0, beats: 0, excessCagrSum: 0 };
          acc.perWindow.set(w.window, wAcc);
        }
        wAcc.assetsCovered += 1;
        wAcc.beats += w.beatsBenchmark ? 1 : 0;
        wAcc.excessCagrSum += w.excessCagrPct;
      }
    }
  }

  return accs;
}

function toRow(acc: Accumulator): StrategyLeaderboardRow {
  return {
    strategyId: acc.strategyId,
    name: acc.name,
    kind: acc.kind,
    assetsCovered: acc.assets.size,
    overallWinRatePct: acc.totalCount > 0 ? round((acc.totalBeats / acc.totalCount) * 100) : 0,
    overallAvgExcessCagrPct:
      acc.totalCount > 0 ? round(acc.totalExcessCagrSum / acc.totalCount) : 0,
    avgEdgeScore: acc.edgeScoreCount > 0 ? round(acc.edgeScoreSum / acc.edgeScoreCount) : 0,
    perWindow: DAILY_WINDOWS.map((spec) => {
      const w = acc.perWindow.get(spec.id);
      if (!w || w.assetsCovered === 0) return null;
      return {
        window: spec.id,
        label: w.label,
        assetsCovered: w.assetsCovered,
        winRatePct: round((w.beats / w.assetsCovered) * 100),
        avgExcessCagrPct: round(w.excessCagrSum / w.assetsCovered),
      };
    }).filter((cell): cell is WindowLeaderboardCell => cell !== null),
  };
}

/**
 * Buy-and-hold's own record, pooled the same way as a strategy row — except
 * there is no "beats benchmark" to measure, so this tracks its own realized
 * CAGR per window rather than a win rate.
 */
function buildBenchmark(report: DailyReport): BenchmarkSummary | null {
  const assets = new Set<string>();
  let cagrSum = 0;
  let cagrCount = 0;
  const perWindow = new Map<WindowId, { label: string; assetsCovered: number; cagrSum: number }>();
  let name = 'Buy & Hold';

  for (const asset of report.assets) {
    const benchmarkStrategy = asset.daily.find((s) => s.kind === StrategyKind.Benchmark);
    if (!benchmarkStrategy) continue;

    assets.add(asset.symbol);
    name = benchmarkStrategy.name;

    for (const w of benchmarkStrategy.windows) {
      cagrSum += w.stats.cagrPct;
      cagrCount += 1;

      let wAcc = perWindow.get(w.window);
      if (!wAcc) {
        wAcc = { label: w.label, assetsCovered: 0, cagrSum: 0 };
        perWindow.set(w.window, wAcc);
      }
      wAcc.assetsCovered += 1;
      wAcc.cagrSum += w.stats.cagrPct;
    }
  }

  if (assets.size === 0) return null;

  return {
    name,
    assetsCovered: assets.size,
    overallAvgCagrPct: cagrCount > 0 ? round(cagrSum / cagrCount) : 0,
    perWindow: DAILY_WINDOWS.map((spec) => {
      const w = perWindow.get(spec.id);
      if (!w || w.assetsCovered === 0) return null;
      return {
        window: spec.id,
        label: w.label,
        assetsCovered: w.assetsCovered,
        avgCagrPct: round(w.cagrSum / w.assetsCovered),
      };
    }).filter((cell): cell is BenchmarkWindowCell => cell !== null),
  };
}

/** Highest `primary` wins; ties broken by `secondary`. Null on an empty field. */
function pickBest<T>(items: T[], primary: (t: T) => number, secondary: (t: T) => number): T | null {
  return items.reduce<T | null>((best, cur) => {
    if (!best) return cur;
    if (primary(cur) > primary(best)) return cur;
    if (primary(cur) === primary(best) && secondary(cur) > secondary(best)) return cur;
    return best;
  }, null);
}

export function buildLeaderboard(report: DailyReport): StrategyLeaderboard {
  const rows = [...accumulate(report).values()]
    .map(toRow)
    .sort((a, b) => b.overallWinRatePct - a.overallWinRatePct);

  const universeSize = report.assets.length;
  const minCoverage = Math.ceil(universeSize * MIN_COVERAGE_RATIO);

  const bestOverall = pickBest(
    rows.filter((r) => r.assetsCovered >= minCoverage),
    (r) => r.overallWinRatePct,
    (r) => r.overallAvgExcessCagrPct
  );

  const bestPerWindow: Partial<Record<WindowId, string>> = {};
  for (const spec of DAILY_WINDOWS) {
    const candidates = rows
      .map((r) => ({ row: r, cell: r.perWindow.find((c) => c.window === spec.id) }))
      .filter(
        (x): x is { row: StrategyLeaderboardRow; cell: WindowLeaderboardCell } =>
          x.cell !== undefined && x.cell.assetsCovered >= minCoverage
      );

    const best = pickBest(
      candidates,
      (x) => x.cell.winRatePct,
      (x) => x.cell.avgExcessCagrPct
    );
    if (best) bestPerWindow[spec.id] = best.row.strategyId;
  }

  return {
    id: report.id,
    date: report.date,
    generatedAt: report.generatedAt,
    assetsAnalyzed: universeSize,
    windows: DAILY_WINDOWS.map((w) => ({ id: w.id, label: w.label })),
    rows,
    bestOverall: bestOverall?.strategyId ?? null,
    bestPerWindow,
    benchmark: buildBenchmark(report),
  };
}
