import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import type { Config } from '../config';
import type { SnapBuilder } from '../snapshot/builder';
import type { SnapStore } from '../storage/snapStore';
import type { TelegramOutput } from '../output/telegram';
import { createLogger } from '../logger';
import type { FinSnap } from '../snapshot/types';

const log = createLogger('scheduler');

function formatCountdown(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export class SnapScheduler {
  private task: cron.ScheduledTask | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private cronExpression: string = '';

  constructor(
    private config: Config,
    private builder: SnapBuilder,
    private store: SnapStore,
    private telegram: TelegramOutput
  ) {}

  start(): void {
    this.cronExpression = this.config.snapCron;

    if (!cron.validate(this.cronExpression)) {
      throw new Error(`Invalid cron expression: ${this.cronExpression}`);
    }

    log.info(`scheduling snaps with cron: ${this.cronExpression}`);

    this.task = cron.schedule(this.cronExpression, async () => {
      await this.runSnap();
    });

    this.startCountdown();
  }

  stop(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.task) {
      this.task.stop();
      this.task = null;
      log.info('stopped');
    }
  }

  /** Manually trigger a snap (also used by the cron job and POST /snap/trigger) */
  async runSnap(): Promise<FinSnap> {
    log.info('generating snap...');

    const snap = await this.builder.build();
    await this.store.saveSnap(snap);

    try {
      await this.telegram.publish(snap);
    } catch (err) {
      log.error(`telegram publish failed (snap still saved): ${err}`);
    }

    log.info(`snap ${snap.id} complete`);
    return snap;
  }

  private startCountdown(): void {
    this.logNextRun();
    this.countdownTimer = setInterval(() => {
      this.logNextRun();
    }, 30_000);
  }

  private logNextRun(): void {
    try {
      const expr = CronExpressionParser.parse(this.cronExpression);
      const next = expr.next().toDate();
      const diff = next.getTime() - Date.now();
      log.info(`next run: ${next.toISOString()} (in ${formatCountdown(diff)})`);
    } catch {
      // ignore parse errors
    }
  }
}
