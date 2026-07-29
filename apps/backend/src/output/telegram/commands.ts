import type { Telegraf } from 'telegraf';
import { createLogger } from '../../logger';
import { preBlock } from '../../lib/format';
import { formatAssetDetail, formatDailyReport } from '../../report/format';
import { formatOpportunityCompact } from '../../report/format/opportunity';
import type { SnapStore } from '../../storage/snapStore';
import type { ReportStore } from '../../storage/reportStore';
import { formatAssetBlock, formatSnap } from './formatSnap';

const log = createLogger('telegram:commands');

export interface CommandContext {
  snapStore: SnapStore;
  reportStore: ReportStore;
}

/** Read the argument after a command, normalized for asset lookup. */
function readArg(text: string): string {
  return text.split(' ').slice(1).join(' ').trim().replace('$', '').toUpperCase();
}

function registerSnapCommand(bot: Telegraf, { snapStore }: CommandContext): void {
  bot.command('snap', async (ctx) => {
    const arg = readArg(ctx.message.text);

    try {
      const snap = await snapStore.getLatest();
      if (!snap) {
        await ctx.reply('No snap available yet. Try again in a few minutes.');
        return;
      }

      if (arg) {
        const asset = snap.assets[arg] ?? Object.values(snap.assets).find((a) => a.symbol === arg);
        if (!asset) {
          await ctx.reply(`No data for ${arg} in the latest snap.`);
          return;
        }
        await ctx.reply(preBlock(formatAssetBlock(asset)), { parse_mode: 'HTML' });
        return;
      }

      for (const message of formatSnap(snap)) {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }
    } catch (err) {
      log.error(`/snap failed: ${err}`);
      await ctx.reply('Error fetching snap. Please try again.').catch(() => {});
    }
  });
}

function registerReportCommand(bot: Telegraf, { reportStore }: CommandContext): void {
  bot.command('report', async (ctx) => {
    const arg = readArg(ctx.message.text);

    try {
      const report = await reportStore.getLatest();
      if (!report) {
        await ctx.reply('No daily report available yet.');
        return;
      }

      if (arg) {
        const asset = report.assets.find((a) => a.label === arg || a.symbol === arg);
        if (!asset) {
          await ctx.reply(`No report data for ${arg}.`);
          return;
        }
        await ctx.reply(formatAssetDetail(asset), { parse_mode: 'HTML' });
        return;
      }

      for (const message of formatDailyReport(report)) {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }
    } catch (err) {
      log.error(`/report failed: ${err}`);
      await ctx.reply('Error fetching report. Please try again.').catch(() => {});
    }
  });
}

/** `/today` — just the fired signals, nothing else. */
function registerTodayCommand(bot: Telegraf, { reportStore }: CommandContext): void {
  bot.command('today', async (ctx) => {
    try {
      const report = await reportStore.getLatest();
      if (!report) {
        await ctx.reply('No daily report available yet.');
        return;
      }

      if (report.topOpportunities.length === 0) {
        await ctx.reply(
          `<b>${report.date}</b> — no fresh entries or exits from strategies with an edge.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const lines = report.topOpportunities.map(formatOpportunityCompact);
      await ctx.reply(`<b>Today — ${report.date}</b>\n${preBlock(lines)}`, {
        parse_mode: 'HTML',
      });
    } catch (err) {
      log.error(`/today failed: ${err}`);
      await ctx.reply('Error fetching opportunities. Please try again.').catch(() => {});
    }
  });
}

const REGISTRARS = [registerSnapCommand, registerReportCommand, registerTodayCommand];

export function registerCommands(bot: Telegraf, ctx: CommandContext): void {
  for (const register of REGISTRARS) register(bot, ctx);
  log.info('registered /snap, /report, /today');
}
