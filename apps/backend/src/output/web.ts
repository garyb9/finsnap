import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import type { Config } from '../config';
import type { SnapStore } from '../storage/snapStore';
import type { SnapScheduler } from '../scheduler/cron';
import { createLogger } from '../logger';

const log = createLogger('web');

export class WebOutput {
  private app: Hono;
  private port: number;

  constructor(
    config: Config,
    private store: SnapStore,
    private scheduler: SnapScheduler
  ) {
    this.port = config.appPort;
    this.app = new Hono();
    this.app.use('*', cors({ origin: '*' }));
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/health', async (c) => {
      const [snap, snapCount] = await Promise.all([this.store.getLatest(), this.store.count()]);
      const SNAP_TTL_MS = 10 * 60 * 1000;
      const ageMs = snap ? Date.now() - new Date(snap.timestamp).getTime() : Infinity;
      return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        lastSnapId: snap?.id ?? null,
        lastSnapAt: snap?.timestamp ?? null,
        snapCount,
        isStale: ageMs > SNAP_TTL_MS,
      });
    });

    this.app.get('/', (c) => {
      return c.json({
        name: 'FinSnap',
        description: 'Financial data snapshot — on-chain + options',
        endpoints: {
          'GET /snap': 'Latest full snapshot',
          'GET /snap/options-insight': 'Per-ticker options insight summary',
          'GET /snap/onchain': 'On-chain block only',
          'GET /snap/equities/:ticker': 'Options data for a ticker',
          'GET /snaps?limit=N': 'Snapshot history',
          'POST /snap/trigger': 'Trigger a fresh snapshot',
          'GET /health': 'Health check',
        },
      });
    });

    this.app.get('/snap', async (c) => {
      const snap = await this.store.getLatest();
      if (!snap) return c.json({ error: 'No snapshots generated yet' }, 404);
      return c.json(snap);
    });

    this.app.get('/snap/onchain', async (c) => {
      const snap = await this.store.getLatest();
      if (!snap) return c.json({ error: 'No snapshots generated yet' }, 404);
      return c.json({
        id: snap.id,
        timestamp: snap.timestamp,
        blockHeight: snap.blockHeight,
        onChain: snap.onChain,
        signals: snap.signals,
      });
    });

    this.app.get('/snap/options-insight', async (c) => {
      const snap = await this.store.getLatest();
      if (!snap) return c.json({ error: 'No snapshots generated yet' }, 404);

      const equities = Object.entries(snap.equities).map(([ticker, eq]) => ({
        ticker,
        price: eq.price,
        expirations: eq.expirations.map((exp) => ({
          date: exp.date,
          pcRatio: exp.pcRatio,
          insight: exp.insight ?? null,
        })),
      }));

      return c.json({
        id: snap.id,
        timestamp: snap.timestamp,
        equities,
      });
    });

    this.app.get('/snap/equities/:ticker', async (c) => {
      const ticker = c.req.param('ticker').toUpperCase();
      const snap = await this.store.getLatest();
      if (!snap) return c.json({ error: 'No snapshots generated yet' }, 404);
      const eq = snap.equities[ticker];
      if (!eq) return c.json({ error: `No data for ticker ${ticker}` }, 404);
      return c.json({ id: snap.id, timestamp: snap.timestamp, ticker, ...eq });
    });

    this.app.get('/snaps', async (c) => {
      const limit = Math.min(parseInt(c.req.query('limit') ?? '10', 10), 50);
      const snaps = await this.store.getHistory(limit);
      return c.json({ count: snaps.length, snaps });
    });

    this.app.get('/snap/:id', async (c) => {
      const snap = await this.store.getById(c.req.param('id'));
      if (!snap) return c.json({ error: 'Snap not found' }, 404);
      return c.json(snap);
    });

    this.app.post('/snap/trigger', async (c) => {
      try {
        log.info('manual snap triggered via API');
        const snap = await this.scheduler.runSnap();
        return c.json(snap);
      } catch (err) {
        log.error(`manual snap failed: ${err}`);
        return c.json({ error: 'Snap generation failed' }, 500);
      }
    });
  }

  start(): void {
    serve({ fetch: this.app.fetch, port: this.port }, () => {
      log.info(`API server running on http://0.0.0.0:${this.port}`);
    });
  }
}
