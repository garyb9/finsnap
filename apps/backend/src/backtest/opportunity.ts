/**
 * Turning backtests into a decision.
 *
 * Two distinct questions are scored separately, because conflating them is the
 * usual way a backtest becomes misleading:
 *
 *   edgeScore        — does this rule have a durable edge on this asset?
 *                      A property of history, independent of today.
 *   opportunityScore — is *today* an attractive moment to act on that rule?
 *                      A property of the current signal, weighted by the edge.
 *
 * A great strategy sitting mid-trend is not the same as a great strategy firing
 * a fresh entry, and neither is the same as a mediocre strategy doing either.
 */

import type { Bar } from '../collectors/types';
import {
  ACTION_EDGE_FACTOR,
  ACTION_PHRASE,
  EDGE_COMPONENTS,
  EDGE_CONFIDENCE_TRADES,
  EDGE_CONSISTENCY_BLEND,
  EDGE_NOTES,
  HOLD_STALENESS_BARS,
} from '../constants';
import { WINDOW_WEIGHTS } from '../constants/backtest';
import { clamp, squash } from '../lib/math';
import { pickBand } from '../lib/format';
import { SignalAction, type Signal, type TodaySignal, type WindowResult } from './types';

const NEUTRAL = 50;

/**
 * Score a single window: how much better was the strategy than simply holding?
 * 50 means indistinguishable from buy-and-hold.
 */
export function scoreWindow(result: WindowResult): number {
  const excessCagr = result.stats.cagrPct - result.benchmark.cagrPct;
  const sharpeDelta = result.stats.sharpe - result.benchmark.sharpe;
  const drawdownImprovement =
    Math.abs(result.benchmark.maxDrawdownPct) - Math.abs(result.stats.maxDrawdownPct);

  const { excessCagr: c, sharpeDelta: s, drawdownImprovement: d } = EDGE_COMPONENTS;

  return clamp(
    NEUTRAL +
      c.weight * squash(excessCagr, c.scale) +
      s.weight * squash(sharpeDelta, s.scale) +
      d.weight * squash(drawdownImprovement, d.scale),
    0,
    100
  );
}

/**
 * Blend per-window scores into one edge score.
 *
 * Two corrections keep this honest. Consistency: a rule that beat the benchmark
 * in eight of ten windows deserves more credit than one that won huge in a
 * single lucky window. Sample size: an edge measured over five trades is not an
 * edge, so thin records are shrunk back toward neutral — but only ever
 * downward, see below.
 */
export function computeEdgeScore(windows: WindowResult[], totalTrades: number): number {
  if (windows.length === 0) return NEUTRAL;

  let weighted = 0;
  let weightSum = 0;
  let beats = 0;

  for (const window of windows) {
    const weight = WINDOW_WEIGHTS[window.window] ?? 1;
    weighted += scoreWindow(window) * weight;
    weightSum += weight;
    if (window.beatsBenchmark) beats++;
  }

  const weightedScore = weightSum > 0 ? weighted / weightSum : NEUTRAL;
  const consistency = (beats / windows.length) * 100;
  const blended =
    weightedScore * (1 - EDGE_CONSISTENCY_BLEND) + consistency * EDGE_CONSISTENCY_BLEND;

  const confidence = clamp(totalTrades / EDGE_CONFIDENCE_TRADES, 0, 1);
  const shrunk = NEUTRAL + (blended - NEUTRAL) * confidence;

  // Shrink downward only.
  //
  // Pulling a thin record toward neutral withholds credit when the record is
  // *good* — which is the case this was written for. Applied to a record already
  // below neutral it does the opposite and pays out for the absence of evidence:
  // on a universe where nothing beats buy-and-hold, every score sits under 50, so
  // the rule with three trades gets lifted above the rule with three hundred and
  // a better return. Measured over the harvested history that promoted a 3-9
  // trade Bollinger variant to the top slot on 8 of 23 assets, 6 of them with
  // negative excess CAGR. Taking the worse of the two keeps the original
  // intent — a thin sample can cost points, never earn them.
  return clamp(Math.min(blended, shrunk), 0, 100);
}

