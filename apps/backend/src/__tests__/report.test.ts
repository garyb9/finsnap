import { describe, it, expect } from 'vitest';
import { compactAsset, compactReport } from '../report/compact';
import { formatAssetDetail, formatDailyReport } from '../report/format';
import type { AssetOpportunity, DailyReport } from '../report/types';
import {
  SignalAction,
  StrategyKind,
  WindowId,
  type BacktestStats,
  type StrategyReport,
  type WindowResult,
} from '../backtest/types';
import { BarInterval } from '../collectors/types';
import { AssetClass } from '../config';
import { Verdict } from '../report/types';

function makeStats(overrides: Partial<BacktestStats> = {}): BacktestStats {
  return {
    startTime: 0,
    endTime: 1,
    bars: 500,
    initialCapital: 10_000,
    finalValue: 15_000,
    totalReturnPct: 50,
    cagrPct: 12,
    volatilityPct: 20,
    sharpe: 0.8,
    sortino: 1.1,
    maxDrawdownPct: -25,
    calmar: 0.48,
    winRatePct: 58,
    profitFactor: 1.6,
    numTrades: 30,
    avgTradeReturnPct: 3,
    avgBarsHeld: 15,
    exposurePct: 65,
    bestTradePct: 30,
    worstTradePct: -10,
    ...overrides,
  };
}

function makeWindow(id: WindowId): WindowResult {
  return {
    window: id,
    label: String(id),
    stats: makeStats(),
    benchmark: { totalReturnPct: 40, cagrPct: 9, maxDrawdownPct: -45, sharpe: 0.5 },
    excessCagrPct: 3,
    beatsBenchmark: true,
  };
}

function makeStrategy(id: string, overrides: Partial<StrategyReport> = {}): StrategyReport {
  return {
    strategyId: id,
    name: id,
    kind: StrategyKind.Trend,
    description: 'test rule',
    params: { fast: 12, slow: 26 },
    signal: {
      action: SignalAction.Enter,
      target: 1,
      previous: 0,
      barsInState: 1,
      lastClose: 420.5,
      lastBarTime: Date.UTC(2026, 6, 27),
    },
    windows: [makeWindow(WindowId.Max), makeWindow(WindowId.Y5), makeWindow(WindowId.Y1)],
    edgeScore: 72,
    opportunityScore: 78,
    rationale: 'fires a fresh entry — strong historical edge',
    ...overrides,
  };
}

function makeAsset(overrides: Partial<AssetOpportunity> = {}): AssetOpportunity {
  return {
    symbol: 'BTC-USD',
    label: 'BTC',
    assetClass: AssetClass.Crypto,
    lastClose: 118_420.123,
    lastChangePct: 1.234,
    lastBarTime: Date.UTC(2026, 6, 27),
    historyStart: Date.UTC(2014, 8, 17),
    barsAnalyzed: 4_300,
    consensus: {
      score: 74,
      verdict: Verdict.StrongBuy,
      longWeight: 3.2,
      flatWeight: 1.1,
      longCount: 12,
      votingCount: 19,
      freshEntries: 2,
      freshExits: 0,
    },
    daily: [makeStrategy('sma_cross_50_200'), makeStrategy('ema_cross_12_26')],
    intraday: [],
    tsmom: { score: 68, label: 'continuation' },
    momentum: 70,
    notes: ['2 strategies flipped long at the last close'],
    ...overrides,
  };
}

function makeReport(overrides: Partial<DailyReport> = {}): DailyReport {
  const assets = [makeAsset()];

  return {
    id: '01HZ000000000000000000000',
    date: '2026-07-27',
    generatedAt: new Date().toISOString(),
    version: '1.0',
    execution: { initialCapital: 10_000, feeBps: 5, slippageBps: 5 },
    assets,
    topOpportunities: [
      {
        symbol: 'BTC-USD',
        label: 'BTC',
        strategyId: 'sma_cross_50_200',
        strategyName: 'SMA Cross 50/200',
        interval: BarInterval.Daily,
        action: SignalAction.Enter,
        opportunityScore: 78,
        edgeScore: 72,
        entryPrice: 118_420,
        rationale: 'fires a fresh entry — strong historical edge',
      },
    ],
    summary: {
      assetsAnalyzed: 1,
      strategiesRun: 20,
      backtestsRun: 200,
      freshEntries: 2,
      freshExits: 0,
      avgConsensus: 74,
      bullishAssets: 1,
      bearishAssets: 0,
    },
    ...overrides,
  };
}

