import type { Hono } from 'hono';
import { requireToken } from '../auth';
import { registerCorrelationRoutes } from './correlation';
import { registerGuideRoutes } from './guide';
import { registerHealthRoutes } from './health';
import { registerPairsRoutes } from './pairs';
import { registerReportRoutes } from './report';
import { registerRootRoutes } from './root';
import { registerSnapRoutes } from './snap';
import { registerStrategyRoutes } from './strategies';
import { registerSyncRoutes } from './sync';
import { registerTelegramRoutes } from './telegram';
import { registerUniverseRoutes } from './universe';
import type { RouteContext, RouteRegistrar } from '../types';

/**
 * Endpoints that start work rather than read it, and so sit behind the token
 * guard when one is configured. Reads stay open — the dashboard polls them and
 * they cost nothing.
 *
 * `GET /sync` is deliberately absent: the progress readout is a read, and
 * locking it would break the panel for an anonymous viewer.
 */
const GUARDED_POST_PATHS = ['/sync', '/report/trigger', '/snap/trigger', '/universe/:symbol'];

/**
 * Registration order is significant: Hono matches routes in the order they are
 * declared, and the snap module ends with a `/snap/:label` wildcard. Keeping it
 * last means every literal path is claimed before the catch-all sees it.
 */
const REGISTRARS: RouteRegistrar[] = [
  registerRootRoutes,
  registerHealthRoutes,
  registerReportRoutes,
  registerStrategyRoutes,
  registerCorrelationRoutes,
  registerPairsRoutes,
  registerGuideRoutes,
  registerSyncRoutes,
  registerTelegramRoutes,
  registerUniverseRoutes,
  registerSnapRoutes,
];

export function registerRoutes(app: Hono, ctx: RouteContext): void {
  // Registered before the handlers so it runs first and can short-circuit.
  // Telegram's webhook is excluded: it authenticates with its own shared
  // secret, which is the only thing Telegram knows how to send.
  app.on('POST', GUARDED_POST_PATHS, requireToken(ctx.config));

  for (const register of REGISTRARS) register(app, ctx);
}
