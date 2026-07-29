import { ulid } from 'ulid';
import type Redis from 'ioredis';
import type { AssetSpec, Config } from '../config';
import { createLogger } from '../logger';
import { BarCollector } from '../collectors/bars';
import { fetchOptionsData } from '../collectors/options';
import { fetchAssetSizes, type AssetSize } from '../collectors/quote';
import { analyzeOptionsChain } from '../analyzers/options';
import { analyzeAssetBars } from '../analyzers/price';
import { analyzeTsmom } from '../analyzers/tsmom';
import type { AssetSnap, FinSnap } from './types';

const log = createLogger('builder');

/**
 * Builds the intraday snapshot: where every tracked asset stands right now
 * across timeframes, plus options positioning for the equities.
 *
 * This is the live view. The backtest-driven daily report is built separately
 * by `ReportBuilder` — snaps run every few minutes off cached bars, while the
 * report runs once a session off completed bars.
 */
export class SnapBuilder {
  private bars: BarCollector;

  constructor(
    private config: Config,
    private redis: Redis
  ) {
    this.bars = new BarCollector(redis);
  }

  async build(): Promise<FinSnap> {
    log.info(`building snap for ${this.config.universe.length} assets...`);

    const assets: Record<string, AssetSnap> = {};

    // One batched request for the whole universe; cached for hours, so this is
    // a no-op on all but the first snap of the session.
    const sizes = await fetchAssetSizes(
      this.config.universe.map((s) => s.symbol),
      this.redis
    );

    for (const spec of this.config.universe) {
      try {
        const snap = await this.buildAsset(spec, sizes.get(spec.symbol.toUpperCase()));
        if (snap) assets[spec.label] = snap;
      } catch (err) {
        log.warn(`${spec.symbol}: snap failed (continuing): ${err}`);
      }
    }

    const tracked = Object.values(assets);
    const bullish = tracked.filter((a) => {
      const daily = a.timeframes.find((tf) => tf.timeframe === 'D');
      return daily?.ema20AboveEma50 ?? false;
    }).length;

    const snap: FinSnap = {
      id: ulid(),
      timestamp: new Date().toISOString(),
      version: '2.0',
      assets,
      market: {
        breadth: tracked.length > 0 ? Math.round((bullish / tracked.length) * 100) : 0,
        avgTsmom:
          tracked.length > 0
            ? Math.round(tracked.reduce((s, a) => s + a.tsmom.score, 0) / tracked.length)
            : 50,
        assetsTracked: tracked.length,
      },
    };

    log.info(
      `snap ${snap.id} built — ${tracked.length} assets, breadth ${snap.market.breadth}%, ` +
        `avg TSMOM ${snap.market.avgTsmom}`
    );
    return snap;
  }

  private async buildAsset(spec: AssetSpec, size?: AssetSize): Promise<AssetSnap | null> {
    const bars = await this.bars.fetchSymbol(spec.symbol);
    if (!bars.daily && !bars.hourly) {
      log.warn(`${spec.symbol}: no bar data available`);
      return null;
    }

    const analysis = analyzeAssetBars(spec.label, bars);
    const tsmom = analyzeTsmom(analysis.timeframes, spec.label);
    const daily = analysis.timeframes.find((tf) => tf.timeframe === 'D');

    const snap: AssetSnap = {
      symbol: spec.symbol,
      label: spec.label,
      assetClass: spec.assetClass,
      currentPrice: analysis.currentPrice,
      changePct: daily?.changePct ?? 0,
      size,
      timeframes: analysis.timeframes,
      tsmom: { score: tsmom.score, label: tsmom.label },
      momentum: analysis.marketMomentum,
    };

    if (spec.hasOptions) {
      const data = await fetchOptionsData(spec.symbol, this.redis);
      if (data) {
        const chain = analyzeOptionsChain(data);
        snap.description = chain.description;
        snap.options = { price: data.price, expirations: chain.expirations };
      } else {
        log.warn(`${spec.symbol}: options data unavailable`);
      }
    }

    return snap;
  }
}
