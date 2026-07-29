import type { StrategyKind, WindowId } from './enums';

/** A strategy's record on one lookback window, pooled across every asset that ran it. */
export type WindowLeaderboardCell = {
  window: WindowId;
  label: string;
  assetsCovered: number;
  winRatePct: number;
  avgExcessCagrPct: number;
};

export type StrategyLeaderboardRow = {
  strategyId: string;
  name: string;
  kind: StrategyKind;
  assetsCovered: number;
  overallWinRatePct: number;
  overallAvgExcessCagrPct: number;
  avgEdgeScore: number;
  perWindow: WindowLeaderboardCell[];
};

export type BenchmarkWindowCell = {
  window: WindowId;
  label: string;
  assetsCovered: number;
  avgCagrPct: number;
};

export type BenchmarkSummary = {
  name: string;
  assetsCovered: number;
  overallAvgCagrPct: number;
  perWindow: BenchmarkWindowCell[];
};

export type StrategyLeaderboard = {
  id: string;
  date: string;
  generatedAt: string;
  assetsAnalyzed: number;
  windows: { id: WindowId; label: string }[];
  rows: StrategyLeaderboardRow[];
  bestOverall: string | null;
  bestPerWindow: Partial<Record<WindowId, string>>;
  benchmark: BenchmarkSummary | null;
};
