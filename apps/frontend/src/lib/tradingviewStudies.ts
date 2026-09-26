/**
 * Maps a backend strategy id to the TradingView built-in study/studies that
 * best represent what it trades on, for overlaying on the chart page.
 *
 * TradingView's public embed only recognizes a specific set of `@tv-basicstudies`
 * ids — most guesses (Supertrend, Donchian Channels, plain "Momentum") are
 * silently ignored. Verified working by hand against a live widget: RSI, BB,
 * MACD, MAExp, MASimple, ATR, ROC, Stochastic. The embed also appears to cap
 * out around 5 simultaneous studies on one chart — extras past that are
 * dropped without an error — hence `MAX_STUDIES` and the slice in `mergeStudies`.
 *
 * Where the strategy's own parameters don't match TradingView's stock
 * defaults (a 12/26/9 MACD does; a 252-bar ROC does not), `note` says so
 * rather than implying the chart is drawing the exact same line the backtest
 * traded on.
 */

export const MAX_STUDIES = 5;

export interface StudyMapping {
  studies: string[];
  /** What's shown and how it relates to the strategy's actual rule. */
  note: string;
}

const RSI = 'RSI@tv-basicstudies';
const BB = 'BB@tv-basicstudies';
const MACD = 'MACD@tv-basicstudies';
const EMA = 'MAExp@tv-basicstudies';
const SMA = 'MASimple@tv-basicstudies';
const ATR = 'ATR@tv-basicstudies';
const ROC = 'ROC@tv-basicstudies';

const STUDY_MAP: Record<string, StudyMapping> = {
  sma_cross_50_200: {
    studies: [SMA],
    note: 'Shown as one SMA at TradingView’s default length — the rule itself compares a 50-bar and a 200-bar SMA.',
  },
  sma_cross_20_100: {
    studies: [SMA],
    note: 'Shown as one SMA at TradingView’s default length — the rule itself compares a 20-bar and a 100-bar SMA.',
  },
  ema_cross_12_26: {
    studies: [EMA],
    note: 'Shown as one EMA at TradingView’s default length — the rule itself compares a 12-bar and a 26-bar EMA.',
  },
  ema_cross_20_50: {
    studies: [EMA],
    note: 'Shown as one EMA at TradingView’s default length — the rule itself compares a 20-bar and a 50-bar EMA.',
  },
  price_above_sma_200: {
    studies: [SMA],
    note: 'TradingView’s chart uses its own default SMA length; the rule itself tracks price against a 200-bar SMA.',
  },
  price_above_sma_50: {
    studies: [SMA],
    note: 'TradingView’s chart uses its own default SMA length; the rule itself tracks price against a 50-bar SMA.',
  },
  macd_12_26_9: {
    studies: [MACD],
    note: 'Matches the strategy’s own 12/26/9 settings exactly.',
  },
  supertrend_10_3: {
    studies: [ATR],
    note: 'Supertrend itself isn’t available on this chart — showing the ATR(14) it’s built from instead.',
  },
  abs_momentum_252: {
    studies: [ROC],
    note: 'TradingView’s chart shows a 9-bar Rate of Change; the rule itself looks back 252 bars (roughly a year).',
  },
  abs_momentum_90: {
    studies: [ROC],
    note: 'TradingView’s chart shows a 9-bar Rate of Change; the rule itself looks back 90 bars.',
  },
  rsi_trend_14_50: {
    studies: [RSI],
    note: 'Matches the strategy’s own RSI(14) — long while it holds above 50.',
  },
  tsmom_55: {
    studies: [BB, EMA],
    note: 'TSMOM blends EMA structure, momentum and Bollinger position into one score — Bollinger Bands and EMA are two of its three inputs, shown here; the momentum term isn’t.',
  },
  tsmom_50: {
    studies: [BB, EMA],
    note: 'TSMOM blends EMA structure, momentum and Bollinger position into one score — Bollinger Bands and EMA are two of its three inputs, shown here; the momentum term isn’t.',
  },
  donchian_20_10: {
    studies: [],
    note: 'Donchian channels aren’t available as a chart overlay here — showing price only.',
  },
  donchian_55_20: {
    studies: [],
    note: 'Donchian channels aren’t available as a chart overlay here — showing price only.',
  },
  chandelier_20_14_3: {
    studies: [ATR],
    note: 'The trailing stop is built from ATR(14), shown here — the channel and stop logic on top of it aren’t.',
  },
  bb_breakout_20_2: {
    studies: [BB],
    note: 'Matches the strategy’s own Bollinger(20, 2σ) settings exactly.',
  },
  rsi_reversion_14_30_70: {
    studies: [RSI],
    note: 'Matches the strategy’s own RSI(14) — buys below 30, sells above 70.',
  },
  rsi_reversion_2_10_60: {
    studies: [RSI],
    note: 'TradingView’s chart shows RSI(14); the strategy itself trades a much faster RSI(2).',
  },
  bb_reversion_20_2: {
    studies: [BB],
    note: 'Matches the strategy’s own Bollinger(20, 2σ) settings exactly.',
  },
  bb_reversion_20_3: {
    studies: [BB],
    note: 'TradingView’s chart shows the standard 2σ bands; the strategy itself trades 3σ bands.',
  },
  zscore_reversion_20_2_0: {
    studies: [],
    note: 'Z-score has no chart overlay here — showing price only.',
  },
};

export function studiesFor(strategyId: string): StudyMapping | null {
  return STUDY_MAP[strategyId] ?? null;
}

/** Deduped union of one or two strategies' studies, capped at what the widget will actually draw. */
export function mergeStudies(...mappings: (StudyMapping | null)[]): string[] {
  const all = mappings.flatMap((m) => m?.studies ?? []);
  return Array.from(new Set(all)).slice(0, MAX_STUDIES);
}
