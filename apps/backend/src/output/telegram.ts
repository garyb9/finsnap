import { Telegraf } from 'telegraf';
import type { Config } from '../config';
import type { SnapStore } from '../storage/snapStore';
import { createLogger } from '../logger';
import type { FinSnap } from '../snapshot/types';

const log = createLogger('telegram');

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scoreDot(score: number): string {
  if (score >= 60) return '🟢';
  if (score >= 40) return '🟡';
  return '🔴';
}

function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatSnap(snap: FinSnap): [string, string] {
  const date = new Date(snap.timestamp).toUTCString();
  const { onChain, signals } = snap;

  // --- Message 1: on-chain summary + signals ---
  const gasDot = scoreDot(100 - signals.gasCongestion);
  const whaleDot = scoreDot(signals.whaleEnergy);
  const volDot = scoreDot(signals.volumeIntensity);
  const overallDot = scoreDot(signals.overallSentiment);

  const msg1 = [
    `<b>FinSnap</b> — <i>${date}</i>`,
    `Block <code>${snap.blockHeight.toLocaleString()}</code>`,
    ``,
    `<b>— On-Chain —</b>`,
    `${gasDot} Gas <b>${fmtNum(onChain.gas.averageGwei)} gwei</b> (${onChain.gas.trend})  Stress ${onChain.gas.congestionScore}/100`,
    `${whaleDot} Whales <b>${onChain.whale.count}</b> txns  ${fmtNum(onChain.whale.totalValueEth, 0)} ETH  Energy ${onChain.whale.energyScore}/100`,
    `${volDot} Volume <b>${fmtNum(onChain.volume.totalValueEth, 0)} ETH</b>  ${fmtK(onChain.volume.txCount)} txns  Intensity ${onChain.volume.intensityScore}/100`,
    ``,
    `<b>— Signals —</b>`,
    `${overallDot} Overall <b>${signals.overallSentiment}/100</b>  |  Stress ${signals.networkStress}  Whale ${signals.whaleEnergy}  Vol ${signals.volumeIntensity}  Gas↓ ${100 - signals.gasCongestion}`,
  ].join('\n');

  // --- Message 2: per-ticker options ---
  const tickers = Object.keys(snap.equities);
  if (tickers.length === 0) {
    return [msg1, ''];
  }

  const tickerBlocks = tickers.map((ticker) => {
    const eq = snap.equities[ticker];
    const lines = [`${ticker}  $${fmtNum(eq.price, 2)}`];

    const exps = eq.expirations.slice(0, 5); // show up to 5 expirations
    for (const exp of exps) {
      const callMean = fmtNum(exp.calls.weightedMeanStrike, 2);
      const callStd = fmtNum(exp.calls.weightedStdStrike, 2);
      const putMean = fmtNum(exp.puts.weightedMeanStrike, 2);
      const putStd = fmtNum(exp.puts.weightedStdStrike, 2);
      lines.push(
        `  ${exp.date}  P/C ${exp.pcRatio.toFixed(2)}`,
        `    C $${callMean} ±${callStd}  vol ${fmtK(exp.calls.totalVolume)}  OI ${fmtK(exp.calls.totalOI)}`,
        `    P $${putMean} ±${putStd}  vol ${fmtK(exp.puts.totalVolume)}  OI ${fmtK(exp.puts.totalOI)}`
      );
    }
    return lines.join('\n');
  });

  const msg2 = `<pre>${escapeHtml(tickerBlocks.join('\n\n'))}</pre>`;

  return [msg1, msg2];
}

export class TelegramOutput {
  private bot: Telegraf;
  private channelId: string;
  private store: SnapStore;

  constructor(config: Config, store: SnapStore) {
    this.bot = new Telegraf(config.telegramBotToken);
    this.channelId = config.telegramChannelId;
    this.store = store;
  }

  async publish(snap: FinSnap): Promise<void> {
    const [msg1, msg2] = formatSnap(snap);

    // Send message 1
    try {
      await this.bot.telegram.sendMessage(this.channelId, msg1, { parse_mode: 'HTML' });
      log.info(`sent summary message (${msg1.length} chars) for snap ${snap.id}`);
    } catch (err) {
      log.error(`failed to send summary message: ${err}`);
    }

    // Send message 2 if we have options data
    if (msg2) {
      try {
        await this.bot.telegram.sendMessage(this.channelId, msg2, { parse_mode: 'HTML' });
        log.info(`sent options message (${msg2.length} chars) for snap ${snap.id}`);
      } catch (err) {
        log.error(`failed to send options message: ${err}`);
      }
    }

    log.info(`published snap ${snap.id} to channel ${this.channelId}`);
  }

  startCommandHandlers(): void {
    this.bot.command('snap', async (ctx) => {
      const arg = ctx.message.text.split(' ').slice(1).join(' ').trim().toLowerCase();

      try {
        const snap = await this.store.getLatest();

        if (!snap) {
          await ctx.reply(
            'No snap available yet. Try again in a few minutes or use /snap trigger.'
          );
          return;
        }

        if (arg === 'eth' || arg === 'onchain') {
          const { onChain, signals } = snap;
          const text = [
            `<b>ETH On-Chain</b> — Block ${snap.blockHeight.toLocaleString()}`,
            ``,
            `Gas ${fmtNum(onChain.gas.averageGwei)} gwei (${onChain.gas.trend})  Stress ${onChain.gas.congestionScore}/100`,
            `Whales ${onChain.whale.count}  ${fmtNum(onChain.whale.totalValueEth, 0)} ETH  Energy ${onChain.whale.energyScore}/100`,
            `Volume ${fmtNum(onChain.volume.totalValueEth, 0)} ETH  ${fmtK(onChain.volume.txCount)} txns  Intensity ${onChain.volume.intensityScore}/100`,
            `Network Stress ${signals.networkStress}/100`,
          ].join('\n');
          await ctx.reply(text, { parse_mode: 'HTML' });
          return;
        }

        if (arg.startsWith('$') || /^[a-z]{1,6}$/i.test(arg)) {
          const ticker = arg.replace('$', '').toUpperCase();
          const eq = snap.equities[ticker];
          if (!eq) {
            await ctx.reply(`No options data for ${ticker} in the latest snap.`);
            return;
          }
          const lines = [`<b>${ticker}</b>  $${fmtNum(eq.price, 2)}`];
          for (const exp of eq.expirations.slice(0, 5)) {
            lines.push(
              `\n<code>${exp.date}</code>  P/C ${exp.pcRatio.toFixed(2)}`,
              `  Calls $${fmtNum(exp.calls.weightedMeanStrike, 2)} ±${fmtNum(exp.calls.weightedStdStrike, 2)}  vol ${fmtK(exp.calls.totalVolume)}`,
              `  Puts  $${fmtNum(exp.puts.weightedMeanStrike, 2)} ±${fmtNum(exp.puts.weightedStdStrike, 2)}  vol ${fmtK(exp.puts.totalVolume)}`
            );
          }
          await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
          return;
        }

        // Default: full snap summary
        const [msg1, msg2] = formatSnap(snap);
        await ctx.reply(msg1, { parse_mode: 'HTML' });
        if (msg2) await ctx.reply(msg2, { parse_mode: 'HTML' });
      } catch (err) {
        log.error(`/snap command error: ${err}`);
        await ctx.reply('Error fetching snap. Please try again.').catch(() => {});
      }
    });

    this.bot.launch().catch((err) => log.error(`bot launch failed: ${err}`));

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));

    log.info('command handlers registered, bot polling started');
  }
}
