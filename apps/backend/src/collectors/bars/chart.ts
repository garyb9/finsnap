import { createLogger } from '../../logger';
import { backoffMs, wait } from '../../lib/async';
import {
  RANGE_BY_INTERVAL,
  YAHOO_CHART_BASE,
  YAHOO_MAX_RETRIES,
  YAHOO_RATE_LIMIT_BACKOFF_MS,
} from '../../constants';
import { getYahooSession, withSession } from '../yahooSession';
import { BarInterval, type Bar } from '../types';

const log = createLogger('bars:chart');

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    longName?: string;
    shortName?: string;
    /** Interval Yahoo actually served, which is not always the one requested */
    dataGranularity?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
    adjclose?: { adjclose?: (number | null)[] }[];
  };
}

/**
 * Collapse repeated trailing timestamps.
 *
 * Yahoo occasionally repeats the in-progress candle; the later copy is the
 * fresher one, so it replaces its predecessor rather than being appended.
 */
function dedupeByTime(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const bar of bars) {
    const prev = out[out.length - 1];
    if (prev && prev.time === bar.time) {
      out[out.length - 1] = bar;
      continue;
    }
    out.push(bar);
  }
  return out;
}

/**
 * Convert a Yahoo chart payload into clean bars.
 *
 * Rows with a null close are dropped rather than interpolated — a synthetic bar
 * would silently become a tradeable price in the backtest. OHLC is rescaled by
 * the adjusted-close ratio so splits and dividends don't register as overnight
 * gaps in long-horizon equity backtests.
 */
export function parseChart(symbol: string, interval: BarInterval, result: YahooChartResult): Bar[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose;

  if (timestamps.length === 0 || !quote?.close) return [];

  const bars: Bar[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];

    if (close == null || open == null || high == null || low == null) continue;
    if (!Number.isFinite(close) || close <= 0) continue;

    const adj = adjClose?.[i];
    const ratio = adj != null && Number.isFinite(adj) ? adj / close : 1;

    bars.push({
      time: timestamps[i] * 1000,
      open: open * ratio,
      high: high * ratio,
      low: low * ratio,
      close: close * ratio,
      volume: quote.volume?.[i] ?? 0,
    });
  }

  const deduped = dedupeByTime(bars);

  // Loudly flag a granularity substitution rather than silently annualizing
  // monthly candles as if they were daily.
  const served = result.meta?.dataGranularity;
  if (served && served !== interval) {
    log.warn(
      `${symbol}: requested ${interval} but Yahoo served ${served} — ` +
        `${deduped.length} bars; annualized stats will be inferred from timestamps`
    );
  }

  log.info(`${symbol} ${interval}: parsed ${deduped.length} bars`);
  return deduped;
}

/**
 * `sinceMs`, when given, requests an explicit `period1`/`period2` span (the
 * incremental-fetch path). Without it, daily bars use `period1=0` rather than
 * `range=max` — Yahoo silently *downgrades granularity* for `range=max`,
 * answering a 1d request with monthly candles. Intraday intervals have no
 * such problem and use `range`.
 */
function buildChartUrl(symbol: string, interval: BarInterval, sinceMs?: number): string {
  const base = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}`;
  const common = `interval=${interval}&includeAdjustedClose=true`;
  const nowSec = Math.floor(Date.now() / 1000);

  if (sinceMs != null) {
    return `${base}?period1=${Math.floor(sinceMs / 1000)}&period2=${nowSec}&${common}`;
  }

  if (interval === BarInterval.Daily) {
    return `${base}?period1=0&period2=${nowSec}&${common}`;
  }

  return `${base}?range=${RANGE_BY_INTERVAL[interval]}&${common}`;
}

/** Fetch one interval of OHLCV from Yahoo, retrying through rate limits. */
export async function fetchChart(
  symbol: string,
  interval: BarInterval,
  sinceMs?: number
): Promise<Bar[] | null> {
  const session = await getYahooSession();
  const { url, headers } = withSession(buildChartUrl(symbol, interval, sinceMs), session);

  for (let attempt = 0; attempt <= YAHOO_MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (err) {
      log.warn(`network error fetching ${symbol} ${interval}: ${err}`);
      return null;
    }

    if (response.ok) {
      const json = (await response.json()) as {
        chart?: { result?: YahooChartResult[]; error?: { description?: string } };
      };
      const result = json?.chart?.result?.[0];

      if (!result) {
        const reason = json?.chart?.error?.description;
        log.warn(`${symbol} ${interval}: empty chart result${reason ? ` — ${reason}` : ''}`);
        return null;
      }

      return parseChart(symbol, interval, result);
    }

    if (response.status === 429 && attempt < YAHOO_MAX_RETRIES) {
      const delay = backoffMs(YAHOO_RATE_LIMIT_BACKOFF_MS, attempt);
      log.warn(`rate limited on ${symbol} ${interval}, retrying in ${delay / 1000}s...`);
      await wait(delay);
      continue;
    }

    log.warn(`chart request failed for ${symbol} ${interval} (HTTP ${response.status})`);
    return null;
  }

  return null;
}
