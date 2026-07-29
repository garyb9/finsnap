import { ulid } from 'ulid';
import type Redis from 'ioredis';
import { createLogger } from '../logger';
import type { AssetSpec, Config } from '../config';
import { BarCollector } from '../collectors/bars';
import { fetchOptionsData } from '../collectors/options';
import { fetchAssetSizes, type AssetSize } from '../collectors/quote';
import { analyzeOptionsChain } from '../analyzers/options';
import { analyzeAssetBars } from '../analyzers/price';
import { analyzeTsmom } from '../analyzers/tsmom';
import { backtestAsset, dropIncompleteBar, type ExecutionOptions } from '../backtest/runner';
import { SignalAction, StrategyKind, type StrategyReport } from '../backtest/types';
import { BarInterval } from '../collectors/types';
import {
  ACTIONABLE_EDGE,
  BANDWIDTH_BANDS,
  BEARISH_CONSENSUS,
  BULLISH_CONSENSUS,
  MAX_TOP_OPPORTUNITIES,
  MIN_BARS_FOR_BACKTEST,
  PERCENT_B_BANDS,
} from '../constants';
import { Timeframe } from '../constants/enums';
import { fmtPct, isoDate, pickBand } from '../lib/format';
import { buildNotes, computeConsensus } from './consensus';
import type { AssetOpportunity, DailyReport, Opportunity, OptionsContext } from './types';

const log = createLogger('report');

export class ReportBuilder {
  private bars: BarCollector;

  constructor(
    private config: Config,
    private redis: Redis
  ) {
    this.bars = new BarCollector(redis);
  }

  /**
   * Build the daily report.
   *
   * Every asset is analyzed through its last *completed* bar — the in-progress
   * candle is dropped first — so a pre-market run genuinely reflects "as of
   * yesterday's close" and its signals are actionable at today's open.
   */
  async build(): Promise<DailyReport> {
    log.info(`building daily report for ${this.config.universe.length} assets...`);

    const execution = {
      initialCapital: this.config.backtestCapital,
      feeBps: this.config.backtestFeeBps,
      slippageBps: this.config.backtestSlippageBps,
    };

    const assets: AssetOpportunity[] = [];
    let backtestsRun = 0;
    let strategiesRun = 0;

    // One batched request for the whole universe. Failure yields an empty map
    // and the report is built without size, which is decoration.
    const sizes = await fetchAssetSizes(
      this.config.universe.map((s) => s.symbol),
      this.redis
    );

    for (const spec of this.config.universe) {
      try {
        const asset = await this.buildAsset(spec, execution, sizes.get(spec.symbol.toUpperCase()));
        if (!asset) continue;
        assets.push(asset);
        strategiesRun += asset.daily.length + asset.intraday.length;
        backtestsRun +=
          asset.daily.reduce((s, r) => s + r.windows.length, 0) +
          asset.intraday.reduce((s, r) => s + r.windows.length, 0);
      } catch (err) {
        log.error(`${spec.symbol}: report build failed (continuing): ${err}`);
      }
    }

    if (assets.length === 0) {
      throw new Error('no assets could be analyzed — check data source availability');
    }

    const topOpportunities = collectOpportunities(assets);
    const latestBar = Math.max(...assets.map((a) => a.lastBarTime));

    const report: DailyReport = {
      id: ulid(),
      date: isoDate(latestBar),
      generatedAt: new Date().toISOString(),
      version: '1.0',
      execution,
      assets,
      topOpportunities,
      summary: {
        assetsAnalyzed: assets.length,
        strategiesRun,
        backtestsRun,
        freshEntries: assets.reduce((s, a) => s + a.consensus.freshEntries, 0),
        freshExits: assets.reduce((s, a) => s + a.consensus.freshExits, 0),
        avgConsensus: Math.round(assets.reduce((s, a) => s + a.consensus.score, 0) / assets.length),
        bullishAssets: assets.filter((a) => a.consensus.score >= BULLISH_CONSENSUS).length,
        bearishAssets: assets.filter((a) => a.consensus.score < BEARISH_CONSENSUS).length,
      },
    };

    log.info(
      `report ${report.id} — ${report.summary.assetsAnalyzed} assets, ` +
        `${report.summary.backtestsRun} backtests, ${report.summary.freshEntries} fresh entries, ` +
        `${report.summary.freshExits} exits, breadth ${report.summary.avgConsensus}/100`
    );

    return report;
  }

