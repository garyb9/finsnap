import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { createLogger } from '../../logger';
import { registerRoutes } from './routes';
import type { RouteContext } from './types';

const log = createLogger('web');

/**
 * HTTP surface. Deliberately thin: this class owns the server lifecycle and
 * nothing else. Every endpoint lives in its own module under `routes/`.
 */
export class WebOutput {
  private app: Hono;
  private port: number;

  constructor(private ctx: RouteContext) {
    this.port = ctx.config.appPort;
    this.app = new Hono();
    this.app.use('*', cors({ origin: '*' }));
    registerRoutes(this.app, ctx);
  }

  /** Exposed for tests, which exercise routes without binding a port. */
  get fetch(): Hono['fetch'] {
    return this.app.fetch;
  }

  start(): void {
    serve({ fetch: this.app.fetch, port: this.port }, () => {
      log.info(
        `API server running on http://0.0.0.0:${this.port} ` +
          `(${this.ctx.config.universe.length} assets)`
      );
    });
  }
}

export type { RouteContext } from './types';
