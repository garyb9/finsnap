import { createLogger } from '../../../logger';
import { wait } from '../../../lib/async';
import { InvalidTickerError, TickerNotFoundError } from '../../../universe/registry';
import type { SyncRunner } from '../../../sync/runner';
import type { RouteRegistrar } from '../types';

const log = createLogger('web:universe');

const SYNC_POLL_MS = 2_000;
/** A cold-cache sync can genuinely take minutes; give up rather than wait forever. */
const MAX_WAIT_MS = 5 * 60_000;

/**
 * Kick off a sync that is guaranteed to see the ticker just added from its
 * very first read of `config.universe`.
 *
 * A sync's snapshot and report phases each read `config.universe` at a
 * different moment several seconds apart, so registering a new ticker while
 * one is already running can land between those reads: the report phase
 * picks it up, the snapshot phase — which ran first — does not. Waiting for
 * the in-flight run to finish before starting a fresh one means every phase
 * of *that* run reads the same, already-widened list.
 */
async function syncSoon(sync: SyncRunner, symbol: string): Promise<void> {
  if (sync.isRunning) {
    const deadline = Date.now() + MAX_WAIT_MS;
    while (sync.isRunning && Date.now() < deadline) await wait(SYNC_POLL_MS);
  }

  try {
    sync.start();
  } catch (err) {
    log.warn(`could not start a sync after adding ${symbol} (continuing): ${err}`);
  }
}

/**
 * Ad-hoc ticker search.
 *
 * Pulls a symbol into the tracked universe for 24 hours — a live snap,
 * options context, and every backtest strategy, same as the rest of the
 * universe.
 */
export const registerUniverseRoutes: RouteRegistrar = (app, { universe, sync }) => {
  app.post('/universe/:symbol', async (c) => {
    const requested = c.req.param('symbol');

    try {
      const { spec, expiresAt } = await universe.search(requested);

      // Fire-and-forget: pulls fresh data in now rather than waiting for the
      // next scheduled snap, without holding the response open for a run that
      // can take from seconds to minutes.
      void syncSoon(sync, spec.symbol);

      return c.json({
        spec,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        syncing: sync.isRunning,
      });
    } catch (err) {
      if (err instanceof InvalidTickerError) {
        return c.json({ error: err.message }, 400);
      }
      if (err instanceof TickerNotFoundError) {
        return c.json({ error: `Ticker "${requested.toUpperCase()}" not found` }, 404);
      }
      log.error(`ticker search failed for ${requested}: ${err}`);
      return c.json({ error: 'Ticker search failed — try again' }, 500);
    }
  });
};
