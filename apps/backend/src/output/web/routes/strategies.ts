import { STRATEGIES } from '../../../backtest/strategies';
import { DAILY_WINDOWS, INTRADAY_WINDOWS } from '../../../constants';
import type { RouteRegistrar } from '../types';

/** Introspection: what rules exist, over what windows, on what universe. */
export const registerStrategyRoutes: RouteRegistrar = (app, { config }) => {
  app.get('/strategies', (c) =>
    c.json({
      count: STRATEGIES.length,
      strategies: STRATEGIES.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        description: s.description,
        params: s.params,
        warmup: s.warmup,
      })),
      windows: { daily: DAILY_WINDOWS, intraday: INTRADAY_WINDOWS },
      universe: config.universe,
      execution: {
        initialCapital: config.backtestCapital,
        feeBps: config.backtestFeeBps,
        slippageBps: config.backtestSlippageBps,
      },
    })
  );
};
