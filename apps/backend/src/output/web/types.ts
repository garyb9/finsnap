import type { Hono } from 'hono';
import type { Config } from '../../config';
import type { SnapStore } from '../../storage/snapStore';
import type { ReportStore } from '../../storage/reportStore';
import type { SnapScheduler } from '../../scheduler/cron';
import type { SyncRunner } from '../../sync/runner';
import type { TelegramOutput } from '../telegram';

/** Everything the route modules are allowed to reach for. */
export interface RouteContext {
  config: Config;
  snapStore: SnapStore;
  reportStore: ReportStore;
  scheduler: SnapScheduler;
  sync: SyncRunner;
  telegram: TelegramOutput;
}

export type RouteRegistrar = (app: Hono, ctx: RouteContext) => void;
