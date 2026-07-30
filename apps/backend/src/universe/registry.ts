import type Redis from 'ioredis';
import { createLogger } from '../logger';
import { AssetClass, buildAssetSpec, type AssetSpec, type Config } from '../config';
import { BarCollector } from '../collectors/bars';
import { BarInterval } from '../constants/enums';
import { PERIODS_PER_YEAR } from '../constants/time';
import { REDIS_KEYS, SEARCHED_TICKER_TTL_SECONDS } from '../constants/cache';

const log = createLogger('universe');

/** How often expired searches are swept out of the tracked universe. */
const SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * Loose on purpose — Yahoo's own symbol syntax covers plain tickers (AAPL),
 * crypto pairs (BTC-USD), share classes (BRK.B), indices (^GSPC) and FX
 * (EURUSD=X). The real validity check is the bar fetch below; this only
 * rejects input that could not be a ticker under any of those schemes.
 */
const SYMBOL_PATTERN = /^[A-Z0-9.\-=^]{1,15}$/;

export class InvalidTickerError extends Error {
  constructor(readonly symbol: string) {
    super(`"${symbol}" is not a valid ticker symbol`);
    this.name = 'InvalidTickerError';
  }
}

export class TickerNotFoundError extends Error {
  constructor(readonly symbol: string) {
    super(`ticker "${symbol}" not found`);
    this.name = 'TickerNotFoundError';
  }
}

interface SearchedEntry {
  spec: AssetSpec;
  expiresAt: number;
}

/**
 * Tickers pulled into the universe by a user search, layered on top of the
 * static list from env config.
 *
 * Every consumer — `SnapBuilder`, `ReportBuilder`, `SyncRunner`, the strategy
 * and guide routes — reads `config.universe` directly off the shared config
 * object, so this widens that same array in place rather than threading a
 * second list through the whole app. Once added, a searched ticker gets a
 * live snap, options context and every backtest strategy exactly like one
 * configured at boot, because it *is* one — just with a clock attached.
 *
 * Entries expire 24 hours after the *last* search, not the first: searching
 * an already-tracked ticker again resets the clock, the same way leaving a
 * page open and refreshing it would.
 */
export class UniverseRegistry {
  private readonly baseUniverse: readonly AssetSpec[];
  private readonly extra = new Map<string, SearchedEntry>();
  private readonly bars: BarCollector;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private config: Config,
    private redis: Redis
  ) {
    this.baseUniverse = [...config.universe];
    this.bars = new BarCollector(redis);
  }

  /** Restore searches that survived a restart, then start sweeping expired ones. */
  async start(): Promise<void> {
    await this.hydrate();
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Validate a symbol and add it to the tracked universe for 24 hours.
   *
   * Validation is a real bar fetch rather than a format check — Yahoo accepts
   * almost any string in the URL and simply answers with an empty chart for a
   * symbol that doesn't exist, so no regex can tell a real ticker from a typo.
   * A live daily-bar fetch is the only honest test, and it warms the cache the
   * very next snap/report build reads from.
   */
  async search(rawSymbol: string): Promise<{ spec: AssetSpec; expiresAt: number | null }> {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol || !SYMBOL_PATTERN.test(symbol)) throw new InvalidTickerError(symbol);

    const tracked = this.findTracked(symbol);
    if (tracked) {
      await this.remember(symbol, tracked);
      return { spec: tracked, expiresAt: this.expiryOf(symbol) };
    }

    const daily = await this.bars.fetchSeries(symbol, BarInterval.Daily);
    if (!daily || daily.bars.length === 0) throw new TickerNotFoundError(symbol);

    const assetClass = /-USD$/.test(symbol) ? AssetClass.Crypto : AssetClass.Equity;
    const periodsPerYear =
      assetClass === AssetClass.Crypto ? PERIODS_PER_YEAR.cryptoDaily : PERIODS_PER_YEAR.equityDaily;
    // Options are attempted for every searched equity; a chain that turns out
    // to be thin or missing is skipped later the same way it is for the base
    // universe, rather than guessed at up front.
    const spec = buildAssetSpec(
      symbol,
      assetClass,
      periodsPerYear,
      assetClass === AssetClass.Equity,
      true
    );

    await this.remember(symbol, spec);
    return { spec, expiresAt: this.expiryOf(symbol) };
  }

  /** Base universe first — a symbol already tracked at boot needs no bookkeeping. */
  private findTracked(symbol: string): AssetSpec | undefined {
    return this.baseUniverse.find((s) => s.symbol === symbol) ?? this.extra.get(symbol)?.spec;
  }

  private expiryOf(symbol: string): number | null {
    return this.extra.get(symbol)?.expiresAt ?? null;
  }

  private async remember(symbol: string, spec: AssetSpec): Promise<void> {
    // A base-universe symbol is permanent; only a searched extra has a TTL.
    if (this.baseUniverse.some((s) => s.symbol === symbol)) return;

    const expiresAt = Date.now() + SEARCHED_TICKER_TTL_SECONDS * 1000;
    this.extra.set(symbol, { spec, expiresAt });
    this.rebuild();

    try {
      await this.redis.set(
        `${REDIS_KEYS.searchedTicker}:${symbol}`,
        JSON.stringify(spec),
        'EX',
        SEARCHED_TICKER_TTL_SECONDS
      );
    } catch (err) {
      log.warn(`failed to persist searched ticker ${symbol} (continuing in memory only): ${err}`);
    }
  }

  private async hydrate(): Promise<void> {
    const prefix = `${REDIS_KEYS.searchedTicker}:`;
    let cursor = '0';
    const keys: string[] = [];

    try {
      do {
        const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== '0');
    } catch (err) {
      log.warn(`failed to scan for searched tickers (starting with none restored): ${err}`);
      return;
    }

    for (const key of keys) {
      const symbol = key.slice(prefix.length);
      try {
        const [raw, ttl] = await Promise.all([this.redis.get(key), this.redis.ttl(key)]);
        if (!raw || ttl <= 0) continue;
        // Forced rather than trusted from storage: everything under this
        // Redis prefix is a searched ticker by construction, and a stored
        // record written before this field existed must not silently read
        // back as "not searched".
        const spec = { ...(JSON.parse(raw) as AssetSpec), searched: true };
        this.extra.set(symbol, { spec, expiresAt: Date.now() + ttl * 1000 });
      } catch (err) {
        log.warn(`skipping corrupt searched-ticker entry ${symbol}: ${err}`);
      }
    }

    if (this.extra.size > 0) {
      log.info(`restored ${this.extra.size} searched ticker(s) from a prior run`);
      this.rebuild();
    }
  }

  private sweep(): void {
    const now = Date.now();
    let changed = false;

    for (const [symbol, entry] of this.extra) {
      if (entry.expiresAt <= now) {
        this.extra.delete(symbol);
        changed = true;
        log.info(`${symbol}: search expired, dropped from the tracked universe`);
      }
    }

    if (changed) this.rebuild();
  }

  private rebuild(): void {
    const extras = Array.from(this.extra.values()).map((e) => e.spec);
    this.config.universe = [...this.baseUniverse, ...extras];
  }
}
