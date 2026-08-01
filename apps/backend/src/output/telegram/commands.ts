import type { Telegraf } from 'telegraf';
import { createLogger } from '../../logger';
import { preBlock } from '../../lib/format';
import { formatAssetDetail, formatDailyReport } from '../../report/format';
import { formatOpportunityCompact } from '../../report/format/opportunity';
import { formatPairDetailLines, formatPairsSection } from '../../report/format/pair';
import { compactPair } from '../../report/compact';
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

/** `/pairs` — every monitored pair and its current regime/direction. */
function registerPairsCommand(bot: Telegraf, { reportStore }: CommandContext): void {
  bot.command('pairs', async (ctx) => {
    try {
      const report = await reportStore.getLatest();
      if (!report) {
        await ctx.reply('No daily report available yet.');
        return;
      }

      const lines = formatPairsSection(report.pairs.map(compactPair));
      if (lines.length === 0) {
        await ctx.reply('No pairs currently pass cointegration testing.');
        return;
      }

      await ctx.reply(preBlock(lines), { parse_mode: 'HTML' });
    } catch (err) {
      log.error(`/pairs failed: ${err}`);
      await ctx.reply('Error fetching pairs. Please try again.').catch(() => {});
    }
  });
}

/** Two tickers written any of "GLD/SLV", "GLD-SLV" or "GLD SLV". */
function parsePairArg(text: string): [string, string] | null {
  const arg = text.split(' ').slice(1).join(' ').trim().toUpperCase();
  const tokens = arg.split(/[/\s-]+/).filter(Boolean);
  return tokens.length === 2 ? [tokens[0], tokens[1]] : null;
}

/** `/pair A/B` — full detail for one pair. */
function registerPairCommand(bot: Telegraf, { reportStore }: CommandContext): void {
  bot.command('pair', async (ctx) => {
    const parsed = parsePairArg(ctx.message.text);
    if (!parsed) {
      await ctx.reply('Usage: /pair GLD/SLV');
      return;
    }

    try {
      const report = await reportStore.getLatest();
      if (!report) {
        await ctx.reply('No daily report available yet.');
        return;
      }

      const [a, b] = parsed;
      const pair = report.pairs.find(
        (p) => (p.legA === a && p.legB === b) || (p.legA === b && p.legB === a)
      );
      if (!pair) {
        await ctx.reply(`No monitored pair matches ${a}/${b}.`);
        return;
      }

      await ctx.reply(preBlock(formatPairDetailLines(pair)), { parse_mode: 'HTML' });
    } catch (err) {
      log.error(`/pair failed: ${err}`);
      await ctx.reply('Error fetching pair. Please try again.').catch(() => {});
    }
  });
}

const REGISTRARS = [
  registerSnapCommand,
  registerReportCommand,
  registerTodayCommand,
  registerPairsCommand,
  registerPairCommand,
];

export function registerCommands(bot: Telegraf, ctx: CommandContext): void {
  for (const register of REGISTRARS) register(bot, ctx);
  log.info('registered /snap, /report, /today, /pairs, /pair');
}
