import { STRATEGIES } from '../../../backtest/strategies';
import {
  assetInfo,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  DAILY_WINDOWS,
  FAMILY_GUIDE,
  INTRADAY_WINDOWS,
  METHOD_NOTES,
  METRIC_GUIDE,
} from '../../../constants';
import type { AssetCategory } from '../../../constants/enums';
import type { RouteRegistrar } from '../types';

/**
 * Everything needed to explain the report to a reader: what each ticker is,
 * what each strategy family bets on, what each number means, and how the
 * backtest is run.
 *
 * Served as one payload because it is small, static for the lifetime of the
 * process, and always consumed together — the guide page would otherwise make
 * four requests to render one screen.
 */
export const registerGuideRoutes: RouteRegistrar = (app, { config }) => {
  app.get('/guide', (c) => {
    const assets = config.universe.map((spec) => {
      const info = assetInfo(spec.symbol, spec.assetClass);
      return {
        symbol: spec.symbol,
        label: spec.label,
        name: info.name,
        shortName: info.shortName,
        category: spec.category,
        assetClass: spec.assetClass,
        blurb: info.blurb,
        caveat: info.caveat,
        hasOptions: spec.hasOptions,
      };
    });

    // Grouped server-side so every consumer orders categories identically.
    const byCategory = CATEGORY_ORDER.map((category: AssetCategory) => ({
      category,
      label: CATEGORY_LABEL[category],
      symbols: assets.filter((a) => a.category === category).map((a) => a.symbol),
    })).filter((group) => group.symbols.length > 0);

    return c.json({
      assets,
      assetGroups: byCategory,
      families: Object.entries(FAMILY_GUIDE).map(([kind, guide]) => ({ kind, ...guide })),
      strategies: STRATEGIES.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        description: s.description,
        params: s.params,
        warmup: s.warmup,
      })),
      metrics: METRIC_GUIDE,
      method: METHOD_NOTES,
      windows: { daily: DAILY_WINDOWS, intraday: INTRADAY_WINDOWS },
      execution: {
        initialCapital: config.backtestCapital,
        feeBps: config.backtestFeeBps,
        slippageBps: config.backtestSlippageBps,
      },
    });
  });
};
