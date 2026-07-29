import { SNAP_STALE_MS } from '../../../constants';
import { STRATEGIES } from '../../../backtest/strategies';
import type { RouteRegistrar } from '../types';

export const registerHealthRoutes: RouteRegistrar = (
  app,
  { config, snapStore, reportStore, telegram }
) => {
  app.get('/health', async (c) => {
    const [snap, snapCount, report] = await Promise.all([
      snapStore.getLatest(),
      snapStore.count(),
      reportStore.getLatest(),
    ]);

    const ageMs = snap ? Date.now() - new Date(snap.timestamp).getTime() : Infinity;

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      lastSnapId: snap?.id ?? null,
      lastSnapAt: snap?.timestamp ?? null,
      snapCount,
      isStale: ageMs > SNAP_STALE_MS,
      lastReportId: report?.id ?? null,
      lastReportDate: report?.date ?? null,
      assetsTracked: config.universe.length,
      strategiesRegistered: STRATEGIES.length,
      // Which optional pieces are actually wired up. The common deployment
      // mistake is a missing env var, and this is where you find out.
      telegram: telegram.enabled ? config.telegramMode : 'disabled',
      authEnabled: config.authEnabled,
    });
  });
};
