import { describe, it, expect } from 'vitest';
import { backtestAsset, dropIncompleteBar, evaluateStrategy } from '../backtest/runner';
import { buyAndHold } from '../backtest/strategies';
import { SignalAction } from '../backtest/types';
import { smaCross } from '../backtest/strategies/trend';
import { DAILY_WINDOWS } from '../backtest/windows';
import { AssetClass, type AssetSpec } from '../config';
import type { BacktestOptions } from '../backtest/types';
import { BarInterval } from '../collectors/types';
import { barsFromCloses, risingCloses, toSeries, T0 } from './helpers/bars';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const CRYPTO: AssetSpec = {
  symbol: 'BTC-USD',
  label: 'BTC',
  assetClass: AssetClass.Crypto,
  periodsPerYear: 365,
  hasOptions: false,
};

const EXECUTION = { initialCapital: 10_000, feeBps: 5, slippageBps: 5 };

const OPTIONS: BacktestOptions = { ...EXECUTION, periodsPerYear: 365 };

describe('evaluateStrategy', () => {
  const bars = barsFromCloses(risingCloses(1_200, 100, 0.15));

  it('scores a strategy across multiple windows', () => {
    const report = evaluateStrategy(smaCross(50, 200), bars, DAILY_WINDOWS, OPTIONS)!;

    expect(report.strategyId).toBe('sma_cross_50_200');
    expect(report.windows.length).toBeGreaterThan(3);
    expect(report.edgeScore).toBeGreaterThanOrEqual(0);
    expect(report.edgeScore).toBeLessThanOrEqual(100);
    expect(report.rationale).toBeTruthy();
  });

  it('includes a benchmark comparison in every window', () => {
    const report = evaluateStrategy(smaCross(50, 200), bars, DAILY_WINDOWS, OPTIONS)!;

    for (const window of report.windows) {
      expect(window.benchmark.cagrPct).toBeTypeOf('number');
      expect(window.excessCagrPct).toBeCloseTo(window.stats.cagrPct - window.benchmark.cagrPct, 6);
    }
  });

  it('scores buy-and-hold as neutral against itself', () => {
    const report = evaluateStrategy(buyAndHold, bars, DAILY_WINDOWS, OPTIONS)!;

    for (const window of report.windows) {
      expect(window.excessCagrPct).toBeCloseTo(0, 6);
      expect(window.beatsBenchmark).toBe(false);
    }
  });

  it('returns null when no window has enough bars', () => {
    const tiny = barsFromCloses(risingCloses(5));
    expect(evaluateStrategy(smaCross(50, 200), tiny, DAILY_WINDOWS, OPTIONS)).toBeNull();
  });
});

describe('backtestAsset', () => {
  it('runs the applicable registry over a deep series', () => {
    const series = toSeries(barsFromCloses(risingCloses(1_500, 100, 0.1)));
    const result = backtestAsset(CRYPTO, series, EXECUTION)!;

    expect(result.label).toBe('BTC');
    expect(result.strategies.length).toBeGreaterThan(10);
    expect(result.barsAnalyzed).toBe(1_500);
  });

  /**
   * Edge, not opportunity — `backtestAsset` says so explicitly and for a reason:
   * `stay_out` and `exit` invert the edge, so a discredited rule sitting in cash
   * carries a *high* opportunity score. Ranking on that floats exactly the rules
   * a reader should ignore to the top. This asserted the opposite invariant and
   * passed only because a monotonically rising series leaves every rule long.
   */
  it('ranks strategies by edge score, not by opportunity score', () => {
    const series = toSeries(barsFromCloses(risingCloses(1_500, 100, 0.1)));
    const strategies = backtestAsset(CRYPTO, series, EXECUTION)!.strategies;
    const edges = strategies.map((s) => s.edgeScore);

    expect([...edges].sort((a, b) => b - a)).toEqual(edges);
  });

  it('breaks an edge tie on trade count so a rule that never traded cannot outrank one that did', () => {
    const series = toSeries(barsFromCloses(risingCloses(1_500, 100, 0.1)));
    const strategies = backtestAsset(CRYPTO, series, EXECUTION)!.strategies;

    for (let i = 1; i < strategies.length; i++) {
      if (strategies[i - 1].edgeScore !== strategies[i].edgeScore) continue;
      const prev = strategies[i - 1].windows[0]?.stats.numTrades ?? 0;
      const cur = strategies[i].windows[0]?.stats.numTrades ?? 0;
      expect(
        prev,
        `${strategies[i - 1].strategyId} vs ${strategies[i].strategyId}`
      ).toBeGreaterThanOrEqual(cur);
    }
  });

  it('reports the last completed bar as the reference price', () => {
    const bars = barsFromCloses(risingCloses(500));
    const result = backtestAsset(CRYPTO, toSeries(bars), EXECUTION)!;

    expect(result.lastClose).toBe(bars.at(-1)!.close);
    expect(result.lastBarTime).toBe(bars.at(-1)!.time);
    expect(result.historyStart).toBe(bars[0].time);
  });

  it('gives every strategy a signal for today', () => {
    const series = toSeries(barsFromCloses(risingCloses(1_500, 100, 0.1)));

    for (const strategy of backtestAsset(CRYPTO, series, EXECUTION)!.strategies) {
      expect(Object.values(SignalAction)).toContain(strategy.signal.action);
      expect(strategy.signal.lastClose).toBeGreaterThan(0);
    }
  });

  it('returns null when history is too short', () => {
    const series = toSeries(barsFromCloses(risingCloses(20)));
    expect(backtestAsset(CRYPTO, series, EXECUTION)).toBeNull();
  });

  it('finds a trend rule long in a sustained uptrend', () => {
    const series = toSeries(barsFromCloses(risingCloses(1_500, 100, 0.1)));
    const result = backtestAsset(CRYPTO, series, EXECUTION)!;
    const trend = result.strategies.find((s) => s.strategyId === 'price_above_sma_200')!;

    expect(trend.signal.target).toBe(1);
  });
});

describe('dropIncompleteBar', () => {
  const now = T0 + 10 * DAY_MS;

  it('drops a final daily bar that is still forming', () => {
    // Last bar opened 2 hours ago — the session has not closed.
    const bars = barsFromCloses(risingCloses(10));
    bars[bars.length - 1].time = now - 2 * HOUR_MS;

    const trimmed = dropIncompleteBar(toSeries(bars), now);
    expect(trimmed.bars).toHaveLength(9);
  });

  it('keeps a final bar whose interval has fully elapsed', () => {
    const bars = barsFromCloses(risingCloses(10));
    bars[bars.length - 1].time = now - 2 * DAY_MS;

    expect(dropIncompleteBar(toSeries(bars), now).bars).toHaveLength(10);
  });

  it('respects the hourly interval', () => {
    const bars = barsFromCloses(risingCloses(10), HOUR_MS);
    bars[bars.length - 1].time = now - 10 * 60 * 1000;

    const series = toSeries(bars, BarInterval.Hourly);
    expect(dropIncompleteBar(series, now).bars).toHaveLength(9);
  });

  it('handles an empty series', () => {
    expect(dropIncompleteBar(toSeries([]), now).bars).toEqual([]);
  });

  it('does not mutate the input series', () => {
    const bars = barsFromCloses(risingCloses(10));
    bars[bars.length - 1].time = now - 1000;
    const series = toSeries(bars);

    dropIncompleteBar(series, now);
    expect(series.bars).toHaveLength(10);
  });
});