describe('compactAsset', () => {
  it('drops the benchmark from the strategy list', () => {
    const asset = makeAsset({
      daily: [
        makeStrategy('buy_and_hold', { kind: StrategyKind.Benchmark }),
        makeStrategy('sma_cross_50_200'),
      ],
    });

    const compact = compactAsset(asset);
    expect(compact.top.map((s) => s.id)).toEqual(['sma_cross_50_200']);
  });

  it('limits the strategy list to topN', () => {
    const asset = makeAsset({
      daily: Array.from({ length: 12 }, (_, i) => makeStrategy(`s${i}`)),
    });

    expect(compactAsset(asset, 3).top).toHaveLength(3);
  });

  it('picks a preferred headline window', () => {
    const [strategy] = compactAsset(makeAsset()).top;
    expect(strategy.headline?.window).toBe(WindowId.Y5);
  });

  it('falls back to the first window when no preferred one exists', () => {
    const asset = makeAsset({
      daily: [makeStrategy('a', { windows: [makeWindow(WindowId.M6)] })],
    });

    expect(compactAsset(asset).top[0].headline?.window).toBe(WindowId.M6);
  });

  it('rounds prices to something readable', () => {
    expect(compactAsset(makeAsset()).lastClose).toBe(118_420.12);
    expect(compactAsset(makeAsset()).lastChangePct).toBe(1.23);
  });

  /**
   * The dashboard carried a trend score and a momentum score but dropped the
   * Bollinger read, even though the same numbers were already computed for
   * `/technicals`. Four of the rules it lists are band rules, so whether the
   * envelope is tight or wide is the context that makes them readable.
   */
  it('carries the Bollinger reading through to the dashboard payload', () => {
    const asset = makeAsset({
      bollinger: {
        bandwidth: 4.5678,
        percentB: 0.87654,
        widthLabel: 'moderate',
        positionLabel: 'upper band',
      },
    });

    const compact = compactAsset(asset);

    expect(compact.bollinger).toEqual({
      bandwidth: 4.57,
      percentB: 0.877,
      widthLabel: 'moderate',
      positionLabel: 'upper band',
    });
  });

  it('leaves the Bollinger reading absent when the analyzer produced none', () => {
    expect(compactAsset(makeAsset({ bollinger: undefined })).bollinger).toBeUndefined();
  });
});

describe('compactReport', () => {
  it('preserves the summary and opportunities verbatim', () => {
    const report = makeReport();
    const compact = compactReport(report);

    expect(compact.summary).toEqual(report.summary);
    expect(compact.topOpportunities).toEqual(report.topOpportunities);
  });

  it('is substantially smaller than the full report', () => {
    const report = makeReport();
    const full = JSON.stringify(report).length;
    const compact = JSON.stringify(compactReport(report)).length;

    expect(compact).toBeLessThan(full);
  });
});

describe('formatDailyReport', () => {
  it('leads with the date and the day’s actions', () => {
    const [header] = formatDailyReport(makeReport());

    expect(header).toContain('2026-07-27');
    expect(header).toContain('SMA Cross 50/200');
    expect(header).toContain('ENTER');
  });

  it('says so plainly when nothing fired', () => {
    const [header] = formatDailyReport(makeReport({ topOpportunities: [] }));
    expect(header).toContain('No fresh entries or exits');
  });

  it('includes an asset table', () => {
    const messages = formatDailyReport(makeReport());
    expect(messages[1]).toContain('BTC');
    expect(messages[1]).toContain('STRONG BUY');
  });

  it('adds a detail block only for noteworthy assets', () => {
    const quiet = makeAsset({
      consensus: {
        ...makeAsset().consensus,
        verdict: Verdict.Neutral,
        freshEntries: 0,
        freshExits: 0,
      },
    });

    const noisy = formatDailyReport(makeReport());
    const calm = formatDailyReport(makeReport({ assets: [quiet] }));

    expect(noisy.length).toBeGreaterThan(calm.length);
    expect(calm).toHaveLength(2);
  });

  it('escapes HTML so a ticker name cannot break the markup', () => {
    const asset = makeAsset({ label: '<b>X' });
    const messages = formatDailyReport(makeReport({ assets: [asset] }));

    expect(messages[1]).toContain('&lt;b&gt;X');
  });

  it('keeps every message within the Telegram size cap', () => {
    const assets = Array.from({ length: 30 }, (_, i) => makeAsset({ label: `A${i}` }));
    const messages = formatDailyReport(makeReport({ assets }));

    for (const message of messages) {
      expect(message.length).toBeLessThan(4096);
    }
  });
});

describe('formatAssetDetail', () => {
  it('reports the history span and the vote split', () => {
    const text = formatAssetDetail(makeAsset());

    expect(text).toContain('BTC — BTC-USD');
    expect(text).toContain('12/19 strategies long');
    expect(text).toContain('2014-09-17');
  });

  it('includes options context when present', () => {
    const asset = makeAsset({
      options: { nearestExpiry: '2026-08-21', pcRatio: 0.82, insight: undefined },
    });

    expect(formatAssetDetail(asset)).toContain('2026-08-21');
  });
});
