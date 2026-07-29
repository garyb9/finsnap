import { STRATEGIES } from '../../../backtest/strategies';
import { DAILY_WINDOWS, INTRADAY_WINDOWS } from '../../../constants';
import { buildLeaderboard } from '../../../report/leaderboard';
import type { RouteRegistrar } from '../types';

/** Introspection: what rules exist, over what windows, on what universe. */
export const registerStrategyRoutes: RouteRegistrar = (app, { config, reportStore }) => {
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

  /**
   * Which rule actually has an edge, pooled across the whole universe rather
   * than read one asset at a time. Built from the latest report rather than a
   * fresh backtest — it is a reduction of numbers already computed.
   */
  app.get('/strategies/leaderboard', async (c) => {
    const report = await reportStore.getLatest();
    if (!report) return c.json({ error: 'No report generated yet' }, 404);
    return c.json(buildLeaderboard(report));
  });
};
