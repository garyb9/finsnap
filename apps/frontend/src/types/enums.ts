/**
 * Mirrors the backend's `constants/enums.ts`.
 *
 * All members are string-valued and identical to the backend's, so an API
 * payload deserializes straight into these types with no mapping layer.
 */

export enum AssetClass {
  Crypto = 'crypto',
  Equity = 'equity',
}

/** What an instrument gives you exposure to, as opposed to how it trades. */
export enum AssetCategory {
  Crypto = 'crypto',
  EquityIndex = 'equityIndex',
  Sector = 'sector',
  Commodity = 'commodity',
  Currency = 'currency',
  Bond = 'bond',
  Stock = 'stock',
}

/** Which measure of size a figure represents — they are not interchangeable. */
export enum SizeKind {
  MarketCap = 'marketCap',
  NetAssets = 'netAssets',
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

export enum BarInterval {
  FiveMinute = '5m',
  Hourly = '1h',
  Daily = '1d',
}

export enum Timeframe {
  M5 = '5M',
  H1 = '1H',
  H4 = '4H',
  D = 'D',
  W = 'W',
  M = 'M',
  Y = 'Y',
}

export enum StrategyKind {
  Benchmark = 'benchmark',
  Trend = 'trend',
  MeanReversion = 'meanReversion',
  Breakout = 'breakout',
  Momentum = 'momentum',
}

export enum SignalAction {
  Enter = 'enter',
  Hold = 'hold',
  Exit = 'exit',
  StayOut = 'stay_out',
}

export enum Verdict {
  StrongBuy = 'strong_buy',
  Accumulate = 'accumulate',
  Neutral = 'neutral',
  Reduce = 'reduce',
  Avoid = 'avoid',
}

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

export enum Trajectory {
  Rising = 'rising',
  Falling = 'falling',
  Flat = 'flat',
}

export enum CrossLabel {
  Bullish = 'bullish crossover',
  Bearish = 'bearish crossover',
  Converging = 'converging',
  Neutral = 'neutral',
}

/** Feed freshness, shown in the top bar. */
export enum FeedStatus {
  Live = 'LIVE',
  Stale = 'STALE',
  Offline = 'OFFLINE',
}
