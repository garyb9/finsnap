import { PERIODS_PER_YEAR } from '../constants/time';
import { runBacktest, runBuyAndHold } from './engine';
import { SPY_DAILY_SAMPLE, SPY_DAILY_SAMPLE_META } from './fixtures';
import { bollinger, closes, donchian, obv, roc, sma } from './indicators';
import {
  absoluteMomentum,
  bollingerBreakout,
  bollingerReversion,
  buyAndHold,
  donchianBreakout,
  ibsReversion,
  obvTrend,
  rsiReversion,
  smaCross,
} from './strategies';
import {
  StrategyKind,
  type BacktestOptions,
  type StrategyExample,
  type WalkthroughComparison,
} from './types';

/**
 * Worked examples for the field guide.
 *
 * Every strategy backtest in the report runs over live, moving data — which
 * makes a great dashboard and a terrible worked example, since the numbers on
 * screen would never match what a reader sees. This module runs one flagship
 * strategy per family over `SPY_DAILY_SAMPLE`, a frozen real slice of SPY
 * history, and shows its arithmetic on a specific historical bar chosen because
 * the rule actually does something interesting there — a golden cross, a
 * momentum flip, a channel breakout, an oversold bounce.
 *
 * The comparison numbers are not hand-computed: they come from the same
 * `runBacktest` / `runBuyAndHold` the live report uses, over the identical
 * fixture, so the walkthrough can never quietly drift from how the engine
 * actually scores a strategy.
 */

/** Same defaults `loadConfig` falls back to — kept independent of env so the
 * guide's numbers do not move if a deployment overrides them. */
const EXAMPLE_OPTIONS: BacktestOptions = {
  initialCapital: 10_000,
  feeBps: 5,
  slippageBps: 5,
  periodsPerYear: PERIODS_PER_YEAR.equityDaily,
};

const bars = SPY_DAILY_SAMPLE;
const price = closes(bars);

