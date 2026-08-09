import type { Bar } from '../collectors/types';
import { adx } from '../backtest/indicators';
import { StrategyKind, type StrategyReport } from '../backtest/types';
import { FAMILY_GUIDE } from '../constants/guide';
import { voteWeight } from './consensus';
import type { Regime } from './types';

const ADX_PERIOD = 14;
const TRENDING_THRESHOLD = 25;
/** A "dominant" family needs at least this many qualifying, long strategies. */
const MIN_FAMILY_SIZE = 2;

/**
 * Trend-strength read for an asset, independent of what any strategy is
 * saying — so a strategy family that happens to be winning can be checked
 * against it rather than explained by it circularly.
 */
export function computeRegime(bars: Bar[]): Regime | undefined {
  const values = adx(bars, ADX_PERIOD);
  const last = values.at(-1);
  if (last === undefined || !Number.isFinite(last)) return undefined;

  return { trend: last >= TRENDING_THRESHOLD ? 'trending' : 'choppy', adx: Math.round(last) };
}

/**
 * The strategy family with the most conviction behind today's long
 * positions — only strategies with a real vote (see `voteWeight` in
 * `consensus.ts`) that are currently long. `undefined` unless one family
 * has at least `MIN_FAMILY_SIZE` members and strictly more than the
 * runner-up, so a single strategy or a tie never reads as "dominant."
 */
export function dominantFamily(strategies: StrategyReport[]): StrategyKind | undefined {
  const counts = new Map<StrategyKind, number>();

  for (const s of strategies) {
    if (s.kind === StrategyKind.Benchmark) continue;
    if (voteWeight(s.edgeScore) <= 0) continue;
    if (s.signal.target <= 0) continue;
    counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const runnerUpCount = sorted[1]?.[1] ?? 0;

  if (!top || top[1] < MIN_FAMILY_SIZE || top[1] <= runnerUpCount) return undefined;
  return top[0];
}

/**
 * States the regime and the leading family side by side without asserting
 * the pairing is expected — a choppy regime with mean-reversion leading is
 * just as valid a note as a trending one with breakout leading.
 */
export function buildRegimeNote(regime: Regime, kind: StrategyKind, volatilityLabel: string): string {
  return (
    `${FAMILY_GUIDE[kind].label} rules lead today's vote — ` +
    `${regime.trend} (ADX ${regime.adx}), ${volatilityLabel} bands`
  );
}
