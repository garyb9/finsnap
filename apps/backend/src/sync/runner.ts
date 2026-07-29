import type Redis from 'ioredis';
import type { Config } from '../config';
import { BarCollector } from '../collectors/bars';
import { fetchOptionsData } from '../collectors/options';
import { createLogger } from '../logger';
import type { SnapScheduler } from '../scheduler/cron';
import { SyncTracker } from './tracker';
import { SyncPhase, SyncStage, type SyncJob } from './types';

const log = createLogger('sync');

/**
 * The manual "sync everything" action behind the dashboard button.
 *
 * It does three things in order: refresh every symbol's bars and option chain,
 * rebuild the live snapshot, then rebuild the daily report. The order matters —
 * both builders read through the same cache, so doing the network work first
 * means they run against fresh data and finish quickly.
 *
 * Only the first phase touches the network, so it is the only one reported
 * symbol by symbol. That is also the only phase where a user watching a spinner
 * learns anything: the rest is CPU.
 */
export class SyncRunner {
  private bars: BarCollector;
  readonly tracker = new SyncTracker();

  constructor(
    private config: Config,
    private redis: Redis,
    private scheduler: SnapScheduler
  ) {
    this.bars = new BarCollector(redis, (event) => this.tracker.recordFetch(event));
  }

  get isRunning(): boolean {
    return this.tracker.isRunning;
  }

  get status(): SyncJob | null {
    return this.tracker.current;
  }

  /**
   * Start a sync and return immediately with the initial job state.
   *
   * A full universe refresh takes minutes; holding an HTTP request open for it
   * would time out in every proxy between here and the browser. The caller
   * polls `status` instead.
   */
  start(): SyncJob {
    if (this.tracker.isRunning) {
      throw new Error('a sync is already running');
    }

    const job = this.tracker.begin(this.config.universe);
    log.info(`sync ${job.id} started for ${job.total} assets`);

    void this.run().catch((err) => {
      log.error(`sync failed: ${err}`);
      this.tracker.end(String(err));
    });

    return job;
  }

  private async run(): Promise<void> {
    const startedAt = Date.now();

    await this.refreshUniverse();

    this.tracker.phase(SyncPhase.Snapshot);
    try {
      await this.scheduler.runSnap();
    } catch (err) {
      log.error(`sync: snapshot rebuild failed (continuing to report): ${err}`);
    }

    this.tracker.phase(SyncPhase.Report);
    try {
      await this.scheduler.runReport();
    } catch (err) {
      // A failed report still leaves fresh bars and a fresh snap behind, so the
      // sync is reported as failed rather than silently discarded.
      this.tracker.end(`report build failed: ${err}`);
      return;
    }

    this.tracker.end();
    log.info(`sync complete in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }

  /** Phase one: pull fresh bars, and chains where the asset has options. */
  private async refreshUniverse(): Promise<void> {
    for (const spec of this.config.universe) {
      this.tracker.beginSymbol(spec.symbol);

      try {
        const bars = await this.bars.fetchSymbol(spec.symbol);

        if (spec.hasOptions) {
          this.tracker.stage(spec.symbol, SyncStage.Options);
          await fetchOptionsData(spec.symbol, this.redis);
        }

        const hasData = Boolean(bars.daily ?? bars.hourly);
        this.tracker.endSymbol(spec.symbol, hasData ? SyncStage.Done : SyncStage.Empty);
      } catch (err) {
        // One dead symbol must not abort the other twenty-two.
        log.warn(`${spec.symbol}: sync failed (continuing): ${err}`);
        this.tracker.endSymbol(spec.symbol, SyncStage.Failed, String(err));
      }
    }
  }
}
