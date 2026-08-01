import {
  computeSpreadZScore,
  exitZFor,
  generatePairSignals,
  minimumEntryZ,
  regimeStatus,
  zscoreLookback,
  type AlignedBarPair,
} from '../analyzers/pairs';
import { DAILY_WINDOWS, DAY_MS, MIN_WINDOW_BARS } from '../constants';
import { runPairsBacktest } from './pairsEngine';
import type { BacktestOptions, WindowSpec } from './types';
import type { PairCandidate, PairReport, PairTodaySignal, PairWindowResult } from './pairsTypes';
import { SpreadDirection } from './pairsTypes';

/** The article's default entry threshold, used unless the pair's own cost-calibrated minimum is stricter. */
const DEFAULT_ENTRY_Z = 2;

interface PairWindowSlice {
  spec: WindowSpec;
  aligned: AlignedBarPair[];
  signals: SpreadDirection[];
  zscore: number[];
}

/** Same date-cutoff slicing `backtest/windows.ts` does for single-asset bars, parallel-applied to a pair's aligned bars/signals/z-score. */
function buildPairWindows(
  aligned: AlignedBarPair[],
  signals: SpreadDirection[],
  zscore: number[],
  specs: WindowSpec[]
): PairWindowSlice[] {
  if (aligned.length === 0) return [];

  const lastTime = aligned[aligned.length - 1].time;
  const slices: PairWindowSlice[] = [];
  const seenLengths = new Set<number>();

  for (const spec of specs) {
    const cutoff = spec.days === null ? -Infinity : lastTime - spec.days * DAY_MS;
    const startIndex = aligned.findIndex((bar) => bar.time >= cutoff);
    if (startIndex < 0) continue;

    const windowLength = aligned.length - startIndex;
    if (windowLength < MIN_WINDOW_BARS) continue;
    if (seenLengths.has(windowLength)) continue;

    seenLengths.add(windowLength);
    slices.push({
      spec,
      aligned: aligned.slice(startIndex),
      signals: signals.slice(startIndex),
      zscore: zscore.slice(startIndex),
    });
  }

  return slices;
}

function countBarsInState(signals: SpreadDirection[], target: SpreadDirection): number {
  let bars = 1;
  for (let i = signals.length - 2; i >= 0; i--) {
    if (signals[i] !== target) break;
    bars++;
  }
  return bars;
}

/**
 * Backtest one cointegrated pair across every applicable window and read
 * today's signal off it — the pair analog of `runner.ts`'s
 * `evaluateStrategy`/`backtestAsset`, minus the edge/opportunity scoring
 * (see the note on `PairReport` for why that doesn't carry over).
 */
export function evaluatePair(
  candidate: PairCandidate,
  aligned: AlignedBarPair[],
  execution: Omit<BacktestOptions, 'periodsPerYear'>,
  periodsPerYear: number,
  windowSpecs: WindowSpec[] = DAILY_WINDOWS
): PairReport | null {
  if (aligned.length < MIN_WINDOW_BARS) return null;

  const spread = aligned.map((bar) => bar.a.close - candidate.beta * bar.b.close - candidate.alpha);
  const lookback = zscoreLookback(candidate.halfLifeDays);
  const zscore = computeSpreadZScore(spread, lookback);

  const costBps = execution.feeBps + execution.slippageBps;
  const entryZ = Math.max(DEFAULT_ENTRY_Z, minimumEntryZ(candidate.equilibriumStd, costBps));
  const exitZ = exitZFor(entryZ);

  const signals = generatePairSignals(zscore, entryZ, exitZ);
  const slices = buildPairWindows(aligned, signals, zscore, windowSpecs);
  if (slices.length === 0) return null;

  const options: BacktestOptions = { ...execution, periodsPerYear };

  const windows: PairWindowResult[] = slices.map((slice) => {
    const result = runPairsBacktest(
      slice.aligned,
      slice.signals,
      slice.zscore,
      entryZ,
      candidate.beta,
      options
    );
    return { window: slice.spec.id, label: slice.spec.label, stats: result.stats };
  });

  const lastIndex = signals.length - 1;
  const direction = signals[lastIndex];
  const previousDirection = lastIndex > 0 ? signals[lastIndex - 1] : SpreadDirection.Flat;

  const signal: PairTodaySignal = {
    direction,
    previousDirection,
    barsInState: countBarsInState(signals, direction),
    currentZ: zscore[lastIndex],
    lastBarTime: aligned[lastIndex].time,
  };

  return {
    pairId: `${candidate.legA}/${candidate.legB}`,
    legA: candidate.legA,
    legB: candidate.legB,
    rationale: candidate.rationale,
    hedgeRatio: candidate.beta,
    halfLifeDays: candidate.halfLifeDays,
    hurst: candidate.hurst,
    pValue: candidate.pValue,
    regimeStatus: regimeStatus(candidate.pValue, candidate.halfLifeDays),
    signal,
    windows,
  };
}
