/**
 * Reference data for the tradeable universe.
 *
 * Every symbol FinSnap watches gets a plain-English entry here: what the ticker
 * actually is, what it gives you exposure to, and — where it matters — why the
 * price may not do what the name suggests. The backtest is only as honest as
 * the reader's understanding of the instrument, so a caveat like "USO holds
 * futures, not oil" belongs next to the numbers rather than in a footnote.
 *
 * Unknown symbols still work; `assetInfo` synthesizes a neutral entry so adding
 * a ticker to the env var never breaks the report. Filling in a real entry is a
 * separate, optional improvement.
 */

import { AssetCategory, AssetClass } from './enums';

export interface AssetInfo {
  /** Full instrument name — 'SPDR S&P 500 ETF Trust' */
  name: string;
  /** The handle a person would actually use — 'S&P 500', 'Gold', 'Materials' */
  shortName: string;
  category: AssetCategory;
  /** One sentence: what you own and what moves it */
  blurb: string;
  /**
   * Something non-obvious that changes how the backtest should be read.
   * Present only where it genuinely matters — most tickers have none.
   */
  caveat?: string;
}

export const ASSET_INFO: Record<string, AssetInfo> = {
  // ── Crypto ────────────────────────────────────────────────────────────────
  'BTC-USD': {
    name: 'Bitcoin',
    shortName: 'Bitcoin',
    category: AssetCategory.Crypto,
    blurb:
      'The original cryptocurrency, quoted against the dollar. Trades every day of the year, ' +
      'so it has roughly 45% more bars per year than a stock and no overnight gaps.',
  },
  IBIT: {
    name: 'iShares Bitcoin Trust ETF',
    shortName: 'Bitcoin ETF',
    category: AssetCategory.Crypto,
    blurb:
      'Spot bitcoin held in a fund you can buy from a normal brokerage account. Tracks BTC ' +
      'closely but only trades during US market hours.',
    caveat:
      'Launched January 2024, so its history is short. Long windows fall back to what exists ' +
      'and the deeper backtests simply do not run.',
  },

  // ── Broad equity indices ──────────────────────────────────────────────────
  SPY: {
    name: 'SPDR S&P 500 ETF Trust',
    shortName: 'S&P 500',
    category: AssetCategory.EquityIndex,
    blurb:
      'The 500 largest US companies, weighted by market value. This is what people mean by ' +
      '"the market", and the yardstick every other equity bet is judged against.',
  },
  QQQ: {
    name: 'Invesco QQQ Trust',
    shortName: 'Nasdaq 100',
    category: AssetCategory.EquityIndex,
    blurb:
      'The 100 largest non-financial companies on the Nasdaq. Far more concentrated in big ' +
      'technology than the S&P, so it runs harder in both directions.',
  },
  DIA: {
    name: 'SPDR Dow Jones Industrial Average ETF',
    shortName: 'Dow 30',
    category: AssetCategory.EquityIndex,
    blurb:
      'Thirty US blue chips. Weighted by share price rather than company size, which is an ' +
      'accident of history — a $500 stock sways it more than a $2 trillion one.',
  },
  IWM: {
    name: 'iShares Russell 2000 ETF',
    shortName: 'Russell 2000',
    category: AssetCategory.EquityIndex,
    blurb:
      'Two thousand small US companies. More exposed to the domestic economy and to credit ' +
      'conditions than the large-cap indices, and noticeably more volatile.',
  },
  EEM: {
    name: 'iShares MSCI Emerging Markets ETF',
    shortName: 'Emerging Markets',
    category: AssetCategory.EquityIndex,
    blurb:
      'Large and mid-cap companies across emerging economies, heavily weighted toward China, ' +
      'Taiwan and India. The first place US-only breadth gets tested against something ' +
      'outside the S&P.',
  },
  EFA: {
    name: 'iShares MSCI EAFE ETF',
    shortName: 'Developed ex-US',
    category: AssetCategory.EquityIndex,
    blurb:
      'Developed markets outside North America — Japan, the UK and Western Europe. The ' +
      'developed-market counterpart to EEM, without the currency and political risk that ' +
      'comes with emerging markets.',
  },

  // ── Sectors (the S&P 500 sliced into the eleven GICS sectors) ─────────────
  XLK: {
    name: 'Technology Select Sector SPDR',
    shortName: 'Technology',
    category: AssetCategory.Sector,
    blurb:
      'Software, hardware and semiconductors inside the S&P 500. The biggest sector by weight ' +
      'and the main engine of index-level moves.',
  },
  XLF: {
    name: 'Financial Select Sector SPDR',
    shortName: 'Financials',
    category: AssetCategory.Sector,
    blurb:
      'Banks, insurers, exchanges and asset managers. Sensitive to interest rates and to the ' +
      'gap between short and long yields.',
  },
  XLE: {
    name: 'Energy Select Sector SPDR',
    shortName: 'Energy',
    category: AssetCategory.Sector,
    blurb:
      'Oil and gas producers, refiners and services. Follows crude, but as equity — with ' +
      'balance sheets, dividends and a lag.',
  },
  XLV: {
    name: 'Health Care Select Sector SPDR',
    shortName: 'Health Care',
    category: AssetCategory.Sector,
    blurb:
      'Pharmaceuticals, biotech, insurers and device makers. Defensive in downturns, exposed ' +
      'to policy risk in a way the other sectors are not.',
  },
  XLI: {
    name: 'Industrial Select Sector SPDR',
    shortName: 'Industrials',
    category: AssetCategory.Sector,
    blurb:
      'Aerospace, machinery, railroads and freight. The most direct read on whether physical ' +
      'economic activity is expanding.',
  },
  XLY: {
    name: 'Consumer Discretionary Select Sector SPDR',
    shortName: 'Discretionary',
    category: AssetCategory.Sector,
    blurb:
      'Retail, autos, restaurants and travel — what people buy when they feel comfortable. ' +
      'Its ratio to staples is a classic risk-appetite gauge.',
  },
  XLP: {
    name: 'Consumer Staples Select Sector SPDR',
    shortName: 'Staples',
    category: AssetCategory.Sector,
    blurb:
      'Food, drinks, tobacco and household goods. Demand barely moves with the cycle, so this ' +
      'is where money hides during a drawdown.',
  },
  XLU: {
    name: 'Utilities Select Sector SPDR',
    shortName: 'Utilities',
    category: AssetCategory.Sector,
    blurb:
      'Regulated power and water. Steady cash flows and high dividends make it trade more like ' +
      'a bond than like a stock.',
  },
  XLB: {
    name: 'Materials Select Sector SPDR',
    shortName: 'Materials',
    category: AssetCategory.Sector,
    blurb:
      'Chemicals, metals, mining and packaging. An early-cycle sector that turns on commodity ' +
      'prices and global demand.',
  },
  XLRE: {
    name: 'Real Estate Select Sector SPDR',
    shortName: 'Real Estate',
    category: AssetCategory.Sector,
    blurb:
      'Listed property trusts — offices, warehouses, data centres, towers. Highly geared to ' +
      'the cost of borrowing.',
    caveat: 'Split out of financials in 2015, so it has less history than the other sectors.',
  },
  XLC: {
    name: 'Communication Services Select Sector SPDR',
    shortName: 'Communications',
    category: AssetCategory.Sector,
    blurb:
      'Telecom, media and the large internet platforms. Despite the name it behaves mostly ' +
      'like technology, because a handful of ad-funded giants dominate it.',
    caveat: 'Created in 2018 when the sector was redefined; history before then does not exist.',
  },

  // ── Industry (narrower than a GICS sector — one slice worth watching on its
  // own rather than folded into the parent sector's average) ────────────────
  SMH: {
    name: 'VanEck Semiconductor ETF',
    shortName: 'Semiconductors',
    category: AssetCategory.Industry,
    blurb:
      'The chipmakers and equipment suppliers buried inside XLK and QQQ, isolated. A handful ' +
      'of names dominate the weighting, so it runs harder in both directions than Technology ' +
      'as a whole.',
  },
  XPH: {
    name: 'SPDR S&P Pharmaceuticals ETF',
    shortName: 'Pharmaceuticals',
    category: AssetCategory.Industry,
    blurb:
      'Drug makers pulled out of Health Care (XLV) and equal-weighted rather than weighted by ' +
      'size, so no single mega-cap dominates the return the way it can in XLV.',
  },

  // ── Commodities ───────────────────────────────────────────────────────────
  GLD: {
    name: 'SPDR Gold Shares',
    shortName: 'Gold',
    category: AssetCategory.Commodity,
    blurb:
      'Physical gold bullion in a vault. Moves against real interest rates and the dollar, and ' +
      'holds up when confidence in either does not.',
  },
  SLV: {
    name: 'iShares Silver Trust',
    shortName: 'Silver',
    category: AssetCategory.Commodity,
    blurb:
      'Physical silver. Half precious metal and half industrial input, which makes it both ' +
      'higher-beta than gold and less reliable as a hedge.',
  },
  USO: {
    name: 'United States Oil Fund',
    shortName: 'WTI Crude',
    category: AssetCategory.Commodity,
    blurb: 'WTI crude oil exposure via near-month futures contracts.',
    caveat:
      'It holds futures, not oil, and rolls them forward every month. When later contracts ' +
      'cost more than nearer ones the fund bleeds value on each roll, so multi-year returns ' +
      'can be far worse than the move in spot crude. Judge the backtest on shorter windows.',
  },
  UNG: {
    name: 'United States Natural Gas Fund',
    shortName: 'Natural Gas',
    category: AssetCategory.Commodity,
    blurb: 'Henry Hub natural gas exposure via near-month futures contracts.',
    caveat:
      'The same futures-roll drag as USO, only far more severe — natural gas is seasonal and ' +
      'persistently in contango. Long-window returns here are dominated by roll cost, not by ' +
      'the price of gas.',
  },

  // ── Currency ──────────────────────────────────────────────────────────────
  UUP: {
    name: 'Invesco DB US Dollar Index Bullish Fund',
    shortName: 'US Dollar',
    category: AssetCategory.Currency,
    blurb:
      'Long the dollar against a basket of six major currencies — the DXY. A rising line here ' +
      'is usually a headwind for commodities and for foreign earnings.',
  },
  FXE: {
    name: 'Invesco CurrencyShares Euro Trust',
    shortName: 'Euro',
    category: AssetCategory.Currency,
    blurb:
      'Holds euros in a bank account and tracks EUR/USD. The largest weight in the dollar ' +
      "index, so it moves as UUP's mirror image more often than not.",
  },
  FXY: {
    name: 'Invesco CurrencyShares Japanese Yen Trust',
    shortName: 'Japanese Yen',
    category: AssetCategory.Currency,
    blurb:
      'Holds yen and tracks JPY/USD. Doubles as a risk-off signal: the yen is a funding ' +
      'currency for carry trades, so it tends to jump when equity markets sell off hard.',
  },

  // ── Bonds ─────────────────────────────────────────────────────────────────
  TLT: {
    name: 'iShares 20+ Year Treasury Bond ETF',
    shortName: '20Y+ Treasuries',
    category: AssetCategory.Bond,
    blurb:
      'Long-dated US government debt. The cleanest expression of interest-rate direction: ' +
      'yields up, price down, and with twenty-year maturities the swing is large.',
  },
  LQD: {
    name: 'iShares iBoxx Investment Grade Corporate Bond ETF',
    shortName: 'Investment Grade Credit',
    category: AssetCategory.Bond,
    blurb:
      'Investment-grade corporate debt. Moves with rates the way TLT does, but with a credit ' +
      'spread layered on top — the gap between LQD and HYG is a clean read on how nervous ' +
      'credit markets are.',
  },
  HYG: {
    name: 'iShares iBoxx High Yield Corporate Bond ETF',
    shortName: 'High Yield Credit',
    category: AssetCategory.Bond,
    blurb:
      'Sub-investment-grade ("junk") corporate debt. Trades more like an equity risk-appetite ' +
      'gauge than a rate instrument — spreads widen fast when credit gets nervous, often ' +
      'ahead of stocks.',
  },

  // ── Volatility ────────────────────────────────────────────────────────────
  VXX: {
    name: 'iPath Series B S&P 500 VIX Short-Term Futures ETN',
    shortName: 'VIX Futures',
    category: AssetCategory.Volatility,
    blurb:
      "Tracks short-term VIX futures — the market's implied-volatility gauge. Spikes when " +
      'equities sell off hard, the closest thing the universe has to a fear gauge.',
    caveat:
      'The futures curve is usually in contango, so this structurally bleeds value over time. ' +
      'It is a hedge or a trading vehicle, never a buy-and-hold position — long-window ' +
      'backtests will show relentless decay that has nothing to do with market direction.',
  },
};

