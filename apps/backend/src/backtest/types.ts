import type { Bar } from '../collectors/types';
import { SignalAction, StrategyKind, WindowId } from '../constants/enums';

export { SignalAction, StrategyKind, WindowId };

/**
 * Target exposure for the *next* bar, decided at the close of bar `i`:
 *   1 = fully long, 0 = flat.
 *
 * Signals are always shifted by one bar at execution time, so a strategy can
 * never trade on a price it would not have known yet. This is why the daily
 * report is honest: it reads yesterday's close and acts at today's open.
 */
export type Signal = number;

export interface StrategyDef {
  /** Stable id used in storage and API responses — e.g. `ema_cross_12_26` */
  id: string;
  name: string;
  kind: StrategyKind;
  /** One-line plain-English description of the rule */
  description: string;
  params: Record<string, number>;
  /** Bars required before the strategy can produce a meaningful signal */
  warmup: number;
  /** Compute target exposure per bar from the full series */
  signals(bars: Bar[]): Signal[];
}

export interface Trade {
  entryTime: number;
  exitTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  /** Net return including fees and slippage, as a percentage */
  returnPct: number;
  barsHeld: number;
  /** True while the trade is still open at the end of the tested window */
  open: boolean;
}

export interface BacktestStats {
  startTime: number;
  endTime: number;
  bars: number;
  initialCapital: number;
  finalValue: number;
  totalReturnPct: number;
  /** Compound annual growth rate, percent */
  cagrPct: number;
  /** Annualized standard deviation of returns, percent */
  volatilityPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  /** CAGR / |max drawdown| — return per unit of pain */
  calmar: number;
  /** Percentage of closed trades that were profitable */
  winRatePct: number;
  profitFactor: number;
  numTrades: number;
  avgTradeReturnPct: number;
  avgBarsHeld: number;
  /** Share of bars spent holding the asset, percent */
  exposurePct: number;
  bestTradePct: number;
  worstTradePct: number;
}

export interface BacktestResult {
  stats: BacktestStats;
  trades: Trade[];
  /** Equity value per bar of the tested window */
  equity: number[];
}

export interface BacktestOptions {
  initialCapital: number;
  /** Round-trip cost applied on each fill, in basis points */
  feeBps: number;
  /** Adverse price movement applied on each fill, in basis points */
  slippageBps: number;
  /** Bars per year, used to annualize — 252 for equities, 365 for crypto */
  periodsPerYear: number;
}

/** A named lookback window, e.g. "5y" or "3mo". */
export interface WindowSpec {
  id: WindowId;
  label: string;
  /** Approximate calendar days back from the last bar; null means all history */
  days: number | null;
}

export interface WindowResult {
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
  /** Strategy CAGR minus buy-and-hold CAGR, in percentage points */
  excessCagrPct: number;
  /** True when the strategy beat buy-and-hold on both return and drawdown */
  beatsBenchmark: boolean;
}

export interface TodaySignal {
  action: SignalAction;
  /** Target exposure for the next bar */
  target: number;
  /** Exposure the strategy held going into the last close */
  previous: number;
  /** How many bars the strategy has been in its current state */
  barsInState: number;
  /** Close of the last completed bar */
  lastClose: number;
  /** Timestamp of the last completed bar */
  lastBarTime: number;
}

export interface StrategyReport {
  strategyId: string;
  name: string;
  kind: StrategyKind;
  description: string;
  params: Record<string, number>;
  signal: TodaySignal;
  /** Results per lookback window, longest first */
  windows: WindowResult[];
  /** 0-100 confidence that this strategy has a durable edge on this asset */
  edgeScore: number;
  /** 0-100 attractiveness of acting on this strategy's signal today */
  opportunityScore: number;
  /** Short human-readable justification */
  rationale: string;
}
