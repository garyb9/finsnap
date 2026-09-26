import { createLogger } from '../../logger';
import { wait } from '../../lib/async';
import {
  BAR_RETENTION_DAYS,
  BAR_SYNC_OVERLAP_MS,
  BAR_SYNC_THROTTLE_SECONDS,
  DAY_MS,
  YAHOO_CALL_DELAY_MS,
} from '../../constants';
import type { BarsStore } from '../../storage/barsStore';
import { BarInterval, type Bar, type BarSeries, type SymbolBars } from '../types';
import { fetchChart } from './chart';

const log = createLogger('bars');

/** Order matters: daily first, so a rate-limited run still has backtest data. */
const INTERVALS: BarInterval[] = [BarInterval.Daily, BarInterval.Hourly, BarInterval.FiveMinute];

/** Shared across every `BarCollector` instance — several call sites construct their own. */
const lastCheckedAt = new Map<string, number>();

function throttleKey(symbol: string, interval: BarInterval): string {
  return `${symbol.toUpperCase()}:${interval}`;
}

/** Emitted once per resolved interval so a caller can report progress. */
export interface BarFetchEvent {
  symbol: string;
  interval: BarInterval;
  /** True when no Yahoo request left the process — throttled, or a stale-fallback after a failed fetch */
  cached: boolean;
  bars: number;
  ms: number;
  ok: boolean;
}

export type BarFetchListener = (event: BarFetchEvent) => void;

export class BarCollector {
  constructor(
    private barsStore: BarsStore,
    private onFetch?: BarFetchListener
  ) {}

  /**
   * Fetch one interval for a symbol, asking Yahoo only for what's missing.
   * Within the throttle window, serves straight from Postgres. On a failed
   * refetch, falls back to stored history rather than returning nothing.
   */
  async fetchSeries(
    symbol: string,
    interval: BarInterval,
    opts?: { force?: boolean }
  ): Promise<BarSeries | null> {
    const startedAt = Date.now();
    const emit = (bars: Bar[], cached: boolean, ok: boolean) => {
      this.emit({ symbol, interval, cached, bars: bars.length, ms: Date.now() - startedAt, ok });
    };

    const key = throttleKey(symbol, interval);
    const checkedAt = lastCheckedAt.get(key);
    const throttleMs = BAR_SYNC_THROTTLE_SECONDS[interval] * 1000;

    if (!opts?.force && checkedAt != null && Date.now() - checkedAt < throttleMs) {
      const bars = await this.barsStore.getBars(symbol, interval);
      if (bars.length === 0) {
        emit([], true, false);
        return null;
      }

      log.info(`${symbol} ${interval}: throttled, served from store (${bars.length} bars)`);
      emit(bars, true, true);
      return { symbol, interval, bars, fetchedAt: Date.now() };
    }

    const existing = await this.barsStore.getBars(symbol, interval);
    const since =
      existing.length > 0
        ? existing[existing.length - 1].time - BAR_SYNC_OVERLAP_MS[interval]
        : undefined;

    const newBars = await fetchChart(symbol, interval, since);

    if (!newBars || newBars.length === 0) {
      if (existing.length > 0) {
        log.warn(`${symbol} ${interval}: fetch failed, using stored history`);
        emit(existing, true, true);
        return { symbol, interval, bars: existing, fetchedAt: Date.now() };
      }
      emit([], false, false);
      return null;
    }

    const retentionDays = BAR_RETENTION_DAYS[interval];
    const retentionCutoff = retentionDays != null ? Date.now() - retentionDays * DAY_MS : undefined;

    await this.barsStore.upsertBars(symbol, interval, newBars, retentionCutoff);
    lastCheckedAt.set(key, Date.now());

    const supersededBefore = since ?? -Infinity;
    let bars = [...existing.filter((b) => b.time < supersededBefore), ...newBars];
    if (retentionCutoff != null) bars = bars.filter((b) => b.time >= retentionCutoff);

    log.info(`${symbol} ${interval}: fetched ${newBars.length} new bars (${bars.length} total)`);
    emit(bars, false, true);
    return { symbol, interval, bars, fetchedAt: Date.now() };
  }

  private emit(event: BarFetchEvent): void {
    try {
      this.onFetch?.(event);
    } catch (err) {
      log.warn(`fetch listener threw (ignored): ${err}`);
    }
  }

  /** Fetch every interval for one symbol, spaced out to stay under rate limits. */
  async fetchSymbol(symbol: string, opts?: { force?: boolean }): Promise<SymbolBars> {
    const series: Partial<Record<BarInterval, BarSeries | null>> = {};

    for (const [i, interval] of INTERVALS.entries()) {
      if (i > 0) await wait(YAHOO_CALL_DELAY_MS);
      series[interval] = await this.fetchSeries(symbol, interval, opts);
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
}

export { parseChart } from './chart';
