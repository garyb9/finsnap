import { z } from 'zod';
import { assetInfo } from './constants/assets';
import { AssetCategory, AssetClass, TelegramMode } from './constants/enums';
import { PERIODS_PER_YEAR } from './constants/time';

export { AssetCategory, AssetClass, TelegramMode };

const configSchema = z.object({
  // Postgres. The default serves `yarn dev` on the host; docker-compose
  // overrides it with the service hostname, which only resolves inside its
  // network.
  databaseUrl: z.string().default('postgres://postgres:postgres@localhost:5432/finsnap'),

  /**
   * Telegram — entirely optional.
   *
   * A missing token disables delivery and logs a warning rather than throwing
   * at startup. Requiring it meant the API, the dashboard and the backtests
   * could not run at all without a bot, which is the wrong dependency: Telegram
   * is one output, not the product.
   */
  telegramBotToken: z.string().optional(),
  telegramChannelId: z.string().optional(),
  /** `polling` needs a long-lived process; `webhook` is what serverless needs. */
  telegramMode: z.nativeEnum(TelegramMode).default(TelegramMode.Polling),
  /** Public base URL Telegram should call in webhook mode, e.g. https://api.example.com */
  telegramWebhookUrl: z.string().optional(),
  /** Shared secret Telegram echoes back, so the endpoint can reject forgeries */
  telegramWebhookSecret: z.string().optional(),

  /**
   * Bearer token guarding the endpoints that trigger work.
   *
   * Unset leaves them open, which is what local development wants. Set it for
   * anything reachable from the internet — `POST /sync` kicks off a multi-minute
   * fetch of the whole universe, and an unauthenticated one is both a cost
   * problem and a fast route to being rate-limited by the data source.
   */
  apiToken: z.string().optional(),

  // Universe — comma-separated. Crypto trades 24/7, equities follow market hours.
  cryptoSymbols: z.string().default('BTC-USD'),
  /**
   * Broad US and international indices, the eleven sector SPDRs, a couple of
   * industry-level slices, commodities, currencies, credit, long bonds and a
   * volatility proxy. Sector coverage is deliberately complete: a partial set
   * would make the breadth reading a statement about which sectors were
   * picked.
   */
  equitySymbols: z
    .string()
    .default(
      'SPY,QQQ,DIA,IWM,EEM,EFA,' +
        'XLK,XLF,XLE,XLV,XLI,XLY,XLP,XLU,XLB,XLRE,XLC,' +
        'SMH,XPH,' +
        'GLD,SLV,USO,UNG,UUP,FXE,FXY,LQD,HYG,TLT,VXX,IBIT'
    ),

  // Options chains are only pulled for this subset (Yahoo chains are slow to
  // page). The list is the liquid end of the universe: the four index proxies,
  // the sectors that carry real open interest, the metals/energy/rates
  // instruments, and the handful of newer additions (emerging markets, high
  // yield credit, VIX futures) whose options are liquid enough to be worth
  // the fetch. The remaining sector ETFs trade options too, but thinly enough
  // that most expiries come back reading "thin" anyway.
  optionsSymbols: z
    .string()
    .default('SPY,QQQ,IWM,DIA,XLK,XLF,XLE,GLD,SLV,USO,TLT,EEM,HYG,VXX,IBIT'),

  // Backtest execution assumptions
  backtestCapital: z.coerce.number().positive().default(10_000),
  backtestFeeBps: z.coerce.number().min(0).default(5),
  backtestSlippageBps: z.coerce.number().min(0).default(5),

  // Schedulers
  /** Live snapshot — hourly is enough now that bars sync incrementally: each
   * run just picks up current price plus whatever bars are missing, rather
   * than re-fetching full history. */
  snapCron: z.string().default('0 * * * *'),
  /** Daily backtest report — 08:00 America/New_York, 90 min before the open */
  reportCron: z.string().default('0 8 * * 1-5'),
  reportTimezone: z.string().default('America/New_York'),

  // Web
  appPort: z.coerce.number().int().positive().default(4000),
});