function dateOf(index: number): string {
  return new Date(bars[index].time).toISOString().slice(0, 10);
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Plain-text percent, for a `result` field — those render as HTML, not LaTeX. */
function pct(n: number, digits = 2): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function num(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function compare(signals: number[]): WalkthroughComparison {
  const strategy = runBacktest(bars, signals, EXAMPLE_OPTIONS).stats;
  const hold = runBuyAndHold(bars, EXAMPLE_OPTIONS).stats;

  return {
    strategyTotalReturnPct: strategy.totalReturnPct,
    strategyCagrPct: strategy.cagrPct,
    strategyMaxDrawdownPct: strategy.maxDrawdownPct,
    strategyExposurePct: strategy.exposurePct,
    strategyNumTrades: strategy.numTrades,
    buyHoldTotalReturnPct: hold.totalReturnPct,
    buyHoldCagrPct: hold.cagrPct,
    buyHoldMaxDrawdownPct: hold.maxDrawdownPct,
  };
}

const dataset = {
  symbol: SPY_DAILY_SAMPLE_META.symbol,
  startDate: SPY_DAILY_SAMPLE_META.startDate,
  endDate: SPY_DAILY_SAMPLE_META.endDate,
  bars: SPY_DAILY_SAMPLE_META.bars,
};

// ── Benchmark: Buy & Hold ────────────────────────────────────────────────────

function buildBuyAndHold(): StrategyExample {
  const startIdx = 0;
  const endIdx = bars.length - 1;
  const p0 = price[startIdx];
  const pN = price[endIdx];
  const years = (bars[endIdx].time - bars[startIdx].time) / (365 * 24 * 60 * 60 * 1000);
  const totalReturn = (pN / p0 - 1) * 100;
  const cagr = ((pN / p0) ** (1 / years) - 1) * 100;

  return {
    strategyId: buyAndHold.id,
    name: buyAndHold.name,
    kind: StrategyKind.Benchmark,
    description: buyAndHold.description,
    dataset,
    ruleFormula: '\\text{Long on every bar, from } t_0 \\text{ to } t_N \\text{. Never sell.}',
    exampleDate: dateOf(endIdx),
    steps: [
      {
        label: 'Total return over the window',
        formula: `R = \\frac{P_N}{P_0} - 1 = \\frac{${money(pN)}}{${money(p0)}} - 1`,
        result: pct(totalReturn),
      },
      {
        label: 'Compound annual growth rate',
        formula: `\\text{CAGR} = \\left(\\frac{P_N}{P_0}\\right)^{\\frac{1}{${num(years)}\\text{y}}} - 1 = \\left(\\frac{${money(pN)}}{${money(p0)}}\\right)^{\\frac{1}{${num(years)}}} - 1`,
        result: pct(cagr),
      },
    ],
    explanation:
      `Buy ${dataset.symbol} at the open on ${dateOf(startIdx + 1)} and hold every bar through ` +
      `${dateOf(endIdx)}. There is no rule to evaluate — this is the yardstick every other ` +
      `strategy on this page is measured against, using the exact same ${dataset.bars} bars of ` +
      `real history.`,
    comparison: compare(buyAndHold.signals(bars)),
  };
}

// ── Trend: SMA Cross 50/200 ──────────────────────────────────────────────────

function buildSmaCross(): StrategyExample {
  const fast = 50;
  const slow = 200;
  const strategy = smaCross(fast, slow);
  const fastMa = sma(price, fast);
  const slowMa = sma(price, slow);

  // The most recent golden cross in the fixture — the day the fast average
  // first closes back above the slow one.
  const idx = fastMa.findIndex(
    (v, i) =>
      i > slow &&
      Number.isFinite(v) &&
      Number.isFinite(fastMa[i - 1]) &&
      v > slowMa[i] &&
      fastMa[i - 1] <= slowMa[i - 1]
  );

  const last50 = price.slice(idx - fast + 1, idx + 1);
  const last200Sum = slowMa[idx] * slow;

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.Trend,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{SMA}_n(t) = \\frac{1}{n}\\sum_{i=0}^{n-1} P_{t-i} \\qquad ' +
      '\\text{Long} \\iff \\text{SMA}_{50}(t) > \\text{SMA}_{200}(t)',
    exampleDate: dateOf(idx),
    steps: [
      {
        label: `Fast average — the last ${fast} closes, most recent five: ${last50
          .slice(-5)
          .map((v) => money(v))
          .join(', ')}, …`,
        formula: `\\text{SMA}_{50}(t) = \\frac{${money(last50.reduce((s, v) => s + v, 0))}}{50}`,
        result: money(fastMa[idx]),
      },
      {
        label: `Slow average — the last ${slow} closes`,
        formula: `\\text{SMA}_{200}(t) = \\frac{${money(last200Sum)}}{200}`,
        result: money(slowMa[idx]),
      },
      {
        label: 'Compare the two averages',
        formula: `\\text{SMA}_{50}(t) = ${money(fastMa[idx])} \\;>\\; \\text{SMA}_{200}(t) = ${money(slowMa[idx])}`,
        result: 'Long from the next open',
      },
    ],
    explanation:
      `On ${dateOf(idx)} the 50-day average closed back above the 200-day average — a golden ` +
      `cross — after crossing below it on ${dateOf(
        fastMa.findIndex(
          (v, i) =>
            i < idx &&
            i > slow &&
            Number.isFinite(v) &&
            v <= slowMa[i] &&
            fastMa[i - 1] > slowMa[i - 1]
        )
      )}. The strategy stayed flat for the decline in between and re-entered once the slower ` +
      `average confirmed the recovery, at the cost of buying back in above the lows.`,
    comparison: compare(strategy.signals(bars)),
  };
}

// ── Momentum: Absolute Momentum 252 ──────────────────────────────────────────

function buildAbsoluteMomentum(): StrategyExample {
  const lookback = 252;
  const strategy = absoluteMomentum(lookback);
  const momentum = roc(price, lookback);

  // The most recent flip from positive to negative trailing momentum.
  const idx = momentum.findIndex(
    (v, i) => i > lookback && Number.isFinite(v) && v <= 0 && momentum[i - 1] > 0
  );

  const pt = price[idx];
  const pBase = price[idx - lookback];

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.Momentum,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{ROC}_n(t) = \\frac{P_t - P_{t-n}}{P_{t-n}} \\times 100 \\qquad ' +
      '\\text{Long} \\iff \\text{ROC}_{252}(t) > 0',
    exampleDate: dateOf(idx),
    steps: [
      {
        label: `Price today (${dateOf(idx)}) vs. price ${lookback} sessions earlier (${dateOf(idx - lookback)})`,
        formula: `\\text{ROC}_{252}(t) = \\frac{${money(pt)} - ${money(pBase)}}{${money(pBase)}} \\times 100`,
        result: `${num(momentum[idx])}%`,
      },
      {
        label: 'Sign of the trailing return decides the position',
        formula: `\\text{ROC}_{252}(t) = ${num(momentum[idx])}\\% \\;\\le\\; 0`,
        result: 'Flat from the next open',
      },
    ],
    explanation:
      `The trailing one-year return turned negative on ${dateOf(idx)} — the trailing window now ` +
      `reaches back past a level the price has not recovered — so the strategy exits to cash from ` +
      `the next session. It does not predict the drawdown; it only recognises, with a year's lag, ` +
      `that one is already underway.`,
    comparison: compare(strategy.signals(bars)),
  };
}

