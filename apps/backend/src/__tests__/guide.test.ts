import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ASSET_INFO,
  assetInfo,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  FAMILY_GUIDE,
  METHOD_NOTES,
  METRIC_GUIDE,
} from '../constants';
import { AssetCategory, AssetClass, MetricId, StrategyKind } from '../constants/enums';
import { STRATEGIES } from '../backtest/strategies';
import { loadConfig } from '../config';

describe('asset reference data', () => {
  it('gives every entry a name, a short name and a blurb', () => {
    for (const [symbol, info] of Object.entries(ASSET_INFO)) {
      expect(info.name, symbol).toBeTruthy();
      expect(info.shortName, symbol).toBeTruthy();
      expect(info.blurb.length, symbol).toBeGreaterThan(40);
    }
  });

  it('flags the futures-backed funds, whose price does not track the commodity', () => {
    // USO and UNG roll monthly contracts, so multi-year backtests on them are
    // measuring roll cost as much as the price of oil or gas. Losing that
    // caveat would make the deep windows quietly misleading.
    expect(ASSET_INFO.USO.caveat).toMatch(/roll/i);
    expect(ASSET_INFO.UNG.caveat).toMatch(/roll/i);
  });

  it('synthesizes an entry for an unknown symbol rather than throwing', () => {
    const info = assetInfo('NVDA', AssetClass.Equity);

    expect(info.name).toBe('NVDA');
    expect(info.category).toBe(AssetCategory.Stock);
    expect(info.blurb).toBe('');
  });

  it('falls back to the crypto category for an unknown crypto symbol', () => {
    expect(assetInfo('DOGE-USD', AssetClass.Crypto).category).toBe(AssetCategory.Crypto);
  });

  it('orders and labels every category', () => {
    const all = Object.values(AssetCategory);

    expect(new Set(CATEGORY_ORDER)).toEqual(new Set(all));
    expect(CATEGORY_ORDER).toHaveLength(all.length);
    for (const category of all) expect(CATEGORY_LABEL[category]).toBeTruthy();
  });

  it('covers all eleven sectors, so breadth is not a statement about the sample', () => {
    const sectors = Object.values(ASSET_INFO).filter((i) => i.category === AssetCategory.Sector);
    expect(sectors).toHaveLength(11);
  });
});

describe('default universe', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHANNEL_ID = 'test-channel';
    delete process.env.CRYPTO_SYMBOLS;
    delete process.env.EQUITY_SYMBOLS;
    delete process.env.WATCHED_TICKERS;
    delete process.env.OPTIONS_SYMBOLS;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('describes every symbol it ships with', () => {
    // The failure this guards against is adding a ticker to the default list
    // and shipping it to the guide page with no explanation next to it.
    const undescribed = loadConfig()
      .universe.filter((spec) => !ASSET_INFO[spec.symbol])
      .map((spec) => spec.symbol);

    expect(undescribed).toEqual([]);
  });

  it('carries the reference data through onto each spec', () => {
    const spy = loadConfig().universe.find((s) => s.symbol === 'SPY');

    expect(spy?.shortName).toBe('S&P 500');
    expect(spy?.category).toBe(AssetCategory.EquityIndex);
  });

  it('only requests option chains for symbols in the universe', () => {
    const config = loadConfig();
    const symbols = new Set(config.universe.map((s) => s.symbol));

    for (const symbol of config.optionsList) expect(symbols.has(symbol)).toBe(true);
  });
});

describe('strategy families', () => {
  it('explains every kind a strategy can declare', () => {
    for (const strategy of STRATEGIES) {
      expect(FAMILY_GUIDE[strategy.kind], strategy.id).toBeDefined();
    }
  });

  it('gives each family a premise and both failure modes', () => {
    for (const kind of Object.values(StrategyKind)) {
      const guide = FAMILY_GUIDE[kind];
      expect(guide.label, kind).toBeTruthy();
      expect(guide.premise.length, kind).toBeGreaterThan(40);
      expect(guide.worksWhen.length, kind).toBeGreaterThan(40);
      expect(guide.failsWhen.length, kind).toBeGreaterThan(40);
    }
  });

  it('describes every strategy in the registry', () => {
    for (const strategy of STRATEGIES) {
      expect(strategy.description.length, strategy.id).toBeGreaterThan(20);
    }
  });
});

describe('metric glossary', () => {
  it('covers every metric id exactly once', () => {
    const ids = METRIC_GUIDE.map((m) => m.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(Object.values(MetricId)));
  });

  it('gives each metric a one-liner, a detail and a reading', () => {
    for (const metric of METRIC_GUIDE) {
      expect(metric.label, metric.id).toBeTruthy();
      expect(metric.short.length, metric.id).toBeGreaterThan(20);
      expect(metric.detail.length, metric.id).toBeGreaterThan(80);
      expect(metric.reading.length, metric.id).toBeGreaterThan(30);
    }
  });

  it('documents the execution assumptions that keep the backtest honest', () => {
    const titles = METHOD_NOTES.map((n) => n.title.toLowerCase()).join(' | ');

    expect(titles).toMatch(/next open/);
    expect(titles).toMatch(/fee|slippage/);
    expect(titles).toMatch(/warm up/);
  });
});
