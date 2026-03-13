import { z } from 'zod';

const configSchema = z.object({
  // Ethereum
  ethRpcUrl: z.string().url().default('https://eth.llamarpc.com'),
  whaleThresholdEth: z.coerce.number().positive().default(100),

  // Redis
  redisUrl: z.string().default('redis://redis:6379'),

  // Telegram
  telegramBotToken: z.string().min(1),
  telegramChannelId: z.string().min(1),

  // Options — comma-separated tickers
  watchedTickers: z.string().default('IBIT'),

  // Scheduler
  snapCron: z.string().default('*/10 * * * *'),

  // Web
  appPort: z.coerce.number().int().positive().default(4000),
});

type RawConfig = z.infer<typeof configSchema>;

export interface Config extends RawConfig {
  tickerList: string[];
}

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    ethRpcUrl: process.env.ETH_RPC_URL,
    whaleThresholdEth: process.env.WHALE_THRESHOLD_ETH,
    redisUrl: process.env.REDIS_URL,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChannelId: process.env.TELEGRAM_CHANNEL_ID,
    watchedTickers: process.env.WATCHED_TICKERS,
    snapCron: process.env.SNAP_CRON,
    appPort: process.env.APP_PORT,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  const tickerList = result.data.watchedTickers
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  return { ...result.data, tickerList };
}