type RawConfig = z.infer<typeof configSchema>;

export interface AssetSpec {
  /** Yahoo Finance symbol used for data fetches — e.g. BTC-USD, SPY */
  symbol: string;
  /** Short display symbol — e.g. BTC, SPY */
  label: string;
  /** Full instrument name — e.g. 'SPDR S&P 500 ETF Trust' */
  name: string;
  /** The handle a person would use — e.g. 'S&P 500' */
  shortName: string;
  assetClass: AssetClass;
  /** What the instrument gives you exposure to */
  category: AssetCategory;
  /** Trading periods per year, used to annualize backtest metrics */
  periodsPerYear: number;
  /** True when an options chain should be pulled for this asset */
  hasOptions: boolean;
  /** True for a ticker pulled in by a user search rather than configured at boot */
  searched: boolean;
}

export interface Config extends RawConfig {
  universe: AssetSpec[];
  /** Symbols with options chains — the equities half of the universe */
  optionsList: string[];
  /** True when a bot token and channel are both present */
  telegramEnabled: boolean;
  /** True when mutating endpoints require a bearer token */
  authEnabled: boolean;
}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

/** BTC-USD → BTC. Equity symbols are already their own label. */
export function toLabel(symbol: string): string {
  return symbol.replace(/-USD$/, '');
}

/**
 * Build one universe entry.
 *
 * Exported so a ticker pulled in later by a user search (see
 * `src/universe/registry.ts`) is built the exact same way as one configured at
 * boot — same label, reference lookup and fallback category — and so is
 * genuinely indistinguishable from the rest of the universe.
 */
export function buildAssetSpec(
  symbol: string,
  assetClass: AssetClass,
  periodsPerYear: number,
  hasOptions: boolean,
  searched = false
): AssetSpec {
  const info = assetInfo(symbol, assetClass);
  return {
    symbol,
    label: toLabel(symbol),
    name: info.name,
    shortName: info.shortName,
    assetClass,
    category: info.category,
    periodsPerYear,
    hasOptions,
    searched,
  };
}

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    databaseUrl: process.env.DATABASE_URL,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChannelId: process.env.TELEGRAM_CHANNEL_ID,
    telegramMode: process.env.TELEGRAM_MODE,
    telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    apiToken: process.env.API_TOKEN,
    cryptoSymbols: process.env.CRYPTO_SYMBOLS,
    equitySymbols: process.env.EQUITY_SYMBOLS ?? process.env.WATCHED_TICKERS,
    optionsSymbols: process.env.OPTIONS_SYMBOLS,
    backtestCapital: process.env.BACKTEST_CAPITAL,
    backtestFeeBps: process.env.BACKTEST_FEE_BPS,
    backtestSlippageBps: process.env.BACKTEST_SLIPPAGE_BPS,
    snapCron: process.env.SNAP_CRON,
    reportCron: process.env.REPORT_CRON,
    reportTimezone: process.env.REPORT_TIMEZONE,
    appPort: process.env.APP_PORT,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  const optionsList = splitList(result.data.optionsSymbols);

  const universe: AssetSpec[] = [
    ...splitList(result.data.cryptoSymbols).map((symbol) =>
      buildAssetSpec(symbol, AssetClass.Crypto, PERIODS_PER_YEAR.cryptoDaily, false)
    ),
    ...splitList(result.data.equitySymbols).map((symbol) =>
      buildAssetSpec(
        symbol,
        AssetClass.Equity,
        PERIODS_PER_YEAR.equityDaily,
        optionsList.includes(symbol)
      )
    ),
  ];

  // Both halves are needed to publish: a token with no channel has nowhere to
  // send, and a channel with no token has nothing to send with.
  const telegramEnabled = Boolean(result.data.telegramBotToken && result.data.telegramChannelId);

  return {
    ...result.data,
    universe,
    optionsList,
    telegramEnabled,
    authEnabled: Boolean(result.data.apiToken),
  };
}
