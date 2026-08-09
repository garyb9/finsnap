/**
 * Compact projections of the daily report.
 *
 * The full report carries every strategy across every window — thousands of
 * numbers, which is what you want stored and queryable but not what you want
 * pushed at a reader or shipped as a default API payload. These projections
 * keep the decision and the one or two numbers that justify it.
 */

import {
  StrategyKind,
  type SignalAction,
  type StrategyReport,
  type WindowId,
  type WindowResult,
} from '../backtest/types';
import { HEADLINE_WINDOWS, YEAR_MS } from '../constants';
import { round } from '../lib/math';
import type { AssetClass } from '../config';
import type { AssetOpportunity, DailyReport } from './types';

export interface CompactWindow {
  window: WindowId;
  label: string;
  /**
   * Wall-clock years the window actually covered.
   *
   * Carried explicitly because the label is approximate ("5 years" may be 4.9)
   * and `max` has no fixed length at all — compounding a CAGR against a guessed
   * horizon would quietly misstate every figure derived from it.
   */
  years: number;
  cagrPct: number;
  benchmarkCagrPct: number;
  maxDrawdownPct: number;
  benchmarkMaxDrawdownPct: number;
  sharpe: number;
  numTrades: number;
  winRatePct: number;
  beatsBenchmark: boolean;
}

/**
 * One window reduced to the three fields a per-window strip needs: which
 * window, whether the rule beat holding, and by how much. Ten of these per
 * strategy is small enough to ship in the compact payload.
 */
export interface WindowMark {
  window: WindowId;
  beatsBenchmark: boolean;
  excessCagrPct: number;
}

export interface CompactStrategy {
  id: string;
  name: string;
  kind: StrategyKind;
  action: SignalAction;
  barsInState: number;
  opportunityScore: number;
  edgeScore: number;
  headline: CompactWindow | null;
  /** Every evaluated window, longest first — drives the edge strip in the UI */
  marks: WindowMark[];
  rationale: string;
}

export interface CompactAsset {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  lastClose: number;
  lastChangePct: number;
  size?: AssetOpportunity['size'];
  consensus: AssetOpportunity['consensus'];
  tsmom?: { score: number; label: string };
  momentum?: number;
  bollinger?: AssetOpportunity['bollinger'];
  regime?: AssetOpportunity['regime'];
  options?: AssetOpportunity['options'];
  notes: string[];
  /** Highest-scoring strategies for today, longest-standing edge first */
  top: CompactStrategy[];
}

export interface CompactReport {
  id: string;
  date: string;
  generatedAt: string;
  summary: DailyReport['summary'];
  topOpportunities: DailyReport['topOpportunities'];
  assets: CompactAsset[];
}

function pickHeadline(windows: WindowResult[]): CompactWindow | null {
  const chosen =
    HEADLINE_WINDOWS.map((id) => windows.find((w) => w.window === id)).find(Boolean) ?? windows[0];
  if (!chosen) return null;

  const years = (chosen.stats.endTime - chosen.stats.startTime) / YEAR_MS;

  return {
    window: chosen.window,
    label: chosen.label,
    years: round(years, 2),
    cagrPct: round(chosen.stats.cagrPct),
    benchmarkCagrPct: round(chosen.benchmark.cagrPct),
    maxDrawdownPct: round(chosen.stats.maxDrawdownPct),
    benchmarkMaxDrawdownPct: round(chosen.benchmark.maxDrawdownPct),
    sharpe: round(chosen.stats.sharpe, 2),
    numTrades: chosen.stats.numTrades,
    winRatePct: round(chosen.stats.winRatePct),
    beatsBenchmark: chosen.beatsBenchmark,
  };
}

export function compactStrategy(report: StrategyReport): CompactStrategy {
  return {
    id: report.strategyId,
    name: report.name,
    kind: report.kind,
    action: report.signal.action,
    barsInState: report.signal.barsInState,
    opportunityScore: report.opportunityScore,
    edgeScore: report.edgeScore,
    headline: pickHeadline(report.windows),
    marks: report.windows.map((w) => ({
      window: w.window,
      beatsBenchmark: w.beatsBenchmark,
      excessCagrPct: round(w.excessCagrPct),
    })),
    rationale: report.rationale,
  };
}

export function compactAsset(asset: AssetOpportunity, topN = 5): CompactAsset {
  return {
    symbol: asset.symbol,
    label: asset.label,
    assetClass: asset.assetClass,
    lastClose: round(asset.lastClose, 2),
    lastChangePct: round(asset.lastChangePct, 2),
    size: asset.size,
    consensus: asset.consensus,
    tsmom: asset.tsmom,
    momentum: asset.momentum,
    bollinger: asset.bollinger && {
      ...asset.bollinger,
      bandwidth: round(asset.bollinger.bandwidth, 2),
      percentB: round(asset.bollinger.percentB, 3),
    },
    options: asset.options,
    regime: asset.regime,
    notes: asset.notes,
    top: asset.daily
      .filter((s) => s.kind !== StrategyKind.Benchmark)
      .slice(0, topN)
      .map(compactStrategy),
  };
}

export function compactReport(report: DailyReport, topN = 5): CompactReport {
  return {
    id: report.id,
    date: report.date,
    generatedAt: report.generatedAt,
    summary: report.summary,
    topOpportunities: report.topOpportunities,
    assets: report.assets.map((a) => compactAsset(a, topN)),
  };
}
