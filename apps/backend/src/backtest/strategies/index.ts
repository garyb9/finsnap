import { WARMUP_SAFETY_FACTOR } from '../../constants';
import { StrategyKind, type StrategyDef } from '../types';
import {
  absoluteMomentum,
  chandelierTrend,
  donchianBreakout,
  volatilitySqueezeBreakout,
} from './breakout';
import {
  bollingerBreakout,
  bollingerReversion,
  ibsReversion,
  nDayLowReversion,
  rsiReversion,
  rsiTrend,
  zscoreReversion,
} from './meanReversion';
import { emaCross, macdCross, priceAboveSma, smaCross, supertrendFollow } from './trend';
import { tsmomTrend } from './tsmom';
import {
  adlTrend,
  cmfTrend,
  mfiReversion,
  obvTrend,
  volumeConfirmedBreakout,
} from './volume';
import type { Bar } from '../../collectors/types';

/** Always long. The benchmark every other strategy is measured against. */
export const buyAndHold: StrategyDef = {
  id: 'buy_and_hold',
  name: 'Buy & Hold',
  kind: StrategyKind.Benchmark,
  description: 'Buy at the start of the window and never sell.',
  params: {},
  warmup: 0,
  signals(bars: Bar[]) {
    return new Array<number>(bars.length).fill(1);
  },
};

/**
 * The strategy universe.
 *
 * Adding a strategy is a one-line change here: build the definition with one of
 * the factories (or write a new one in `trend.ts` / `meanReversion.ts` /
 * `breakout.ts`) and append it. Everything downstream — backtests across every
 * window, today's signal, opportunity scoring, the report and the API — picks
 * it up automatically from this list.
 *
 * Parameters are deliberately conventional rather than optimized. Tuned values
 * would score better in the backtest and mean less out of sample.
 */
export const STRATEGIES: StrategyDef[] = [
  buyAndHold,

  // Trend following
  smaCross(50, 200),
  smaCross(20, 100),
  emaCross(12, 26),
  emaCross(20, 50),
  priceAboveSma(200),
  priceAboveSma(50),
  macdCross(12, 26, 9),
  supertrendFollow(10, 3),

  // Momentum
  absoluteMomentum(252),
  absoluteMomentum(90),
  rsiTrend(14, 50),
  // Puts the dashboard's own TSMOM reading on trial — see strategies/tsmom.ts.
  tsmomTrend(55),
  tsmomTrend(50),

  // Breakout
  donchianBreakout(20, 10),
  donchianBreakout(55, 20),
  chandelierTrend(20, 14, 3),
  bollingerBreakout(20, 2),
  volatilitySqueezeBreakout(20, 2, 120, 10),
  volatilitySqueezeBreakout(20, 2, 60, 5),

  // Mean reversion
  rsiReversion(14, 30, 70),
  rsiReversion(2, 10, 60),
  bollingerReversion(20, 2),
  bollingerReversion(20, 3),
  zscoreReversion(20, 2, 0),
  ibsReversion(10, 90),
  nDayLowReversion(7),

  // Volume
  obvTrend(20),
  adlTrend(20),
  cmfTrend(20, 0),
  mfiReversion(14, 20, 80),
  volumeConfirmedBreakout(20, 10, 20, 1),
];

const BY_ID = new Map(STRATEGIES.map((s) => [s.id, s]));

export function getStrategy(id: string): StrategyDef | undefined {
  return BY_ID.get(id);
}

/**
 * Strategies applicable to a given bar count. A 200-bar moving average on a
 * ticker with 150 bars of history would report a backtest of nothing but cash.
 */
export function applicableStrategies(barCount: number): StrategyDef[] {
  return STRATEGIES.filter((s) => barCount > s.warmup * WARMUP_SAFETY_FACTOR);
}

export * from './breakout';
export * from './meanReversion';
export * from './trend';
export * from './tsmom';
export * from './volume';
