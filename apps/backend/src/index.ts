import 'dotenv/config';
import { loadConfig } from './config';
import { getRedis, disconnectRedis } from './redis';
import { RedisStorage, ReportStore, SnapStore } from './storage';
import { SnapBuilder } from './snapshot/builder';
import { ReportBuilder } from './report/builder';
import { SnapScheduler } from './scheduler/cron';
import { TelegramOutput } from './output/telegram';
import { WebOutput } from './output/web';
import { SyncRunner } from './sync/runner';
import { STRATEGIES } from './backtest/strategies';
import { STARTUP_REPORT_MAX_AGE_MS, STARTUP_SNAP_MAX_AGE_MS } from './constants';
import logger from './logger';

function ageOf(timestamp: string | undefined): number {
  return timestamp ? Date.now() - new Date(timestamp).getTime() : Infinity;
}

/**
 * Rebuild on startup only when the stored artifact is missing or stale, so a
 * restart during a deploy does not re-run the full universe unnecessarily.
 */
async function backfillIfStale(
  scheduler: SnapScheduler,
  snapStore: SnapStore,
  reportStore: ReportStore
): Promise<void> {
  const snap = await snapStore.getLatest();
  if (ageOf(snap?.timestamp) > STARTUP_SNAP_MAX_AGE_MS) {
    logger.info('no fresh snap on startup — running initial snap');
    scheduler.runSnap().catch((err) => logger.error(`startup snap failed: ${err}`));
  }

  const report = await reportStore.getLatest();
  if (ageOf(report?.generatedAt) > STARTUP_REPORT_MAX_AGE_MS) {
    logger.info('no recent report on startup — building one');
    scheduler.runReport().catch((err) => logger.error(`startup report failed: ${err}`));
  }
}

async function main() {
  const config = loadConfig();
  const redis = getRedis(config.redisUrl);

  // The one place the backing store is chosen. Swapping in a Postgres adapter
  // later is a change here and nowhere else.
  const storage = new RedisStorage(redis);
  const snapStore = new SnapStore(storage);
  const reportStore = new ReportStore(storage);

  // A single Telegram instance — two would mean two bots polling the same token.
  // Inert when no token is configured; nothing else changes.
  const telegram = new TelegramOutput(config, snapStore, reportStore);

  const scheduler = new SnapScheduler(
    config,
    new SnapBuilder(config, redis),
    new ReportBuilder(config, redis),
    snapStore,
    reportStore,
    telegram
  );

  const sync = new SyncRunner(config, redis, scheduler);
  const web = new WebOutput({ config, snapStore, reportStore, scheduler, sync, telegram });

  logger.info(
    `tracking ${config.universe.length} assets ` +
      `(${config.universe.map((a) => a.label).join(', ')}) ` +
      `with ${STRATEGIES.length} strategies`
  );

  // Serve immediately; backfill runs in the background so a cold start with an
  // empty cache doesn't hold the API down for the length of a full fetch.
  scheduler.start();
  web.start();
  telegram
    .startCommandHandlers()
    .catch((err) => logger.error(`telegram command handlers failed to start: ${err}`));

  backfillIfStale(scheduler, snapStore, reportStore).catch((err) =>
    logger.error(`startup backfill failed: ${err}`)
  );

  async function shutdown() {
    logger.info('shutting down...');
    scheduler.stop();
    await disconnectRedis();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error(`fatal: ${err}`);
  process.exit(1);
});
