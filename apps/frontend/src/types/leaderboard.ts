import type { AssetClass, StrategyKind, WindowId } from './enums';

/** A strategy's record on one lookback window, pooled across every asset that ran it. */
export type WindowLeaderboardCell = {
  window: WindowId;
  label: string;
  assetsCovered: number;
  winRatePct: number;
  avgExcessCagrPct: number;
};

/** A strategy's record on one asset class, pooled across every window and every asset in that class. */
export type ClassLeaderboardCell = {
  assetClass: AssetClass;
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
  byAssetClass: ClassLeaderboardCell[];
};

export type BenchmarkWindowCell = {
  window: WindowId;
  label: string;
  assetsCovered: number;
  avgCagrPct: number;
  /** What holding returned over this window on the typical asset — the unit the column is in. */
  medianTotalReturnPct: number;
  /** That same asset's annualized rate. */
  medianCagrPct: number;
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
  /** False when the top row only loses least — do not call it a winner. */
  bestBeatsBenchmark: boolean;
  bestPerWindow: Partial<Record<WindowId, string>>;
  benchmark: BenchmarkSummary | null;
};
