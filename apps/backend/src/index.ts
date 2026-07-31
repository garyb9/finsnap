import 'dotenv/config';
import { loadConfig } from './config';
import { getDb, disconnectDb, runMigrations } from './db';
import {
  PostgresStorage,
  ReportStore,
  SnapStore,
  BarsStore,
  OptionsStore,
  SearchedTickerStore,
} from './storage';
import { SnapBuilder } from './snapshot/builder';
import { ReportBuilder } from './report/builder';
import { SnapScheduler } from './scheduler/cron';
import { TelegramOutput } from './output/telegram';
import { WebOutput } from './output/web';
import { SyncRunner } from './sync/runner';
import { UniverseRegistry } from './universe/registry';
import { STRATEGIES } from './backtest/strategies';
import { STARTUP_REPORT_MAX_AGE_MS, STARTUP_SNAP_MAX_AGE_MS } from './constants';
import logger from './logger';

function ageOf(timestamp: string | undefined): number {
  return timestamp ? Date.now() - new Date(timestamp).getTime() : Infinity;
}

/**
 * Rebuild on startup only when the stored artifact is missing or stale, so a
 * restart during a deploy does not re-run the full universe unnecessarily.
 *
 * The two jobs run in sequence, not in parallel. They read the same bars
 * through the same cache, so firing both at once against a cold cache fetches
 * every symbol twice and doubles the outbound request rate at exactly the
 * moment there is nothing cached to soften it. Running the snap first warms the
 * cache the report then reads.
 */
async function backfillIfStale(
  scheduler: SnapScheduler,
  snapStore: SnapStore,
  reportStore: ReportStore
): Promise<void> {
  const snap = await snapStore.getLatest();
  if (ageOf(snap?.timestamp) > STARTUP_SNAP_MAX_AGE_MS) {
    logger.info('no fresh snap on startup — running initial snap');
    // Awaited, but a failure must not skip the report: the report is the
    // product, and it can be built from bars the snap never got to.
    await scheduler.runSnap().catch((err) => logger.error(`startup snap failed: ${err}`));
  }

  const report = await reportStore.getLatest();
  if (ageOf(report?.generatedAt) > STARTUP_REPORT_MAX_AGE_MS) {
    logger.info('no recent report on startup — building one');
    await scheduler.runReport().catch((err) => logger.error(`startup report failed: ${err}`));
  }
}

async function main() {
  const config = loadConfig();
  const pool = getDb(config.databaseUrl);
  await runMigrations(pool);

  // The one place the backing stores are chosen. Swapping any of them later is
  // a change here and nowhere else.
  const storage = new PostgresStorage(pool);
  const snapStore = new SnapStore(storage);
  const reportStore = new ReportStore(storage);
  const barsStore = new BarsStore(pool);
  const optionsStore = new OptionsStore(pool);
  const searchedTickerStore = new SearchedTickerStore(pool);

  // A single Telegram instance — two would mean two bots polling the same token.
  // Inert when no token is configured; nothing else changes.
  const telegram = new TelegramOutput(config, snapStore, reportStore);

  const scheduler = new SnapScheduler(
    config,
    new SnapBuilder(config, barsStore, optionsStore),
    new ReportBuilder(config, barsStore, optionsStore),
    snapStore,
    reportStore,
    telegram
  );

  const sync = new SyncRunner(config, barsStore, optionsStore, scheduler);
  const universe = new UniverseRegistry(config, searchedTickerStore, barsStore);
  const web = new WebOutput({
    config,
    snapStore,
    reportStore,
    scheduler,
    sync,
    universe,
    telegram,
    barsStore,
  });

  // Restores any searches that survived a restart, widening config.universe
  // before anything reads it. Quick — a handful of rows — so it runs before
  // serving rather than in the background.
  await universe.start();

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
    universe.stop();
    await disconnectDb();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error(`fatal: ${err}`);
  process.exit(1);
});