// ── Breakout: Donchian 20/10 ──────────────────────────────────────────────────

function buildDonchianBreakout(): StrategyExample {
  const entryPeriod = 20;
  const exitPeriod = 10;
  const strategy = donchianBreakout(entryPeriod, exitPeriod);
  const entryChannel = donchian(bars, entryPeriod);
  const exitChannel = donchian(bars, exitPeriod);

  // The most recent close breaking out to a new 20-bar high after having been
  // inside the channel the bar before — a fresh entry, not a continuation.
  const idx = price.findIndex(
    (p, i) =>
      i > entryPeriod &&
      Number.isFinite(entryChannel.upper[i]) &&
      p > entryChannel.upper[i] &&
      price[i - 1] <= entryChannel.upper[i - 1]
  );

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.Breakout,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{Upper}_n(t) = \\max\\{H_{t-n}, \\dots, H_{t-1}\\} \\qquad ' +
      '\\text{Enter} \\iff C_t > \\text{Upper}_{20}(t) \\qquad ' +
      '\\text{Exit} \\iff C_t < \\text{Lower}_{10}(t)',
    exampleDate: dateOf(idx),
    steps: [
      {
        label: `Highest high of the ${entryPeriod} sessions before today, excluding today`,
        formula: `\\text{Upper}_{20}(t) = \\max\\{H_{t-20}, \\dots, H_{t-1}\\}`,
        result: money(entryChannel.upper[idx]),
      },
      {
        label: "Today's close against that channel",
        formula: `C_t = ${money(price[idx])} \\;>\\; \\text{Upper}_{20}(t) = ${money(entryChannel.upper[idx])}`,
        result: 'Enter long from the next open',
      },
      {
        label: `Exit level for this trade — the ${exitPeriod}-bar low, which moves each bar`,
        formula: `\\text{Lower}_{10}(t) = \\min\\{L_{t-10}, \\dots, L_{t-1}\\} = ${money(exitChannel.lower[idx])}`,
        result: `Sell once a close drops below ${money(exitChannel.lower[idx])}`,
      },
    ],
    explanation:
      `${dateOf(idx)} closed above every high of the preceding ${entryPeriod} sessions — a fresh ` +
      `20-day breakout — so the strategy buys at the next open. It stays long until a close falls ` +
      `below the ${exitPeriod}-day low, a looser channel chosen so a normal pullback does not shake ` +
      `the position out of a trade that just started.`,
    comparison: compare(strategy.signals(bars)),
  };
}

// ── Breakout: Bollinger Breakout 20/2σ ───────────────────────────────────────

function buildBollingerBreakout(): StrategyExample {
  const period = 20;
  const mult = 2;
  const strategy = bollingerBreakout(period, mult);
  const bands = bollinger(price, period, mult);

  // A fresh close above the upper band, not a continuation of one already broken.
  const idx = price.findIndex(
    (p, i) =>
      i > period &&
      Number.isFinite(bands.upper[i]) &&
      p > bands.upper[i] &&
      price[i - 1] <= bands.upper[i - 1]
  );

  const sd = (bands.upper[idx] - bands.middle[idx]) / mult;

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.Breakout,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{Upper}_n(t) = \\text{SMA}_n(t) + k\\,\\sigma_n(t) \\qquad ' +
      '\\text{Enter} \\iff C_t > \\text{Upper}_{20}(t) \\qquad ' +
      '\\text{Exit} \\iff C_t < \\text{SMA}_{20}(t)',
    exampleDate: dateOf(idx),
    steps: [
      {
        label: `20-bar average and standard deviation of the close`,
        formula: `\\text{SMA}_{20}(t) = ${money(bands.middle[idx])}, \\quad \\sigma_{20}(t) = ${num(sd)}`,
        result: `${money(bands.middle[idx])} ± ${num(sd)}`,
      },
      {
        label: 'Upper band, two standard deviations above the average',
        formula: `\\text{Upper}_{20}(t) = ${money(bands.middle[idx])} + 2(${num(sd)})`,
        result: money(bands.upper[idx]),
      },
      {
        label: "Today's close against that band",
        formula: `C_t = ${money(price[idx])} \\;>\\; \\text{Upper}_{20}(t) = ${money(bands.upper[idx])}`,
        result: 'Enter long from the next open',
      },
      {
        label: 'Exit level for this trade — the middle band, which moves each bar',
        formula: `\\text{SMA}_{20}(t) = ${money(bands.middle[idx])}`,
        result: `Sell once a close falls back below ${money(bands.middle[idx])}`,
      },
    ],
    explanation:
      `${dateOf(idx)} closed above the upper Bollinger band — two standard deviations of recent ` +
      `volatility above the 20-day average — so the strategy buys at the next open, betting the ` +
      `break continues. It exits back at the middle band, the same average the entry was measured ` +
      `against.`,
    comparison: compare(strategy.signals(bars)),
  };
}