  private async buildAsset(
    spec: AssetSpec,
    execution: ExecutionOptions,
    size?: AssetSize
  ): Promise<AssetOpportunity | null> {
    const symbolBars = await this.bars.fetchSymbol(spec.symbol);

    if (!symbolBars.daily || symbolBars.daily.bars.length < MIN_BARS_FOR_BACKTEST) {
      log.warn(`${spec.symbol}: insufficient daily history — skipped`);
      return null;
    }

    const daily = dropIncompleteBar(symbolBars.daily);
    const hourly = symbolBars.hourly ? dropIncompleteBar(symbolBars.hourly) : null;

    const dailyResult = backtestAsset(spec, daily, execution);
    if (!dailyResult) return null;

    const intradayResult = hourly ? backtestAsset(spec, hourly, execution) : null;

    const consensus = computeConsensus(dailyResult.strategies);
    const notes = buildNotes(dailyResult.strategies, consensus);

    // Live multi-timeframe read, using the same bars the backtests ran on.
    const analysis = analyzeAssetBars(spec.label, { ...symbolBars, daily, hourly });
    const tsmom = analyzeTsmom(analysis.timeframes, spec.label);

    // The daily frame, to match the daily bars every strategy above was scored on.
    const dailyFrame = analysis.timeframes.find((t) => t.timeframe === Timeframe.D);

    const options = spec.hasOptions ? await this.buildOptionsContext(spec) : undefined;
    if (options?.insight && options.insight.label !== 'balanced') {
      const { dominantSide, wallStrike, distanceToSpotPct } = options.insight;
      notes.push(
        `options ${dominantSide} stacking near $${wallStrike.toFixed(2)} ` +
          `(${fmtPct(distanceToSpotPct)} vs spot)`
      );
    }

    return {
      symbol: spec.symbol,
      label: spec.label,
      assetClass: spec.assetClass,
      lastClose: dailyResult.lastClose,
      lastChangePct: dailyResult.lastChangePct,
      size,
      lastBarTime: dailyResult.lastBarTime,
      historyStart: dailyResult.historyStart,
      barsAnalyzed: dailyResult.barsAnalyzed,
      consensus,
      daily: dailyResult.strategies,
      intraday: intradayResult?.strategies ?? [],
      tsmom: { score: tsmom.score, label: tsmom.label },
      momentum: analysis.marketMomentum,
      bollinger: dailyFrame && {
        bandwidth: dailyFrame.bollinger.bandwidth,
        percentB: dailyFrame.bollinger.percentB,
        widthLabel: pickBand(BANDWIDTH_BANDS, dailyFrame.bollinger.bandwidth).label,
        positionLabel: pickBand(PERCENT_B_BANDS, dailyFrame.bollinger.percentB).label,
      },
      options,
      notes,
    };
  }

  /** Nearest-expiry positioning, as context rather than a signal. */
  private async buildOptionsContext(spec: AssetSpec): Promise<OptionsContext | undefined> {
    try {
      const data = await fetchOptionsData(spec.symbol, this.redis);
      if (!data) return undefined;

      const analysis = analyzeOptionsChain(data);
      const nearest = analysis.expirations[0];
      if (!nearest) return undefined;

      return {
        nearestExpiry: nearest.date,
        pcRatio: nearest.pcRatio,
        insight: nearest.insight,
      };
    } catch (err) {
      log.warn(`${spec.symbol}: options context unavailable: ${err}`);
      return undefined;
    }
  }
}

/**
 * Flatten every asset's fresh entries and exits into one ranked action list.
 *
 * Only signals from rules that cleared the edge bar make it in — a fresh entry
 * from a strategy that has never beaten buy-and-hold is noise, not an idea.
 */
function collectOpportunities(assets: AssetOpportunity[]): Opportunity[] {
  const out: Opportunity[] = [];

  const push = (
    asset: AssetOpportunity,
    reports: StrategyReport[],
    interval: BarInterval.Daily | BarInterval.Hourly
  ) => {
    for (const report of reports) {
      const { action } = report.signal;
      if (action !== SignalAction.Enter && action !== SignalAction.Exit) continue;
      if (report.edgeScore < ACTIONABLE_EDGE) continue;
      if (report.kind === StrategyKind.Benchmark) continue;

      out.push({
        symbol: asset.symbol,
        label: asset.label,
        strategyId: report.strategyId,
        strategyName: report.name,
        interval,
        action,
        opportunityScore: report.opportunityScore,
        edgeScore: report.edgeScore,
        entryPrice: report.signal.lastClose,
        rationale: report.rationale,
      });
    }
  };

  for (const asset of assets) {
    push(asset, asset.daily, BarInterval.Daily);
    push(asset, asset.intraday, BarInterval.Hourly);
  }

  return out
    .sort((a, b) => {
      // Entries rank above exits, then by how strong the underlying rule is.
      if (a.action !== b.action) return a.action === SignalAction.Enter ? -1 : 1;
      return b.edgeScore - a.edgeScore || b.opportunityScore - a.opportunityScore;
    })
    .slice(0, MAX_TOP_OPPORTUNITIES);
}
