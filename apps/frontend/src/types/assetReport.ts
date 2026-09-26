import type { AssetSize, Consensus, OptionsContext } from './report';
import type { AssetClass, SignalAction, StrategyKind, WindowId } from './enums';

/**
 * The full per-asset report — every strategy, every lookback window, not just
 * the top-N the compact report trims to. Fetched on demand for one asset at a
 * time (`GET /report/asset/:label`) rather than folded into the app-wide
 * poll, since the chart page is the only place that needs a strategy the
 * compact top-N might not include.
 */

export type BacktestStats = {
  startTime: number;
  endTime: number;
  bars: number;
  initialCapital: number;
  finalValue: number;
  totalReturnPct: number;
  cagrPct: number;
  volatilityPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  calmar: number;
  winRatePct: number;
  profitFactor: number;
  numTrades: number;
  avgTradeReturnPct: number;
  avgBarsHeld: number;
  exposurePct: number;
  bestTradePct: number;
  worstTradePct: number;
};

export type WindowResult = {
  window: WindowId;
  label: string;
  stats: BacktestStats;
  /** Buy-and-hold over the identical window, for a like-for-like comparison */
  benchmark: {
    totalReturnPct: number;
    cagrPct: number;
    maxDrawdownPct: number;
    sharpe: number;
  };
  excessCagrPct: number;
  beatsBenchmark: boolean;
};

export type TodaySignal = {
  action: SignalAction;
  target: number;
  previous: number;
  barsInState: number;
  lastClose: number;
  lastBarTime: number;
};

export type StrategyReport = {
  strategyId: string;
  name: string;
  kind: StrategyKind;
  description: string;
  params: Record<string, number>;
  signal: TodaySignal;
  /** Longest window first */
  windows: WindowResult[];
  edgeScore: number;
  opportunityScore: number;
  rationale: string;
};

export type AssetReport = {
  id: string;
  date: string;
  symbol: string;
  label: string;
  assetClass: AssetClass;
  description?: string;
  lastClose: number;
  lastChangePct: number;
  size?: AssetSize;
  lastBarTime: number;
  historyStart: number;
  barsAnalyzed: number;
  consensus: Consensus;
  daily: StrategyReport[];
  intraday: StrategyReport[];
  tsmom?: { score: number; label: string };
  momentum?: number;
  bollinger?: {
    bandwidth: number;
    percentB: number;
    widthLabel: string;
    positionLabel: string;
  };
  options?: OptionsContext;
  notes: string[];
};
