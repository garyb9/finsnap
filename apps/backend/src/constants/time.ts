import { BarInterval } from './enums';

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const YEAR_DAYS = 365;
export const YEAR_MS = YEAR_DAYS * DAY_MS;

/** Nominal duration of one bar, used to detect a still-forming candle. */
export const INTERVAL_MS: Record<BarInterval, number> = {
  [BarInterval.FiveMinute]: 5 * MINUTE_MS,
  [BarInterval.Hourly]: HOUR_MS,
  [BarInterval.Daily]: DAY_MS,
};

/** Trading periods per year, for annualizing metrics. */
export const PERIODS_PER_YEAR = {
  cryptoDaily: 365,
  equityDaily: 252,
  cryptoHourly: 365 * 24,
  /** Roughly 6.5 hours per session, rounded to whole hourly bars */
  equityHourly: 252 * 7,
  crypto5m: 365 * 24 * 12,
  /** 78 five-minute bars in a 6.5-hour session */
  equity5m: 252 * 78,
} as const;