// ── Mean reversion: Bollinger Reversion 20/2σ ───────────────────────────────

function buildBollingerReversion(): StrategyExample {
  const period = 20;
  const mult = 2;
  const strategy = bollingerReversion(period, mult);
  const bands = bollinger(price, period, mult);

  // A fresh touch of the lower band, not a continuation of one already broken.
  const idx = price.findIndex(
    (p, i) =>
      i > period &&
      Number.isFinite(bands.lower[i]) &&
      p <= bands.lower[i] &&
      price[i - 1] > bands.lower[i - 1]
  );

  const sd = (bands.middle[idx] - bands.lower[idx]) / mult;

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.MeanReversion,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{Lower}_n(t) = \\text{SMA}_n(t) - k\\,\\sigma_n(t) \\qquad ' +
      '\\text{Buy} \\iff C_t \\le \\text{Lower}_{20}(t) \\qquad ' +
      '\\text{Sell} \\iff C_t \\ge \\text{Upper}_{20}(t)',
    exampleDate: dateOf(idx),
    steps: [
      {
        label: `20-bar average and standard deviation of the close`,
        formula: `\\text{SMA}_{20}(t) = ${money(bands.middle[idx])}, \\quad \\sigma_{20}(t) = ${num(sd)}`,
        result: `${money(bands.middle[idx])} ± ${num(sd)}`,
      },
      {
        label: 'Lower band, two standard deviations below the average',
        formula: `\\text{Lower}_{20}(t) = ${money(bands.middle[idx])} - 2(${num(sd)})`,
        result: money(bands.lower[idx]),
      },
      {
        label: "Today's close against that band",
        formula: `C_t = ${money(price[idx])} \\;\\le\\; \\text{Lower}_{20}(t) = ${money(bands.lower[idx])}`,
        result: 'Buy from the next open',
      },
      {
        label: 'Where it sells — the upper band, which moves each bar',
        formula: `\\text{Upper}_{20}(t) = ${money(bands.middle[idx])} + 2(${num(sd)}) = ${money(bands.upper[idx])}`,
        result: `Sell once a close reaches ${money(bands.upper[idx])}`,
      },
    ],
    explanation:
      `${dateOf(idx)} closed at or below the lower Bollinger band — two standard deviations under ` +
      `the 20-day average — so the strategy buys at the next open on the bet that the stretch snaps ` +
      `back. It sells at the opposite band, not at the average, so a single trade has to travel the ` +
      `full width of the envelope: that is a wide target, and it holds positions for months rather ` +
      `than days. Exiting at the middle band instead is the more conventional rule, and across the ` +
      `whole universe it tests worse — the wide target is doing real work here. There is no stop, ` +
      `so the rule has no view on whether the decline that caused the stretch is actually over.`,
    comparison: compare(strategy.signals(bars)),
  };
}

// ── Mean reversion: RSI Reversion 14 (30/70) ────────────────────────────────

/** Wilder's smoothed average gain/loss — mirrors `indicators/oscillators.ts`
 * exactly, exposed here only so the walkthrough can show the recursive update
 * step rather than just the final RSI reading. */
function wilderAverages(
  values: number[],
  period: number
): { avgGain: number[]; avgLoss: number[] } {
  const avgGain = new Array<number>(values.length).fill(NaN);
  const avgLoss = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return { avgGain, avgLoss };

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }

  avgGain[period] = gainSum / period;
  avgLoss[period] = lossSum / period;

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain[i] = (avgGain[i - 1] * (period - 1) + gain) / period;
    avgLoss[i] = (avgLoss[i - 1] * (period - 1) + loss) / period;
  }

  return { avgGain, avgLoss };
}

