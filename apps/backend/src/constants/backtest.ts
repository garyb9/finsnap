import type { WindowSpec } from '../backtest/types';
import { SignalAction, Verdict, WindowId } from './enums';
import { YEAR_DAYS } from './time';

// --- Engine ---

/** Rebalances smaller than this share of portfolio value are skipped. */
export const MIN_TRADE_FRACTION = 1e-4;

/** Below this many bars an asset is not backtested at all. */
export const MIN_BARS_FOR_BACKTEST = 60;

/**
 * Minimum bars for a window to be reported at all.
 *
 * Set to 20 so the 1-month window survives on equities, where a calendar month
 * is only ~21 sessions. Statistics that short are genuinely noisy — the defence
 * is `WINDOW_WEIGHTS`, which gives 1mo a quarter of the pull of a mid-horizon
 * window when the edge score is computed, not silently dropping the window.
 */
export const MIN_WINDOW_BARS = 20;

/**
 * A strategy is only run when history comfortably exceeds its warm-up — at
 * exactly `warmup` bars the first signal would be the only signal.
 */
export const WARMUP_SAFETY_FACTOR = 1.5;

// --- Windows ---

/** Lookback windows for daily-bar backtests, longest first. */
export const DAILY_WINDOWS: WindowSpec[] = [
  { id: WindowId.Max, label: 'Max history', days: null },
  { id: WindowId.Y20, label: '20 years', days: 20 * YEAR_DAYS },
  { id: WindowId.Y10, label: '10 years', days: 10 * YEAR_DAYS },
  { id: WindowId.Y5, label: '5 years', days: 5 * YEAR_DAYS },
  { id: WindowId.Y3, label: '3 years', days: 3 * YEAR_DAYS },
  { id: WindowId.Y2, label: '2 years', days: 2 * YEAR_DAYS },
  { id: WindowId.Y1, label: '1 year', days: YEAR_DAYS },
  { id: WindowId.M6, label: '6 months', days: 182 },
  { id: WindowId.M3, label: '3 months', days: 91 },
  { id: WindowId.M1, label: '1 month', days: 30 },
];

/** Yahoo serves ~730 days of hourly history, so the long end is capped. */
export const INTRADAY_WINDOWS: WindowSpec[] = [
  { id: WindowId.Max, label: 'Max hourly', days: null },
  { id: WindowId.Y1, label: '1 year', days: YEAR_DAYS },
  { id: WindowId.M6, label: '6 months', days: 182 },
  { id: WindowId.M3, label: '3 months', days: 91 },
  { id: WindowId.M1, label: '1 month', days: 30 },
];

// --- Edge scoring ---

/**
 * How much each window counts toward the edge score.
 *
 * Mid-horizon windows dominate on purpose: two decades may describe a regime
 * that no longer exists, a single month is mostly noise, and three to five
 * years is long enough to contain a real drawdown while staying relevant.
 */
export const WINDOW_WEIGHTS: Record<WindowId, number> = {
  [WindowId.Max]: 1.0,
  [WindowId.Y20]: 1.0,
  [WindowId.Y10]: 1.2,
  [WindowId.Y5]: 1.5,
  [WindowId.Y3]: 1.6,
  [WindowId.Y2]: 1.5,
  [WindowId.Y1]: 1.3,
  [WindowId.M6]: 0.8,
  [WindowId.M3]: 0.5,
  [WindowId.M1]: 0.25,
};

/** Contribution of each comparison to a window score, and its mid-scale. */
export const EDGE_COMPONENTS = {
  excessCagr: { weight: 25, scale: 10 },
  sharpeDelta: { weight: 15, scale: 0.5 },
  drawdownImprovement: { weight: 10, scale: 15 },
} as const;

/** Blend of weighted window scores against win-rate-across-windows. */
export const EDGE_CONSISTENCY_BLEND = 0.2;

/** Trade count at which an edge score is trusted at full strength. */
export const EDGE_CONFIDENCE_TRADES = 20;

// --- Opportunity scoring ---

/**
 * How strongly each action carries the edge into today's opportunity score.
 * `enter` is the strategy's own entry, so it carries more than full weight;
 * `hold` decays as the position ages, since you would be buying later and
 * worse than the rule did.
 */
export const ACTION_EDGE_FACTOR = {
  [SignalAction.Enter]: 1.2,
  holdFresh: 0.75,
  holdStale: 0.35,
  [SignalAction.Exit]: -1.1,
  [SignalAction.StayOut]: -0.7,
} as const;

/** Bars over which a `hold` decays from fresh to stale weighting. */
export const HOLD_STALENESS_BARS = 250;

// --- Consensus ---

/** Below this edge score a strategy gets no vote in the consensus. */
export const MIN_VOTING_EDGE = 45;

/**
 * Total vote weight at which the consensus is trusted at face value.
 *
 * Weight, not headcount: if the only strategies with any edge at all are two
 * barely-qualifying ones, a unanimous split between them is not a verdict. Below
 * this the score is shrunk toward neutral, which is what stops an asset where
 * nothing works from being reported as a maximum-conviction AVOID.
 */
export const MIN_CONFIDENT_VOTE_WEIGHT = 2;

/** Edge required before a fired signal is surfaced as actionable. */
export const ACTIONABLE_EDGE = 55;

/** Edge above which a strategy counts as high-conviction for disagreement notes. */
export const HIGH_CONVICTION_EDGE = 65;

export const MAX_TOP_OPPORTUNITIES = 12;

/** Lower bound of each verdict band, highest first. */
export const VERDICT_THRESHOLDS = [
  { min: 72, verdict: Verdict.StrongBuy },
  { min: 58, verdict: Verdict.Accumulate },
  { min: 42, verdict: Verdict.Neutral },
  { min: 28, verdict: Verdict.Reduce },
  { min: -Infinity, verdict: Verdict.Avoid },
] as const;

/** Consensus score bands used for the bullish/bearish asset counts. */
export const BULLISH_CONSENSUS = 58;
export const BEARISH_CONSENSUS = 42;
