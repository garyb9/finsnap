import { Telegraf } from 'telegraf';
import type { Config } from '../../config';
import { TelegramMode } from '../../constants/enums';
import { createLogger } from '../../logger';
import { formatDailyReport } from '../../report/format';
import type { DailyReport } from '../../report/types';
import type { FinSnap } from '../../snapshot/types';
import type { SnapStore } from '../../storage/snapStore';
import type { ReportStore } from '../../storage/reportStore';
import { registerCommands } from './commands';
import { formatSnap } from './formatSnap';

const log = createLogger('telegram');

/** Path Telegram posts updates to in webhook mode. */
export const TELEGRAM_WEBHOOK_PATH = '/telegram/webhook';

/**
 * Telegram delivery. Owns the bot lifecycle and publishing; message content
 * lives in `formatSnap.ts` and the report formatters, command handling in
 * `commands.ts`.
 *
 * Everything here is optional. Without a token and channel the class is inert:
 * publishing becomes a no-op and command handling never starts. Telegram is one
 * output among several, so a missing key must not stop the API, the dashboard
 * or the backtests from running.
 */
export class TelegramOutput {
  private bot: Telegraf | null = null;
  private channelId: string | null = null;
  private mode: TelegramMode;

  constructor(
    private config: Config,
    private snapStore: SnapStore,
    private reportStore: ReportStore
  ) {
    this.mode = config.telegramEnabled ? config.telegramMode : TelegramMode.Off;

    if (!config.telegramEnabled) {
      log.warn(
        'TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID not set — Telegram delivery disabled. ' +
          'Everything else runs normally.'
      );
      return;
    }

    this.bot = new Telegraf(config.telegramBotToken!);
    this.channelId = config.telegramChannelId!;
  }

  get enabled(): boolean {
    return this.bot !== null;
  }

  async publishSnap(snap: FinSnap): Promise<void> {
    await this.send(formatSnap(snap), `snap ${snap.id}`);
  }

  async publishReport(report: DailyReport): Promise<void> {
    await this.send(formatDailyReport(report), `report ${report.id}`);
  }

  /**
   * Begin handling commands in whichever mode is configured.
   *
   * Polling holds an open connection to Telegram and therefore needs a process
   * that stays alive — correct for a container, impossible in a function.
   * Webhook mode registers the URL and lets the HTTP layer feed updates in
   * through `handleUpdate`, which is the path a hosted deployment takes.
   */
  async startCommandHandlers(): Promise<void> {
    if (!this.bot) return;

    registerCommands(this.bot, {
      snapStore: this.snapStore,
      reportStore: this.reportStore,
    });

    if (this.mode === TelegramMode.Webhook) {
      await this.registerWebhook();
      return;
    }

    this.bot.launch().catch((err) => log.error(`bot launch failed: ${err}`));

    process.once('SIGINT', () => this.bot?.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot?.stop('SIGTERM'));

    log.info('bot polling started');
  }

  /**
   * Feed one update in from the HTTP layer. Returns false when the bot is not
   * running in webhook mode, so the route can answer 404 rather than pretend.
   */
  async handleUpdate(update: unknown): Promise<boolean> {
    if (!this.bot || this.mode !== TelegramMode.Webhook) return false;

    try {
      await this.bot.handleUpdate(update as Parameters<Telegraf['handleUpdate']>[0]);
    } catch (err) {
      // A malformed update must not take the endpoint down; Telegram retries.
      log.error(`webhook update failed: ${err}`);
    }
    return true;
  }

  /** True when the request carries the secret Telegram was told to echo. */
  verifyWebhookSecret(headerValue: string | undefined): boolean {
    const expected = this.config.telegramWebhookSecret;
    if (!expected) return true;
    return headerValue === expected;
  }

  private async registerWebhook(): Promise<void> {
    const base = this.config.telegramWebhookUrl;
    if (!base) {
      log.warn(
        'TELEGRAM_MODE=webhook but TELEGRAM_WEBHOOK_URL is not set — ' +
          'commands are disabled. Publishing still works.'
      );
      return;
    }

    const url = `${base.replace(/\/$/, '')}${TELEGRAM_WEBHOOK_PATH}`;
    try {
      await this.bot!.telegram.setWebhook(url, {
        secret_token: this.config.telegramWebhookSecret,
      });
      log.info(`webhook registered at ${url}`);
    } catch (err) {
      // Publishing does not depend on the webhook, so a failure here degrades
      // command handling rather than the whole output.
      log.error(`failed to register webhook (commands unavailable): ${err}`);
    }
  }

  /**
   * Send each message independently. One failed part must not abort the rest —
   * a rejected asset block should never cost the reader the day's actions.
   */
  private async send(messages: string[], label: string): Promise<void> {
    if (!this.bot || !this.channelId) {
      log.debug(`Telegram disabled — skipping ${label}`);
      return;
    }

    for (let i = 0; i < messages.length; i++) {
      try {
        await this.bot.telegram.sendMessage(this.channelId, messages[i], { parse_mode: 'HTML' });
      } catch (err) {
        log.error(`failed to send ${label} part ${i + 1}/${messages.length}: ${err}`);
      }
    }
    log.info(`published ${label} (${messages.length} messages) to ${this.channelId}`);
  }
}

export { formatSnap } from './formatSnap';
