import { DAY_MS, YEAR_DAYS } from '../constants';
import { mean, sampleStdev } from '../lib/math';
import type { Trade, BacktestStats } from './types';

const YEAR_MS = YEAR_DAYS * DAY_MS;

/** Per-bar simple returns of an equity curve. */
export function periodReturns(equity: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1];
    if (prev > 0) out.push(equity[i] / prev - 1);
  }
  return out;
}

export function maxDrawdownPct(equity: number[]): number {
  let peak = -Infinity;
  let worst = 0;

  for (const value of equity) {
    if (value > peak) peak = value;
    if (peak > 0) {
      const drawdown = ((value - peak) / peak) * 100;
      if (drawdown < worst) worst = drawdown;
    }
  }

  return worst;
}

/**
 * Annualized Sharpe at a zero risk-free rate.
 *
 * The cash rate is deliberately omitted: these strategies sit flat a large share
 * of the time, and subtracting a risk-free rate would flatter whichever ones
 * trade least, for reasons unrelated to signal quality.
 */
export function sharpe(returns: number[], periodsPerYear: number): number {
  const sd = sampleStdev(returns);
  if (sd === 0) return 0;
  return (mean(returns) / sd) * Math.sqrt(periodsPerYear);
}

/** Sharpe variant that only penalizes downside deviation. */
export function sortino(returns: number[], periodsPerYear: number): number {
  const downside = returns.filter((r) => r < 0);
  if (downside.length < 2) return 0;

  const downsideDev = Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length);
  if (downsideDev === 0) return 0;

  return (mean(returns) / downsideDev) * Math.sqrt(periodsPerYear);
}

/** Compound annual growth rate over an elapsed span, in percent. */
export function cagrPct(initial: number, final: number, years: number): number {
  if (initial <= 0 || final <= 0 || years <= 0) return 0;
  return ((final / initial) ** (1 / years) - 1) * 100;
}

export function profitFactor(trades: Trade[]): number {
  let gains = 0;
  let losses = 0;

  for (const trade of trades) {
    if (trade.open) continue;
    if (trade.returnPct > 0) gains += trade.returnPct;
    else losses -= trade.returnPct;
  }

  if (losses === 0) return gains > 0 ? Infinity : 0;
  return gains / losses;
}

interface TradeSummary {
  winRatePct: number;
  numTrades: number;
  avgTradeReturnPct: number;
  avgBarsHeld: number;
  bestTradePct: number;
  worstTradePct: number;
}

/** Trade-level statistics, computed over closed trades only. */
export function summarizeTrades(trades: Trade[]): TradeSummary {
  const closed = trades.filter((t) => !t.open);

  if (closed.length === 0) {
    return {
      winRatePct: 0,
      numTrades: trades.length,
      avgTradeReturnPct: 0,
      avgBarsHeld: 0,
      bestTradePct: 0,
      worstTradePct: 0,
    };
  }

  const returns = closed.map((t) => t.returnPct);
  const wins = returns.filter((r) => r > 0).length;

  return {
    winRatePct: (wins / closed.length) * 100,
    numTrades: trades.length,
    avgTradeReturnPct: mean(returns),
    avgBarsHeld: mean(closed.map((t) => t.barsHeld)),
    bestTradePct: Math.max(...returns),
    worstTradePct: Math.min(...returns),
  };
}

export interface StatsInput {
  equity: number[];
  trades: Trade[];
  initialCapital: number;
  /** Used only when the window is too short to infer a rate from timestamps */
  periodsPerYear: number;
  startTime: number;
  endTime: number;
  barsExposed: number;
}

/** Windows shorter than this are too brief to infer a bar rate from. */
const MIN_INFERABLE_YEARS = 30 / 365;

/**
 * Derive the annualization rate from the data itself.
 *
 * Taking bars-per-year on faith is how a series that is secretly monthly gets
 * annualized as if it were daily, inflating CAGR by orders of magnitude. Actual
 * elapsed time between the first and last bar cannot lie, so it is preferred
 * whenever the window is long enough to measure.
 */
function inferPeriodsPerYear(bars: number, elapsedYears: number, fallback: number): number {
  if (elapsedYears < MIN_INFERABLE_YEARS || bars < 2) return fallback;
  return bars / elapsedYears;
}

export function buildStats(input: StatsInput): BacktestStats {
  const { equity, trades, initialCapital, startTime, endTime, barsExposed } = input;

  const bars = equity.length;
  const finalValue = equity[bars - 1] ?? initialCapital;
  const returns = periodReturns(equity);
  const drawdown = maxDrawdownPct(equity);

  const elapsedYears = (endTime - startTime) / YEAR_MS;
  const periodsPerYear = inferPeriodsPerYear(bars, elapsedYears, input.periodsPerYear);
  const years = elapsedYears > 0 ? elapsedYears : bars / periodsPerYear;
  const cagr = cagrPct(initialCapital, finalValue, years);

  return {
    startTime,
    endTime,
    bars,
    initialCapital,
    finalValue,
    totalReturnPct: initialCapital > 0 ? (finalValue / initialCapital - 1) * 100 : 0,
    cagrPct: cagr,
    volatilityPct: sampleStdev(returns) * Math.sqrt(periodsPerYear) * 100,
    sharpe: sharpe(returns, periodsPerYear),
    sortino: sortino(returns, periodsPerYear),
    maxDrawdownPct: drawdown,
    calmar: Math.abs(drawdown) > 0 ? cagr / Math.abs(drawdown) : 0,
    profitFactor: profitFactor(trades),
    exposurePct: bars > 0 ? (barsExposed / bars) * 100 : 0,
    ...summarizeTrades(trades),
  };
}
