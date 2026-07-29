import type Redis from 'ioredis';
import { createLogger } from '../../logger';
import { wait } from '../../lib/async';
import { BAR_CACHE_TTL_SECONDS, REDIS_KEYS, YAHOO_CALL_DELAY_MS } from '../../constants';
import { BarInterval, type BarSeries, type PackedBarSeries, type SymbolBars } from '../types';
import { fetchChart } from './chart';
import { packSeries, unpackSeries } from './pack';

const log = createLogger('bars');

/** Order matters: daily first, so a rate-limited run still has backtest data. */
const INTERVALS: BarInterval[] = [BarInterval.Daily, BarInterval.Hourly, BarInterval.FiveMinute];

function cacheKey(symbol: string, interval: BarInterval): string {
  return `${REDIS_KEYS.bars}:${symbol.toUpperCase()}:${interval}`;
}

function isFresh(series: BarSeries): boolean {
  const ageMs = Date.now() - series.fetchedAt;
  return ageMs < BAR_CACHE_TTL_SECONDS[series.interval] * 1000;
}

/** Emitted once per resolved interval so a caller can report progress. */
export interface BarFetchEvent {
  symbol: string;
  interval: BarInterval;
  /** True when the cache answered and no request left the process */
  cached: boolean;
  bars: number;
  ms: number;
  ok: boolean;
}

export type BarFetchListener = (event: BarFetchEvent) => void;

export class BarCollector {
  /**
   * `onFetch` is optional observation only. It is invoked inside a try/catch so
   * a misbehaving listener cannot take down a data fetch.
   */
  constructor(
    private redis: Redis,
    private onFetch?: BarFetchListener
  ) {}

  /**
   * Fetch one interval for a symbol, preferring a fresh cache.
   *
   * On a failed refresh the stale cache is returned rather than nothing — a
   * slightly old series still produces a usable backtest, whereas a null drops
   * the asset out of the report entirely.
   */
  async fetchSeries(symbol: string, interval: BarInterval): Promise<BarSeries | null> {
    const startedAt = Date.now();
    const emit = (series: BarSeries | null, cached: boolean) => {
      this.emit({
        symbol,
        interval,
        cached,
        bars: series?.bars.length ?? 0,
        ms: Date.now() - startedAt,
        ok: series !== null,
      });
    };

    const cached = await this.readCache(symbol, interval);

    if (cached && isFresh(cached)) {
      const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60_000);
      log.info(`${symbol} ${interval}: cached (${cached.bars.length} bars, ${ageMin}m old)`);
      emit(cached, true);
      return cached;
    }

    const bars = await fetchChart(symbol, interval, this.redis);

    if (!bars || bars.length === 0) {
      if (cached) {
        log.warn(`${symbol} ${interval}: fetch failed, using stale cache`);
        emit(cached, true);
        return cached;
      }
      emit(null, false);
      return null;
    }

    const series: BarSeries = { symbol, interval, bars, fetchedAt: Date.now() };
    await this.writeCache(series);
    emit(series, false);
    return series;
  }

  private emit(event: BarFetchEvent): void {
    try {
      this.onFetch?.(event);
    } catch (err) {
      log.warn(`fetch listener threw (ignored): ${err}`);
    }
  }

  /** Fetch every interval for one symbol, spaced out to stay under rate limits. */
  async fetchSymbol(symbol: string): Promise<SymbolBars> {
    const series: Partial<Record<BarInterval, BarSeries | null>> = {};

    for (const [i, interval] of INTERVALS.entries()) {
      if (i > 0) await wait(YAHOO_CALL_DELAY_MS);
      series[interval] = await this.fetchSeries(symbol, interval);
    }

    return {
      symbol,
      daily: series[BarInterval.Daily] ?? null,
      hourly: series[BarInterval.Hourly] ?? null,
      intraday5m: series[BarInterval.FiveMinute] ?? null,
    };
  }

  /** Fetch the whole universe sequentially. */
  async fetchUniverse(symbols: string[]): Promise<Map<string, SymbolBars>> {
    const out = new Map<string, SymbolBars>();

    for (const symbol of symbols) {
      const bars = await this.fetchSymbol(symbol);
      out.set(symbol, bars);
      log.info(
        `${symbol}: ${bars.daily?.bars.length ?? 0}d / ${bars.hourly?.bars.length ?? 0}h / ` +
          `${bars.intraday5m?.bars.length ?? 0}×5m bars`
      );
      await wait(YAHOO_CALL_DELAY_MS);
    }

    return out;
  }

  private async readCache(symbol: string, interval: BarInterval): Promise<BarSeries | null> {
    try {
      const raw = await this.redis.get(cacheKey(symbol, interval));
      return raw ? unpackSeries(JSON.parse(raw) as PackedBarSeries) : null;
    } catch (err) {
      log.warn(`cache read failed for ${symbol} ${interval}: ${err}`);
      return null;
    }
  }

  private async writeCache(series: BarSeries): Promise<void> {
    try {
      await this.redis.set(
        cacheKey(series.symbol, series.interval),
        JSON.stringify(packSeries(series)),
        'EX',
        BAR_CACHE_TTL_SECONDS[series.interval]
      );
    } catch (err) {
      log.warn(`cache write failed for ${series.symbol} ${series.interval}: ${err}`);
    }
  }
}

export { packSeries, unpackSeries } from './pack';
export { parseChart } from './chart';
