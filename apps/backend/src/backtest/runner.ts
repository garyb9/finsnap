import { createLogger } from '../logger';
import { BarInterval, type Bar, type BarSeries } from '../collectors/types';
import { AssetClass, type AssetSpec } from '../config';
import {
  DAILY_WINDOWS,
  INTERVAL_MS,
  INTRADAY_WINDOWS,
  MIN_BARS_FOR_BACKTEST,
  PERIODS_PER_YEAR,
} from '../constants';
import { runBacktest, runBuyAndHold } from './engine';
import {
  buildRationale,
  computeEdgeScore,
  computeOpportunityScore,
  readSignal,
} from './opportunity';
import { applicableStrategies } from './strategies';
import type {
  BacktestOptions,
  Signal,
  StrategyDef,
  StrategyReport,
  WindowResult,
  WindowSpec,
} from './types';
import { buildWindows } from './windows';

const log = createLogger('backtest');

export type ExecutionOptions = Omit<BacktestOptions, 'periodsPerYear'>;

/** Hourly bars annualize differently from daily; crypto trades 24/7. */
function periodsPerYear(spec: AssetSpec, interval: BarInterval): number {
  const isCrypto = spec.assetClass === AssetClass.Crypto;

  switch (interval) {
    case BarInterval.Hourly:
      return isCrypto ? PERIODS_PER_YEAR.cryptoHourly : PERIODS_PER_YEAR.equityHourly;
    case BarInterval.FiveMinute:
      return isCrypto ? PERIODS_PER_YEAR.crypto5m : PERIODS_PER_YEAR.equity5m;
    case BarInterval.Daily:
    default:
      return isCrypto ? PERIODS_PER_YEAR.cryptoDaily : PERIODS_PER_YEAR.equityDaily;
  }
}

function defaultWindows(interval: BarInterval): WindowSpec[] {
  return interval === BarInterval.Daily ? DAILY_WINDOWS : INTRADAY_WINDOWS;
}

/** Run the strategy and its benchmark over one window and compare them. */
function toWindowResult(
  spec: WindowSpec,
  bars: Bar[],
  signals: Signal[],
  options: BacktestOptions,
  stops?: (number | null)[]
): WindowResult {
  const strategy = runBacktest(bars, signals, options, stops);
  const benchmark = runBuyAndHold(bars, options);

  const excessCagrPct = strategy.stats.cagrPct - benchmark.stats.cagrPct;
  const lessDrawdown =
    Math.abs(strategy.stats.maxDrawdownPct) <= Math.abs(benchmark.stats.maxDrawdownPct);

  return {
    window: spec.id,
    label: spec.label,
    stats: strategy.stats,
    benchmark: {
      totalReturnPct: benchmark.stats.totalReturnPct,
      cagrPct: benchmark.stats.cagrPct,
      maxDrawdownPct: benchmark.stats.maxDrawdownPct,
      sharpe: benchmark.stats.sharpe,
    },
    excessCagrPct,
    // "Beating" the benchmark requires winning on return *and* not taking more
    // pain to get there. Return alone rewards leverage-like behaviour.
    beatsBenchmark: excessCagrPct > 0 && lessDrawdown,
  };
}

/** Run one strategy over every applicable window and score it. */
export function evaluateStrategy(
  strategy: StrategyDef,
  bars: Bar[],
  windowSpecs: WindowSpec[],
  options: BacktestOptions
): StrategyReport | null {
  // Signals (and any protective stop levels) are computed once over the full
  // history; each window slices into them, so indicator warm-up never
  // contaminates a short window.
  const signals = strategy.signals(bars);
  const stops = strategy.stops?.(bars);
  const slices = buildWindows(bars, signals, windowSpecs, stops);
  if (slices.length === 0) return null;

  const windows = slices.map((slice) =>
    toWindowResult(slice.spec, slice.bars, slice.signals, options, slice.stops)
  );

  const longest = windows.find((w) => w.window === 'max') ?? windows[0];
  const edgeScore = computeEdgeScore(windows, longest.stats.numTrades);
  const signal = readSignal(bars, signals);

  return {
    strategyId: strategy.id,
    name: strategy.name,
    kind: strategy.kind,
    description: strategy.description,
    params: strategy.params,
    signal,
    windows,
    edgeScore: Math.round(edgeScore),
    opportunityScore: Math.round(computeOpportunityScore(signal, edgeScore)),
    rationale: buildRationale(signal, edgeScore, windows),
  };
}

export interface AssetBacktest {
  symbol: string;
  label: string;
  assetClass: AssetSpec['assetClass'];
  interval: BarInterval;
  /** Close of the last completed bar */
  lastClose: number;
  lastBarTime: number;
  /** Percent change across the last completed bar */
  lastChangePct: number;
  barsAnalyzed: number;
  historyStart: number;
  strategies: StrategyReport[];
}

/**
 * Backtest every applicable strategy for one asset on one bar series, ranked by
 * how attractive their signal is today.
 */
export function backtestAsset(
  spec: AssetSpec,
  series: BarSeries,
  execution: ExecutionOptions,
  windowSpecs?: WindowSpec[]
): AssetBacktest | null {
  const bars = series.bars;

  if (bars.length < MIN_BARS_FOR_BACKTEST) {
    log.warn(`${spec.symbol} ${series.interval}: only ${bars.length} bars — skipping backtests`);
    return null;
  }

  const specs = windowSpecs ?? defaultWindows(series.interval);
  const options: BacktestOptions = {
    ...execution,
    periodsPerYear: periodsPerYear(spec, series.interval),
  };

  // Ranked by edge, not by today's opportunity score.
  //
  // Opportunity inverts the edge for a flat signal, so ranking by it floats
  // discredited rules that happen to be in cash to the top — exactly the
  // strategies a reader should ignore. Trade count breaks ties so a rule that
  // never traded does not outrank one with a real record.
  const strategies = applicableStrategies(bars.length)
    .map((strategy) => evaluateStrategy(strategy, bars, specs, options))
    .filter((report): report is StrategyReport => report !== null)
    .sort((a, b) => {
      if (b.edgeScore !== a.edgeScore) return b.edgeScore - a.edgeScore;
      const aTrades = a.windows[0]?.stats.numTrades ?? 0;
      const bTrades = b.windows[0]?.stats.numTrades ?? 0;
      return bTrades - aTrades;
    });

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  log.info(
    `${spec.symbol} ${series.interval}: ${strategies.length} strategies × ${specs.length} windows ` +
      `over ${bars.length} bars`
  );

  return {
    symbol: spec.symbol,
    label: spec.label,
    assetClass: spec.assetClass,
    interval: series.interval,
    lastClose: last.close,
    lastBarTime: last.time,
    lastChangePct: prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0,
    barsAnalyzed: bars.length,
    historyStart: bars[0].time,
    strategies,
  };
}

/**
 * Drop a still-forming final bar.
 *
 * Yahoo includes the in-progress candle, whose close is just the current price.
 * Acting on it would mean the backtest and the live signal disagree the moment
 * the session ends, so it is trimmed before any analysis runs — this is what
 * lets the pre-market report say "through yesterday's close" and mean it.
 */
export function dropIncompleteBar(series: BarSeries, now = Date.now()): BarSeries {
  const bars = series.bars;
  if (bars.length === 0) return series;

  const last = bars[bars.length - 1];
  if (now - last.time < INTERVAL_MS[series.interval]) {
    return { ...series, bars: bars.slice(0, -1) };
  }

  return series;
}