/** Category assumed for a symbol with no entry, based on how it trades. */
const FALLBACK_CATEGORY: Record<AssetClass, AssetCategory> = {
  [AssetClass.Crypto]: AssetCategory.Crypto,
  [AssetClass.Equity]: AssetCategory.Stock,
};

/**
 * Reference data for a symbol, synthesizing a neutral entry when the symbol is
 * not in the table. Adding a ticker to the env var should widen the report, not
 * break it.
 */
export function assetInfo(symbol: string, assetClass: AssetClass): AssetInfo {
  return (
    ASSET_INFO[symbol] ?? {
      name: symbol,
      shortName: symbol,
      category: FALLBACK_CATEGORY[assetClass],
      blurb: '',
    }
  );
}

/** Display order for grouped listings — broadest context first. */
export const CATEGORY_ORDER: AssetCategory[] = [
  AssetCategory.EquityIndex,
  AssetCategory.Sector,
  AssetCategory.Industry,
  AssetCategory.Crypto,
  AssetCategory.Commodity,
  AssetCategory.Currency,
  AssetCategory.Bond,
  AssetCategory.Volatility,
  AssetCategory.Stock,
];

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  [AssetCategory.EquityIndex]: 'Market indices',
  [AssetCategory.Sector]: 'Sectors',
  [AssetCategory.Industry]: 'Industries',
  [AssetCategory.Crypto]: 'Crypto',
  [AssetCategory.Commodity]: 'Commodities',
  [AssetCategory.Currency]: 'Currency',
  [AssetCategory.Bond]: 'Bonds',
  [AssetCategory.Volatility]: 'Volatility',
  [AssetCategory.Stock]: 'Single stocks',
};
