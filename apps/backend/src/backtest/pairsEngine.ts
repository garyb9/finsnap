import { ouPositionSize } from '../analyzers/pairs';
import type { AlignedBarPair } from '../analyzers/pairs';
import { MIN_TRADE_FRACTION } from '../constants';
import { SpreadDirection } from '../constants/enums';
import { buildStats } from './metrics';
import type { BacktestOptions, BacktestResult, Trade } from './types';

/**
 * Run a two-leg, dollar-neutral spread backtest.
 *
 * This cannot reuse `engine.ts`'s `runBacktest` — that engine clamps every
 * signal into `[0, 1]` (long/flat, one instrument), and a pair is
 * permanently short one leg while long the other. Execution model mirrors
 * `runBacktest` wherever the two aren't structurally different: the
 * direction and size decided at the close of bar `i` are filled at the
 * **open of bar `i + 1`**, with slippage and fees applied per leg, and a
 * rebalance only fires when it moves at least `MIN_TRADE_FRACTION` of
 * portfolio value — which is also what keeps this from paying fees on every
 * tiny day-to-day wiggle in the OU-proportional size.
 *
 * Sizing follows the article's construction directly: `unitsA = size *
 * equity / priceA`, `unitsB = -direction * beta * size * equity / priceB` —
 * beta-weighted by dollar allocation rather than a strict unit-for-unit
 * hedge ratio. That's an approximation (exact under `priceA == priceB`
 * only), but it's the one the source model specifies, and refining it to a
 * literal share-ratio hedge is a later, isolated change to this one
 * function if the beta-dollar approximation turns out to matter in
 * practice.
 *
 * `entryPrice`/`exitPrice` on the resulting `Trade`s are repurposed to hold
 * the spread's z-score at entry/exit rather than a literal price — there is
 * no single "price" for a two-instrument position, and the z-score is the
 * number that actually drove the decision.
 */
export function runPairsBacktest(
  aligned: AlignedBarPair[],
  signals: SpreadDirection[],
  zscore: number[],
  entryZ: number,
  beta: number,
  options: BacktestOptions
): BacktestResult {
  const { initialCapital, feeBps, slippageBps, periodsPerYear } = options;

  if (aligned.length !== signals.length || aligned.length !== zscore.length) {
    throw new Error('runPairsBacktest: aligned bars, signals and zscore must be the same length');
  }

  if (aligned.length < 2) {
    const equity = aligned.length === 1 ? [initialCapital] : [];
    return {
      equity,
      trades: [],
      stats: buildStats({
        equity: equity.length > 0 ? equity : [initialCapital],
        trades: [],
        initialCapital,
        periodsPerYear,
        startTime: aligned[0]?.time ?? 0,
        endTime: aligned[aligned.length - 1]?.time ?? 0,
        barsExposed: 0,
      }),
    };
  }

  const feeRate = feeBps / 10_000;
  const slipRate = slippageBps / 10_000;

  let cash = initialCapital;
  let unitsA = 0;
  let unitsB = 0;
  let barsExposed = 0;

  const equity: number[] = [initialCapital];
  const trades: Trade[] = [];

  let openEntryIndex = -1;
  let openEntryEquity = 0;
  let openEntryZ = 0;

  const fillPrice = (open: number, delta: number): number => {
    if (delta === 0) return open;
    return delta > 0 ? open * (1 + slipRate) : open * (1 - slipRate);
  };

  for (let i = 1; i < aligned.length; i++) {
    const bar = aligned[i];
    const prevSignal = signals[i - 1];
    const direction =
      prevSignal === SpreadDirection.LongSpread
        ? 1
        : prevSignal === SpreadDirection.ShortSpread
          ? -1
          : 0;
    const size = ouPositionSize(zscore[i - 1], entryZ);

    const valueAtOpen = cash + unitsA * bar.a.open + unitsB * bar.b.open;
    const allocation = direction * size * valueAtOpen;

    const targetUnitsA = valueAtOpen > 0 && bar.a.open > 0 ? allocation / bar.a.open : 0;
    const targetUnitsB = valueAtOpen > 0 && bar.b.open > 0 ? (-beta * allocation) / bar.b.open : 0;

    const deltaA = targetUnitsA - unitsA;
    const deltaB = targetUnitsB - unitsB;
    const notionalDelta = Math.abs(deltaA * bar.a.open) + Math.abs(deltaB * bar.b.open);

    if (valueAtOpen > 0 && notionalDelta > valueAtOpen * MIN_TRADE_FRACTION) {
      const fillA = fillPrice(bar.a.open, deltaA);
      const fillB = fillPrice(bar.b.open, deltaB);
      const feeA = Math.abs(deltaA) * fillA * feeRate;
      const feeB = Math.abs(deltaB) * fillB * feeRate;

      cash -= deltaA * fillA + feeA + (deltaB * fillB + feeB);
      unitsA += deltaA;
      unitsB += deltaB;

      const wasFlat = openEntryIndex < 0;
      const isFlatNow = unitsA === 0 && unitsB === 0;

      if (wasFlat && !isFlatNow) {
        openEntryIndex = i;
        openEntryEquity = valueAtOpen;
        openEntryZ = zscore[i - 1];
      } else if (!wasFlat && isFlatNow) {
        const exitEquity = cash;
        trades.push({
          entryTime: aligned[openEntryIndex].time,
          exitTime: bar.time,
          entryPrice: openEntryZ,
          exitPrice: zscore[i - 1],
          returnPct: openEntryEquity > 0 ? (exitEquity / openEntryEquity - 1) * 100 : 0,
          barsHeld: i - openEntryIndex,
          open: false,
        });
        openEntryIndex = -1;
      }
    }

    if (unitsA !== 0 || unitsB !== 0) barsExposed++;
    equity.push(cash + unitsA * bar.a.close + unitsB * bar.b.close);
  }

  if (openEntryIndex >= 0) {
    const last = aligned[aligned.length - 1];
    const exitEquity = cash + unitsA * last.a.close + unitsB * last.b.close;
    trades.push({
      entryTime: aligned[openEntryIndex].time,
      exitTime: null,
      entryPrice: openEntryZ,
      exitPrice: null,
      returnPct: openEntryEquity > 0 ? (exitEquity / openEntryEquity - 1) * 100 : 0,
      barsHeld: aligned.length - 1 - openEntryIndex,
      open: true,
    });
  }

  return {
    equity,
    trades,
    stats: buildStats({
      equity,
      trades,
      initialCapital,
      periodsPerYear,
      startTime: aligned[0].time,
      endTime: aligned[aligned.length - 1].time,
      barsExposed,
    }),
  };
}

export type { BacktestOptions, BacktestResult, Trade };