function readExposure(signals: Signal[], index: number): number {
  const value = signals[index];
  return Number.isFinite(value) ? value : 0;
}

/** How many bars the strategy has held its current exposure. */
function countBarsInState(signals: Signal[], lastIndex: number, target: number): number {
  let bars = 1;
  for (let i = lastIndex - 1; i >= 0; i--) {
    if (readExposure(signals, i) > 0 !== target > 0) break;
    bars++;
  }
  return bars;
}

function classifyAction(previous: number, target: number): SignalAction {
  if (previous <= 0 && target > 0) return SignalAction.Enter;
  if (previous > 0 && target <= 0) return SignalAction.Exit;
  return target > 0 ? SignalAction.Hold : SignalAction.StayOut;
}

/** Read today's action out of the last two signal values. */
export function readSignal(bars: Bar[], signals: Signal[]): TodaySignal {
  const lastIndex = bars.length - 1;
  const target = readExposure(signals, lastIndex);
  const previous = lastIndex > 0 ? readExposure(signals, lastIndex - 1) : 0;

  return {
    action: classifyAction(previous, target),
    target,
    previous,
    barsInState: countBarsInState(signals, lastIndex, target),
    lastClose: bars[lastIndex]?.close ?? 0,
    lastBarTime: bars[lastIndex]?.time ?? 0,
  };
}

/**
 * How much of the edge today's action carries.
 *
 * `enter` is the only action that is genuinely the strategy's own entry, so it
 * carries the edge at full strength. `hold` means the trend is already running:
 * still constructive, but you would be buying at a worse price than the rule
 * did, and that discount grows the longer the position has been open.
 */
function edgeFactorFor(signal: TodaySignal): number {
  const factors = ACTION_EDGE_FACTOR;

  switch (signal.action) {
    case SignalAction.Enter:
      return factors[SignalAction.Enter];
    case SignalAction.Exit:
      return factors[SignalAction.Exit];
    case SignalAction.StayOut:
      return factors[SignalAction.StayOut];
    case SignalAction.Hold:
    default: {
      const staleness = clamp(signal.barsInState / HOLD_STALENESS_BARS, 0, 1);
      const { holdFresh, holdStale } = factors;
      return holdFresh - (holdFresh - holdStale) * staleness;
    }
  }
}

/**
 * How attractive is opening a long here, on this strategy's advice?
 *
 * `exit` and `stay_out` invert the edge — a rule with a real edge telling you to
 * stay out is evidence *against* buying, while a rule with no edge saying
 * anything lands near neutral.
 */
export function computeOpportunityScore(signal: TodaySignal, edgeScore: number): number {
  return clamp(NEUTRAL + (edgeScore - NEUTRAL) * edgeFactorFor(signal), 0, 100);
}

/** One line explaining the score, using the numbers that actually drove it. */
export function buildRationale(
  signal: TodaySignal,
  edgeScore: number,
  windows: WindowResult[]
): string {
  const recent = windows.find((w) => w.window === '1y') ?? windows[windows.length - 1];
  const beats = windows.filter((w) => w.beatsBenchmark).length;

  const parts = [
    `${ACTION_PHRASE[signal.action]} — ${pickBand(EDGE_NOTES, edgeScore).note}`,
    `beat buy & hold in ${beats}/${windows.length} windows`,
  ];

  if (recent) {
    const sign = recent.excessCagrPct >= 0 ? '+' : '';
    parts.push(`${recent.label}: ${sign}${recent.excessCagrPct.toFixed(1)}pp CAGR vs hold`);
  }

  if (signal.action === 'hold') {
    parts.push(`in position ${signal.barsInState} bars`);
  }

  return parts.join('; ');
}
