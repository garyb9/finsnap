/**
 * Cointegration-based pair selection and spread signal generation.
 *
 * Structural sibling of `analyzers/correlation.ts` — same "loop every
 * candidate, build a daily-return-aligned series, score it" shape — but
 * testing cointegration instead of correlation, because a correlated pair
 * can drift apart permanently while a cointegrated one has a statistical
 * anchor pulling it back. See `analyzers/stats/` for the underlying tests.
 */

import type { Bar } from '../collectors/types';
import type { PairCandidateSpec } from '../constants/pairs';
import { PairRegimeStatus, SpreadDirection, type PairCandidate } from '../backtest/pairsTypes';
import { augmentedDickeyFuller } from './stats/adf';
import { hurstExponent } from './stats/hurst';
import { fitOuProcess, isTradeable, TRADEABLE_HALF_LIFE_DAYS } from './stats/ouProcess';
import { regress } from './stats/ols';
import { DAY_MS } from '../constants/time';
import { isoDate } from '../lib/format';
import { clamp, mean, sampleStdev } from '../lib/math';

/** Below this many paired daily observations, a cointegration test is too noisy to trust. */
export const MIN_COINTEGRATION_SAMPLE = 250;

/**
 * How much recent history the cointegration test itself looks at.
 *
 * This is *not* the same window `evaluatePair` later backtests across (which
 * legitimately spans full history) — it's how much data decides whether a
 * pair is cointegrated *right now*. Fitting the OU process over decades
 * collapses the half-life to hundreds or thousands of days: a single fit
 * across that much regime change is dominated by slow structural drift, not
 * the fast reversion the strategy needs, so a genuinely tradeable pair on
 * a 1-2 year view can look untradeable over 20 years. Two years balances
 * enough samples for the ADF test against staying close to the current
 * regime.
 */
export const COINTEGRATION_LOOKBACK_DAYS = 730;

/** Close price keyed by calendar day — same alignment approach `analyzers/correlation.ts` uses. */
function closesByDate(bars: Bar[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const bar of bars) out.set(isoDate(bar.time), bar.close);
  return out;
}

export interface AlignedSeries {
  dates: string[];
  a: number[];
  b: number[];
}

/** Closes on the dates both legs actually traded, in date order. */
export function alignSeries(barsA: Bar[], barsB: Bar[]): AlignedSeries {
  const ca = closesByDate(barsA);
  const cb = closesByDate(barsB);
  const dates = [...ca.keys()].filter((d) => cb.has(d)).sort();
  return { dates, a: dates.map((d) => ca.get(d)!), b: dates.map((d) => cb.get(d)!) };
}

export interface AlignedBarPair {
  time: number;
  a: Bar;
  b: Bar;
}

/**
 * Full OHLC bars on the dates both legs traded, in date order — what
 * `backtest/pairsEngine.ts` executes against. Kept separate from
 * `alignSeries` (closes only) because the cointegration test only ever
 * needs closing prices, while execution needs the open to fill at, the same
 * way the single-asset engine does.
 */
export function alignBars(barsA: Bar[], barsB: Bar[]): AlignedBarPair[] {
  const byDateA = new Map(barsA.map((b) => [isoDate(b.time), b]));
  const byDateB = new Map(barsB.map((b) => [isoDate(b.time), b]));
  const dates = [...byDateA.keys()].filter((d) => byDateB.has(d)).sort();

  return dates.map((d) => ({
    time: byDateA.get(d)!.time,
    a: byDateA.get(d)!,
    b: byDateB.get(d)!,
  }));
}

/**
 * Test one candidate pair for cointegration.
 *
 * Engle-Granger is run in both directions (A on B, and B on A) — a genuine
 * cointegrating relationship confirms in both; a pair passing only one
 * direction is weaker than it looks. The Hurst exponent of the resulting
 * spread is an independent second check that it actually mean-reverts
 * rather than having passed ADF by chance, and the OU half-life gates out
 * pairs too fast or too slow to trade profitably after costs.
 */
export function testPairCointegration(
  spec: PairCandidateSpec,
  aligned: AlignedSeries
): PairCandidate {
  const { a, b } = aligned;

  // legA is the dependent variable by convention — spread = a - beta*b - alpha.
  const forward = regress(a, b);
  const reverse = regress(b, a);

  const forwardAdf = augmentedDickeyFuller(forward.residuals);
  const reverseAdf = augmentedDickeyFuller(reverse.residuals);

  const spread = forward.residuals;
  const hurst = hurstExponent(spread);
  const ou = fitOuProcess(spread);

  const cointegrated =
    forwardAdf.stationary && reverseAdf.stationary && hurst < 0.5 && isTradeable(ou);

  return {
    legA: spec.legA,
    legB: spec.legB,
    rationale: spec.rationale,
    beta: forward.beta,
    alpha: forward.alpha,
    // Worse (larger) of the two directions — a conservative single p-value for display/monitoring.
    pValue: Math.max(forwardAdf.pValue, reverseAdf.pValue),
    hurst,
    halfLifeDays: ou.halfLife,
    equilibriumStd: ou.equilibriumStd,
    cointegrated,
  };
}

