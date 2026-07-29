/**
 * Shared enumerations.
 *
 * This module imports nothing on purpose — every other module may depend on it
 * without any risk of an import cycle.
 *
 * All members are string-valued, so they serialize to exactly the same JSON as
 * the string literals they replaced. Stored snapshots, cached bars and API
 * consumers are unaffected.
 */

export enum AssetClass {
  Crypto = 'crypto',
  Equity = 'equity',
}

/**
 * What an instrument actually gives you exposure to.
 *
 * `AssetClass` says how it trades — crypto runs 24/7, equities keep market
 * hours — which is what the backtest annualization needs. This says what it is,
 * which is what a reader needs. A sector ETF and a broad index are both
 * equities but are not the same kind of bet.
 */
export enum AssetCategory {
  Crypto = 'crypto',
  /** Broad equity market index — S&P 500, Nasdaq 100, Dow, Russell 2000 */
  EquityIndex = 'equityIndex',
  /** One slice of the equity market — the GICS sectors */
  Sector = 'sector',
  Commodity = 'commodity',
  Currency = 'currency',
  Bond = 'bond',
  /** A single company, and the fallback for anything unrecognized */
  Stock = 'stock',
}

/** Bar intervals fetched from Yahoo Finance. */
export enum BarInterval {
  FiveMinute = '5m',
  Hourly = '1h',
  Daily = '1d',
}

/** Timeframes reported in the live multi-timeframe view. */
export enum Timeframe {
  M5 = '5M',
  H1 = '1H',
  H4 = '4H',
  D = 'D',
  W = 'W',
  M = 'M',
}

/** What kind of edge a strategy is trying to capture. */
export enum StrategyKind {
  Benchmark = 'benchmark',
  Trend = 'trend',
  MeanReversion = 'meanReversion',
  Breakout = 'breakout',
  Momentum = 'momentum',
}

/** What a strategy is telling you to do on the next bar. */
export enum SignalAction {
  /** Flipped from flat to long — the strategy's own entry */
  Enter = 'enter',
  /** Already long and staying long */
  Hold = 'hold',
  /** Flipped from long to flat */
  Exit = 'exit',
  /** Flat and staying flat */
  StayOut = 'stay_out',
}

/** Edge-weighted verdict for an asset. */
export enum Verdict {
  StrongBuy = 'strong_buy',
  Accumulate = 'accumulate',
  Neutral = 'neutral',
  Reduce = 'reduce',
  Avoid = 'avoid',
}

/** Named lookback windows. */
export enum WindowId {
  Max = 'max',
  Y20 = '20y',
  Y10 = '10y',
  Y5 = '5y',
  Y3 = '3y',
  Y2 = '2y',
  Y1 = '1y',
  M6 = '6mo',
  M3 = '3mo',
  M1 = '1mo',
}

/**
 * How the Telegram bot receives updates.
 *
 * `Polling` needs a process that stays up, so it is the right choice for a
 * container and impossible in a serverless function. `Webhook` is the reverse:
 * Telegram pushes to an HTTP endpoint, which is what a hosted deployment on
 * Vercel or Supabase Edge Functions requires. `Off` disables the bot entirely
 * and is what a missing token falls back to.
 */
export enum TelegramMode {
  Polling = 'polling',
  Webhook = 'webhook',
  Off = 'off',
}

/** Numbers the report puts on screen, each with a glossary entry. */
export enum MetricId {
  EdgeScore = 'edgeScore',
  OpportunityScore = 'opportunityScore',
  Consensus = 'consensus',
  Verdict = 'verdict',
  Breadth = 'breadth',
  Cagr = 'cagr',
  ExcessCagr = 'excessCagr',
  MaxDrawdown = 'maxDrawdown',
  Sharpe = 'sharpe',
  Sortino = 'sortino',
  Calmar = 'calmar',
  WinRate = 'winRate',
  ProfitFactor = 'profitFactor',
  Exposure = 'exposure',
  NumTrades = 'numTrades',
}

/** How options positioning is stacking at an expiry. */
export enum OptionsSkewLabel {
  PutStack = 'put_stack',
  CallStack = 'call_stack',
  SoftPut = 'soft_put',
  SoftCall = 'soft_call',
  Balanced = 'balanced',
  Thin = 'thin',
}

export enum OptionsSide {
  Calls = 'calls',
  Puts = 'puts',
  None = 'none',
}

/** Direction of a moving average or EMA over a short lookback. */
export enum Trajectory {
  Rising = 'rising',
  Falling = 'falling',
  Flat = 'flat',
}

/** Relationship between the fast and slow EMA. */
export enum CrossLabel {
  Bullish = 'bullish crossover',
  Bearish = 'bearish crossover',
  Converging = 'converging',
  Neutral = 'neutral',
}
