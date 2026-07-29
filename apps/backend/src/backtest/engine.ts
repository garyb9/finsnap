import type { Bar } from '../collectors/types';
import { MIN_TRADE_FRACTION } from '../constants';
import { buildStats } from './metrics';
import type { BacktestOptions, BacktestResult, Signal, Trade } from './types';

function clampExposure(signal: Signal): number {
  if (!Number.isFinite(signal)) return 0;
  return Math.max(0, Math.min(1, signal));
}

/**
 * Run a long/flat backtest.
 *
 * Execution model: the signal produced at the close of bar `i` is filled at the
 * **open of bar `i + 1`**, with slippage and fees applied to the fill. Bar 0 is
 * always flat because there is no prior signal to act on. This one-bar shift is
 * what keeps the results free of lookahead — the strategy never touches a price
 * it could not have seen when it decided.
 *
 * `signals` must be the same length as `bars`, and should be computed over the
 * full price history even when `bars` is a shorter evaluation window, so that
 * indicator warm-up does not leak into the measured period.
 */
export function runBacktest(
  bars: Bar[],
  signals: Signal[],
  options: BacktestOptions
): BacktestResult {
  const { initialCapital, feeBps, slippageBps, periodsPerYear } = options;

  if (bars.length !== signals.length) {
    throw new Error(`signal length ${signals.length} does not match bar count ${bars.length}`);
  }

  if (bars.length < 2) {
    const equity = bars.length === 1 ? [initialCapital] : [];
    return {
      equity,
      trades: [],
      stats: buildStats({
        equity: equity.length > 0 ? equity : [initialCapital],
        trades: [],
        initialCapital,
        periodsPerYear,
        startTime: bars[0]?.time ?? 0,
        endTime: bars[bars.length - 1]?.time ?? 0,
        barsExposed: 0,
      }),
    };
  }

  const feeRate = feeBps / 10_000;
  const slipRate = slippageBps / 10_000;

  let cash = initialCapital;
  let units = 0;
  let barsExposed = 0;

  const equity: number[] = [initialCapital];
  const trades: Trade[] = [];

  let openEntryIndex = -1;
  let openEntryEquity = 0;
  let openEntryPrice = 0;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const target = clampExposure(signals[i - 1]);

    // Mark the book at the open before deciding how much to move.
    const valueAtOpen = cash + units * bar.open;
    const desiredUnits = valueAtOpen > 0 ? (target * valueAtOpen) / bar.open : 0;
    const rawDelta = desiredUnits - units;

    if (Math.abs(rawDelta * bar.open) > valueAtOpen * MIN_TRADE_FRACTION) {
      const isBuy = rawDelta > 0;
      const fillPrice = isBuy ? bar.open * (1 + slipRate) : bar.open * (1 - slipRate);

      // A buy has to leave room for its own fee, or the position would cost
      // more than the cash on hand and quietly run on margin. Scaling the size
      // down by (1 + feeRate) makes a full allocation land exactly at zero cash.
      const delta = isBuy ? rawDelta / (1 + feeRate) : rawDelta;
      const fee = Math.abs(delta) * fillPrice * feeRate;

      cash -= delta * fillPrice + fee;
      units += delta;

      const wasFlat = openEntryIndex < 0;

      if (wasFlat && units > 0) {
        openEntryIndex = i;
        // Recorded pre-fill so the trade's return carries both entry and exit costs.
        openEntryEquity = valueAtOpen;
        openEntryPrice = fillPrice;
      } else if (!wasFlat && units <= 0) {
        const exitEquity = cash + units * bar.open;
        trades.push({
          entryTime: bars[openEntryIndex].time,
          exitTime: bar.time,
          entryPrice: openEntryPrice,
          exitPrice: fillPrice,
          // Derived from equity rather than raw prices so fees and slippage
          // are already baked into the reported trade return.
          returnPct: openEntryEquity > 0 ? (exitEquity / openEntryEquity - 1) * 100 : 0,
          barsHeld: i - openEntryIndex,
          open: false,
        });
        openEntryIndex = -1;
      }
    }

    if (units > 0) barsExposed++;
    equity.push(cash + units * bar.close);
  }

  // A position still open at the end of the window is reported as such, marked
  // to the final close, so exposure and trade counts stay honest.
  if (openEntryIndex >= 0) {
    const last = bars[bars.length - 1];
    const exitEquity = cash + units * last.close;
    trades.push({
      entryTime: bars[openEntryIndex].time,
      exitTime: null,
      entryPrice: openEntryPrice,
      exitPrice: null,
      returnPct: openEntryEquity > 0 ? (exitEquity / openEntryEquity - 1) * 100 : 0,
      barsHeld: bars.length - 1 - openEntryIndex,
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
      startTime: bars[0].time,
      endTime: bars[bars.length - 1].time,
      barsExposed,
    }),
  };
}

/** Buy-and-hold over the same bars, used as the benchmark for every window. */
export function runBuyAndHold(bars: Bar[], options: BacktestOptions): BacktestResult {
  const signals = new Array<Signal>(bars.length).fill(1);
  return runBacktest(bars, signals, options);
}
