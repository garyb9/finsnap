import 'dotenv/config';
import { loadConfig } from './config';
import { getRedis, disconnectRedis } from './redis';
import { EvmCollector } from './collectors/evm';
import { SnapStore } from './storage/snapStore';
import { SnapBuilder } from './snapshot/builder';
import { SnapScheduler } from './scheduler/cron';
import { TelegramOutput } from './output/telegram';
import { WebOutput } from './output/web';
import logger from './logger';

async function main() {
  const config = loadConfig();
  const redis = getRedis(config.redisUrl);

  const evmCollector = new EvmCollector(config);
  const store = new SnapStore(redis);
  const builder = new SnapBuilder(evmCollector, config, redis);
  const telegram = new TelegramOutput(config, store);
  const scheduler = new SnapScheduler(config, builder, store, telegram);
  const web = new WebOutput(config, store, scheduler);

  // Backfill ~2 min of blocks before starting scheduler
  await evmCollector.backfill(10);
  evmCollector.start();

  // On startup: if no snap or data is stale (>10 min old), run one immediately
  const SNAP_INTERVAL_MS = 10 * 60 * 1000;
  const existingSnap = await store.getLatest();
  if (!existingSnap || Date.now() - new Date(existingSnap.timestamp).getTime() > SNAP_INTERVAL_MS) {
    logger.info('no fresh snap on startup — running initial snap');
    scheduler.runSnap().catch((err) => logger.error(`startup snap failed: ${err}`));
  }

  scheduler.start();
  web.start();
  telegram.startCommandHandlers();

  async function shutdown() {
    logger.info('shutting down...');
    evmCollector.stop();
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
