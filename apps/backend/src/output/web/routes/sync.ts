import { idleJob } from '../../../sync/types';
import type { RouteRegistrar } from '../types';

/**
 * Manual refresh of the whole universe.
 *
 * `POST /sync` kicks off a run and returns straight away; `GET /sync` is the
 * poll target that drives the progress readout. A second POST while a run is in
 * flight is a conflict rather than a queued job — the point of the button is
 * "get me current data", and two concurrent passes would only double the
 * outbound request rate.
 */
export const registerSyncRoutes: RouteRegistrar = (app, { sync }) => {
  app.post('/sync', (c) => {
    if (sync.isRunning) {
      return c.json({ error: 'sync already running', job: sync.status }, 409);
    }
    return c.json({ job: sync.start() }, 202);
  });

  app.get('/sync', (c) => c.json(sync.status ?? idleJob()));
};