function buildRsiReversion(): StrategyExample {
  const period = 14;
  const oversold = 30;
  const overbought = 70;
  const strategy = rsiReversion(period, oversold, overbought);
  const { avgGain, avgLoss } = wilderAverages(price, period);

  const idx = avgGain.findIndex((_, i) => {
    if (!Number.isFinite(avgGain[i]) || avgLoss[i] === undefined) return false;
    const rs = avgLoss[i] === 0 ? Infinity : avgGain[i] / avgLoss[i];
    const rsi = avgLoss[i] === 0 ? 100 : 100 - 100 / (1 + rs);
    return i > period + 1 && rsi < oversold;
  });

  const delta = price[idx] - price[idx - 1];
  const gain = delta > 0 ? delta : 0;
  const loss = delta < 0 ? -delta : 0;
  const rs = avgLoss[idx] === 0 ? Infinity : avgGain[idx] / avgLoss[idx];
  const rsiValue = avgLoss[idx] === 0 ? 100 : 100 - 100 / (1 + rs);

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.MeanReversion,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{RS} = \\frac{\\overline{\\text{gain}}_{14}}{\\overline{\\text{loss}}_{14}}, \\quad ' +
      '\\text{RSI} = 100 - \\frac{100}{1+\\text{RS}} \\qquad ' +
      '\\text{Buy} \\iff \\text{RSI}_{14}(t) < 30 \\qquad ' +
      '\\text{Sell} \\iff \\text{RSI}_{14}(t) > 70',
    exampleDate: dateOf(idx),
    steps: [
      {
        label: `Yesterday's smoothed averages roll forward with today's move (${
          gain > 0 ? '+' : '-'
        }${money(Math.abs(delta))})`,
        formula:
          `\\overline{\\text{gain}}_t = \\frac{\\overline{\\text{gain}}_{t-1}\\times 13 + \\text{gain}_t}{14} ` +
          `= \\frac{${num(avgGain[idx - 1])}\\times 13 + ${num(gain)}}{14}`,
        result: num(avgGain[idx]),
      },
      {
        label: 'Same recursion on the loss side',
        formula: `\\overline{\\text{loss}}_t = \\frac{${num(avgLoss[idx - 1])}\\times 13 + ${num(loss)}}{14}`,
        result: num(avgLoss[idx]),
      },
      {
        label: 'Relative strength, then RSI',
        formula: `\\text{RS} = \\frac{${num(avgGain[idx])}}{${num(avgLoss[idx])}}, \\quad \\text{RSI} = 100 - \\frac{100}{1+${num(rs)}}`,
        result: num(rsiValue),
      },
      {
        label: 'RSI against the oversold line',
        formula: `\\text{RSI}_{14}(t) = ${num(rsiValue)} \\;<\\; ${oversold}`,
        result: 'Buy from the next open',
      },
      {
        label: 'Where it sells — the overbought line, on the same reading',
        formula: `\\text{RSI}_{14}(t) \\;>\\; ${overbought}`,
        result: `Sell once RSI(${period}) climbs back above ${overbought}`,
      },
    ],
    explanation:
      `${dateOf(idx)} pushed RSI(14) to ${num(rsiValue, 1)}, deep into oversold territory during a ` +
      `sharp sell-off, so the strategy buys the next open on the bet that the drop was overdone. It ` +
      `exits once RSI climbs back above 70 — it has no view on whether the decline is actually over.`,
    comparison: compare(strategy.signals(bars)),
  };
}

// ── Mean reversion: IBS Reversion (10/90) ───────────────────────────────────

/** Where a bar's own close sits in its own high-low range — mirrors `strategies/meanReversion.ts`. */
function ibsOf(bar: (typeof bars)[number]): number {
  const range = bar.high - bar.low;
  return range > 0 ? (bar.close - bar.low) / range : 0.5;
}

