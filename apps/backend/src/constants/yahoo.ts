import { BarInterval } from './enums';

export const YAHOO_CHART_BASE = 'https://query2.finance.yahoo.com/v8/finance/chart';
export const YAHOO_OPTIONS_BASE = 'https://query2.finance.yahoo.com/v7/finance/options';
/** Batch quote endpoint — the whole universe in one request. */
export const YAHOO_QUOTE_BASE = 'https://query1.finance.yahoo.com/v7/finance/quote';
export const YAHOO_CRUMB_URL = 'https://query2.finance.yahoo.com/v1/test/getcrumb';
export const YAHOO_COOKIE_URL = 'https://fc.yahoo.com/';

export const YAHOO_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * How far back Yahoo will serve each interval. Daily reaches listing date;
 * intraday is capped, which is why short-horizon backtests use shorter windows.
 */
export const RANGE_BY_INTERVAL: Record<BarInterval, string> = {
  [BarInterval.FiveMinute]: '60d',
  [BarInterval.Hourly]: '730d',
  [BarInterval.Daily]: 'max',
};

export const YAHOO_MAX_RETRIES = 3;
/** Spacing between sequential Yahoo calls, to stay under rate limits. */
export const YAHOO_CALL_DELAY_MS = 250;
export const YAHOO_OPTIONS_CALL_DELAY_MS = 300;
/** First backoff on HTTP 429; doubles per attempt. */
export const YAHOO_RATE_LIMIT_BACKOFF_MS = 2_000;

export const TICKER_DESCRIPTIONS: Record<string, string> = {
  IBIT: 'iShares Bitcoin Trust ETF',
  SPY: 'SPDR S&P 500 ETF Trust',
  GLD: 'SPDR Gold Shares',
  XLE: 'Energy Select Sector SPDR Fund',
  XLI: 'Industrial Select Sector SPDR Fund',
  QQQ: 'Invesco QQQ Trust',
  USO: 'United States Oil Fund',
};
