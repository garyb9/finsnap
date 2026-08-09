import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import type { Config } from '../config';
import type { SnapBuilder } from '../snapshot/builder';
import type { ReportBuilder } from '../report/builder';
import type { SnapStore } from '../storage/snapStore';
import type { ReportStore } from '../storage/reportStore';
import type { TelegramOutput } from '../output/telegram';
import { createLogger } from '../logger';
import type { FinSnap } from '../snapshot/types';
import type { DailyReport } from '../report/types';

const log = createLogger('scheduler');

function formatCountdown(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Runs two independent jobs:
 *
 *   snap   — the live market view, every few minutes off cached bars.
 *   report — the backtest-driven daily report, once per session before the
 *            open, so its signals are actionable at that open.
 *
 * The report is scheduled in an explicit timezone. Left to the container's
 * clock, "before the open" silently becomes "during lunch" the moment the host
 * region or daylight saving changes.
 */
export class SnapScheduler {
  private snapTask: cron.ScheduledTask | null = null;
  private reportTask: cron.ScheduledTask | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private snapRunning = false;
  private reportRunning = false;

  constructor(
    private config: Config,
    private builder: SnapBuilder,
    private reportBuilder: ReportBuilder,
    private store: SnapStore,
    private reportStore: ReportStore,
    private telegram: TelegramOutput
  ) {}

  start(): void {
    const { snapCron, reportCron, reportTimezone } = this.config;

    if (!cron.validate(snapCron)) throw new Error(`Invalid snap cron: ${snapCron}`);
    if (!cron.validate(reportCron)) throw new Error(`Invalid report cron: ${reportCron}`);

    log.info(`snap cron: ${snapCron}`);
    log.info(`report cron: ${reportCron} (${reportTimezone})`);

    this.snapTask = cron.schedule(snapCron, () => {
      void this.runSnapScheduled();
    });

    this.reportTask = cron.schedule(
      reportCron,
      () => {
        void this.runReportScheduled();
      },
      { timezone: reportTimezone }
    );

    this.startCountdown();
  }

  stop(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.snapTask?.stop();
    this.reportTask?.stop();
    this.snapTask = null;
    this.reportTask = null;
    log.info('stopped');
  }

  /** Build, store and publish a live snapshot. */
  async runSnap(): Promise<FinSnap> {
    // Snaps fetch bars for the whole universe; overlapping runs would double
    // the outbound request rate for no benefit.
    if (this.snapRunning) {
      log.warn('snap already in progress — skipping this trigger');
      const latest = await this.store.getLatest();
      if (latest) return latest;
    }

    this.snapRunning = true;
    try {
      log.info('generating snap...');
      const snap = await this.builder.build();
      await this.store.saveSnap(snap);

      try {
        await this.telegram.publishSnap(snap);
      } catch (err) {
        log.error(`telegram publish failed (snap still saved): ${err}`);
      }

      log.info(`snap ${snap.id} complete`);
      return snap;
    } finally {
      this.snapRunning = false;
    }
  }

  /** Build, store and publish the daily backtest report. */
  async runReport(): Promise<DailyReport> {
    if (this.reportRunning) {
      log.warn('report already in progress — skipping this trigger');
      const latest = await this.reportStore.getLatest();
      if (latest) return latest;
    }

    this.reportRunning = true;
    try {
      log.info('generating daily report...');
      const report = await this.reportBuilder.build();
      await this.reportStore.save(report);

      try {
        await this.telegram.publishReport(report);
      } catch (err) {
        log.error(`telegram publish failed (report still saved): ${err}`);
      }

      log.info(`report ${report.id} complete`);
      return report;
    } finally {
      this.reportRunning = false;
    }
  }

  /**
   * Cron-triggered wrapper for `runSnap` — swallows the error after alerting,
   * since a scheduled run has no caller to report failure to. Manual triggers
   * (`POST /snap/trigger`) go through `runSnap` directly and surface the
   * error over HTTP instead.
   */
  async runSnapScheduled(): Promise<void> {
    try {
      await this.runSnap();
    } catch (err) {
      this.alertFailure('snap', err);
    }
  }

  /** Cron-triggered wrapper for `runReport` — see `runSnapScheduled`. */
  async runReportScheduled(): Promise<void> {
    try {
      await this.runReport();
    } catch (err) {
      this.alertFailure('report', err);
    }
  }

  private alertFailure(job: 'snap' | 'report', err: unknown): void {
    log.error(`scheduled ${job} failed: ${err}`);
    void this.telegram.publishAlert(`Scheduled ${job} failed: ${err}`);
  }

  private startCountdown(): void {
    this.logNextRuns();
    this.countdownTimer = setInterval(() => this.logNextRuns(), 60_000);
  }

  private logNextRuns(): void {
    const describe = (expr: string, tz?: string): string => {
      try {
        const parsed = CronExpressionParser.parse(expr, tz ? { tz } : undefined);
        const next = parsed.next().toDate();
        return `${next.toISOString()} (in ${formatCountdown(next.getTime() - Date.now())})`;
      } catch {
        return 'unknown';
      }
    };

    log.info(
      `next snap: ${describe(this.config.snapCron)} | ` +
        `next report: ${describe(this.config.reportCron, this.config.reportTimezone)}`
    );
  }
}