/** Bars from the last `COINTEGRATION_LOOKBACK_DAYS`, relative to that series' own most recent bar. */
function recentBars(bars: Bar[]): Bar[] {
  if (bars.length === 0) return bars;
  const cutoff = bars[bars.length - 1].time - COINTEGRATION_LOOKBACK_DAYS * DAY_MS;
  return bars.filter((b) => b.time >= cutoff);
}

/** Test every candidate that has enough shared recent history; skip the rest rather than erroring. */
export function scanPairs(
  barsBySymbol: Map<string, Bar[]>,
  candidates: PairCandidateSpec[]
): PairCandidate[] {
  const out: PairCandidate[] = [];

  for (const spec of candidates) {
    const barsA = barsBySymbol.get(spec.legA);
    const barsB = barsBySymbol.get(spec.legB);
    if (!barsA || !barsB) continue;

    const aligned = alignSeries(recentBars(barsA), recentBars(barsB));
    if (aligned.dates.length < MIN_COINTEGRATION_SAMPLE) continue;

    out.push(testPairCointegration(spec, aligned));
  }

  return out;
}

/** Rolling z-score of a spread series over a trailing `lookback` bars. */
export function computeSpreadZScore(spread: number[], lookback: number): number[] {
  const out = new Array<number>(spread.length).fill(NaN);
  for (let i = lookback; i < spread.length; i++) {
    const window = spread.slice(i - lookback, i);
    const sd = sampleStdev(window);
    out[i] = sd > 0 ? (spread[i] - mean(window)) / sd : NaN;
  }
  return out;
}

/**
 * Z-score rolling lookback, sized to the pair's own half-life (2-3x, per
 * the article) rather than a fixed window every pair shares — a fast-
 * reverting pair needs a short memory, a slow one a long one. Clamped to a
 * sane bar-count range so a half-life at either extreme of the tradeable
 * band doesn't produce a degenerate lookback.
 */
export function zscoreLookback(halfLifeDays: number): number {
  return Math.round(clamp(halfLifeDays * 2.5, 10, 120));
}

/**
 * Minimum entry z-score below which expected convergence profit doesn't
 * cover round-trip costs. Four transactions — both legs, in and out.
 */
export function minimumEntryZ(equilibriumStd: number, costBps: number): number {
  if (!Number.isFinite(equilibriumStd) || equilibriumStd <= 0) return Infinity;
  const costFraction = costBps / 10_000;
  return (4 * costFraction) / equilibriumStd;
}

/** Exit roughly halfway back to the mean — captures most of the expected reversion profit without the low-return final stretch. */
export function exitZFor(entryZ: number): number {
  return entryZ / 2;
}

/** Fraction of max allocation, proportional to how stretched the spread is — largest at entry, tapering toward exit. */
export function ouPositionSize(z: number, entryZ: number): number {
  if (!Number.isFinite(z) || entryZ <= 0) return 0;
  return clamp(Math.abs(z) / entryZ, 0, 1);
}

/**
 * Turn a z-score series into a spread-direction state machine.
 *
 * Symmetric around zero: a spread far above its mean is shorted (legA rich,
 * legB cheap), far below is bought — mirroring the sign convention that
 * `spread = priceA - beta*priceB`.
 */
export function generatePairSignals(
  zscore: number[],
  entryZ: number,
  exitZ: number
): SpreadDirection[] {
  const out = new Array<SpreadDirection>(zscore.length).fill(SpreadDirection.Flat);
  let position = SpreadDirection.Flat;

  for (let i = 0; i < zscore.length; i++) {
    const z = zscore[i];

    if (Number.isFinite(z)) {
      if (position === SpreadDirection.Flat) {
        if (z >= entryZ) position = SpreadDirection.ShortSpread;
        else if (z <= -entryZ) position = SpreadDirection.LongSpread;
      } else if (position === SpreadDirection.ShortSpread && z <= exitZ) {
        position = SpreadDirection.Flat;
      } else if (position === SpreadDirection.LongSpread && z >= -exitZ) {
        position = SpreadDirection.Flat;
      }
    }

    out[i] = position;
  }

  return out;
}

/**
 * Three-state daily health check on a pair's cointegrating relationship.
 *
 * A binary switch would create a cliff the day a rolling p-value crosses a
 * threshold; `Warning` is the buffer between "trade normally" and "stand
 * aside" — hold what's open, open nothing new, watch closely.
 */
export function regimeStatus(
  pValue: number,
  halfLifeDays: number,
  warnP = 0.1,
  haltP = 0.2
): PairRegimeStatus {
  const halfLifeOk =
    Number.isFinite(halfLifeDays) &&
    halfLifeDays >= TRADEABLE_HALF_LIFE_DAYS.min &&
    halfLifeDays <= TRADEABLE_HALF_LIFE_DAYS.max;

  if (pValue < warnP && halfLifeOk) return PairRegimeStatus.Active;
  if (pValue < haltP && halfLifeOk) return PairRegimeStatus.Warning;
  return PairRegimeStatus.Halted;
}