function buildIbsReversion(): StrategyExample {
  const entry = 10;
  const exit = 90;
  const strategy = ibsReversion(entry, exit);

  // A fresh pin to the bottom of the day's range, not a continuation of one already there.
  const idx = bars.findIndex(
    (bar, i) => i > 1 && ibsOf(bar) * 100 < entry && ibsOf(bars[i - 1]) * 100 >= entry
  );

  const bar = bars[idx];
  const range = bar.high - bar.low;
  const ibsValue = ibsOf(bar);

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.MeanReversion,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{IBS}(t) = \\frac{C_t - L_t}{H_t - L_t} \\qquad ' +
      `\\text{Buy} \\iff \\text{IBS}(t) < ${entry / 100} \\qquad \\text{Sell} \\iff \\text{IBS}(t) > ${exit / 100}`,
    exampleDate: dateOf(idx),
    steps: [
      {
        label: "The day's own range, and where the close landed inside it",
        formula: `H_t = ${money(bar.high)}, \\quad L_t = ${money(bar.low)}, \\quad C_t = ${money(bar.close)}`,
        result: `range ${money(range)}`,
      },
      {
        label: 'Internal Bar Strength',
        formula: `\\text{IBS}(t) = \\frac{${money(bar.close)} - ${money(bar.low)}}{${money(bar.high)} - ${money(bar.low)}}`,
        result: num(ibsValue, 3),
      },
      {
        label: 'Against the entry line',
        formula: `\\text{IBS}(t) = ${num(ibsValue, 3)} \\;<\\; ${entry / 100}`,
        result: 'Buy from the next open',
      },
      {
        label: 'Where it sells — the same measure, on whichever future bar clears it',
        formula: `\\text{IBS}(t) \\;>\\; ${exit / 100}`,
        result: `Sell once a close pins to the top ${100 - exit}% of its own day's range`,
      },
    ],
    explanation:
      `${dateOf(idx)} closed at ${num(ibsValue, 2)} of the way up its own high-low range — deep in ` +
      `the bottom decile — so the strategy buys the next open on the bet that a close pinned to the ` +
      `floor of its own bar tends to bounce. Unlike every other reversion rule on this page it needs ` +
      `no history at all: the signal is a property of one bar, not a comparison against an average or ` +
      `a channel built from many of them.`,
    comparison: compare(strategy.signals(bars)),
  };
}

// ── Trend: OBV Trend 20 ──────────────────────────────────────────────────────

function buildObvTrend(): StrategyExample {
  const period = 20;
  const strategy = obvTrend(period);
  const line = obv(bars);
  const average = sma(line, period);

  // A fresh cross back above the line's own average, not a continuation of one already above it.
  const idx = line.findIndex(
    (v, i) =>
      i > period + 1 &&
      Number.isFinite(average[i]) &&
      Number.isFinite(average[i - 1]) &&
      v > average[i] &&
      line[i - 1] <= average[i - 1]
  );

  const bar = bars[idx];
  const prevClose = bars[idx - 1].close;
  const rising = bar.close > prevClose;

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: StrategyKind.Trend,
    description: strategy.description,
    dataset,
    ruleFormula:
      '\\text{OBV}(t) = \\text{OBV}(t-1) + \\text{sign}(C_t - C_{t-1})\\, V_t \\qquad ' +
      `\\text{Long} \\iff \\text{OBV}(t) > \\text{SMA}_{${period}}(\\text{OBV})(t)`,
    exampleDate: dateOf(idx),
    steps: [
      {
        label: `Today's close against yesterday's sets the sign, then today's volume is added to yesterday's running total`,
        formula: `\\text{OBV}(t) = \\text{OBV}(t-1) ${rising ? '+' : '-'} V_t = ${num(line[idx - 1], 0)} ${rising ? '+' : '-'} ${num(bar.volume, 0)}`,
        result: num(line[idx], 0),
      },
      {
        label: `${period}-bar average of the OBV line itself, not of price`,
        formula: `\\text{SMA}_{${period}}(\\text{OBV})(t)`,
        result: num(average[idx], 0),
      },
      {
        label: 'Compare the running total to its own average',
        formula: `\\text{OBV}(t) = ${num(line[idx], 0)} \\;>\\; \\text{SMA}_{${period}}(\\text{OBV})(t) = ${num(average[idx], 0)}`,
        result: 'Long from the next open',
      },
    ],
    explanation:
      `On ${dateOf(idx)} the running volume total crossed back above its own ${period}-bar average — ` +
      `volume on up days has outweighed volume on down days over the last month, not just the last ` +
      `bar. Every other trend rule on this page averages price; this one averages a line built purely ` +
      `from ${dataset.symbol}'s own volume, so it can agree or disagree with what price is doing — ` +
      `volume confirming a move is a different claim than price making one.`,
    comparison: compare(strategy.signals(bars)),
  };
}

export const STRATEGY_EXAMPLES: StrategyExample[] = [
  buildBuyAndHold(),
  buildSmaCross(),
  buildObvTrend(),
  buildAbsoluteMomentum(),
  buildDonchianBreakout(),
  buildBollingerBreakout(),
  buildRsiReversion(),
  buildBollingerReversion(),
  buildIbsReversion(),
];
