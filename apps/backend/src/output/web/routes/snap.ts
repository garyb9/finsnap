import { createLogger } from '../../../logger';
import { assetKey, parseLimit } from '../helpers';
import type { RouteRegistrar } from '../types';

const log = createLogger('web:snap');

const DEFAULT_HISTORY = 10;
const MAX_HISTORY = 50;

/**
 * Live snapshot routes.
 *
 * `/snap/:label` is registered last on purpose — Hono matches in registration
 * order, so declaring the wildcard first would capture `/snap/trigger` as an
 * asset named "trigger".
 */
export const registerSnapRoutes: RouteRegistrar = (app, { snapStore, scheduler }) => {
  app.get('/snap', async (c) => {
    const snap = await snapStore.getLatest();
    if (!snap) return c.json({ error: 'No snapshots generated yet' }, 404);
    return c.json(snap);
  });

  app.get('/snaps', async (c) => {
    const snaps = await snapStore.getHistory(parseLimit(c, DEFAULT_HISTORY, MAX_HISTORY));
    return c.json({ count: snaps.length, snaps });
  });

  app.post('/snap/trigger', async (c) => {
    try {
      log.info('manual snap triggered via API');
      return c.json(await scheduler.runSnap());
    } catch (err) {
      log.error(`manual snap failed: ${err}`);
      return c.json({ error: 'Snap generation failed' }, 500);
    }
  });

  app.get('/snap/:label', async (c) => {
    const label = assetKey(c.req.param('label'));
    const snap = await snapStore.getLatest();
    if (!snap) return c.json({ error: 'No snapshots generated yet' }, 404);

    const asset = snap.assets[label] ?? Object.values(snap.assets).find((a) => a.symbol === label);
    if (!asset) return c.json({ error: `No data for ${label}` }, 404);

    return c.json({ id: snap.id, timestamp: snap.timestamp, ...asset });
  });
};
