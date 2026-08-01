import type { BacktestStats, WindowId } from './types';
import { PairRegimeStatus, SpreadDirection } from '../constants/enums';

export { PairRegimeStatus, SpreadDirection };

/**
 * Result of testing one candidate pair for cointegration — the output of
 * `analyzers/pairs.ts`'s `scanPairs`, and the fixed "rule" a pair trades
 * under once selected (mirrors how a `StrategyDef`'s params are fixed
 * before it's backtested across windows).
 */
export interface PairCandidate {
  legA: string;
  legB: string;
  rationale: string;
  /** Hedge ratio: spread_t = priceA_t - beta * priceB_t */
  beta: number;
  alpha: number;
  /** Worse (larger) of the two Engle-Granger regression directions' p-values. */
  pValue: number;
  hurst: number;
  halfLifeDays: number;
  equilibriumStd: number;
  /** True only when Engle-Granger passes both directions, Hurst < 0.5, and half-life is in the tradeable 5-60 day range. */
  cointegrated: boolean;
}

/** Target position on the spread for the *next* bar, decided at today's close. */
export type PairSignal = SpreadDirection;

export interface PairTodaySignal {
  direction: PairSignal;
  previousDirection: PairSignal;
  barsInState: number;
  /** Current z-score of the spread — the number the direction was decided from. */
  currentZ: number;
  lastBarTime: number;
}

export interface PairWindowResult {
  window: WindowId;
  label: string;
  stats: BacktestStats;
}

/**
 * One pair's full report — the two-leg analog of `StrategyReport`.
 *
 * Deliberately does not carry an edge/opportunity score the way
 * `StrategyReport` does: that scoring is built entirely around "beats
 * buy-and-hold", which has no clean meaning for a dollar-neutral spread
 * (buy-and-hold on a hedged pair is closer to cash than to a benchmark).
 * `regimeStatus` is this report's answer to "should this be trusted right
 * now" instead.
 */
export interface PairReport {
  pairId: string;
  legA: string;
  legB: string;
  rationale: string;
  hedgeRatio: number;
  halfLifeDays: number;
  hurst: number;
  pValue: number;
  regimeStatus: PairRegimeStatus;
  signal: PairTodaySignal;
  /** Results per lookback window, longest first. */
  windows: PairWindowResult[];
}
