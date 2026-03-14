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

function fmtPrice(n: number): string {
  return n >= 1000 ? n.toFixed(0) : n.toFixed(2);
}

function timeframeSentimentLabel(
  changePct: number,
  ema20AboveEma50: boolean,
  ema20Trajectory: string,
  percentB: number
): string {
  let score = 50;
  score += Math.max(-20, Math.min(20, changePct * 10));
  if (ema20AboveEma50) score += 10;
  else score -= 10;
  if (ema20Trajectory === 'rising') score += 5;
  else if (ema20Trajectory === 'falling') score -= 5;
  score += (percentB - 0.5) * 20;
  score = Math.max(0, Math.min(100, score));
  const labels = [
    'extreme fear',
    'fear',
    'anxiety',
    'unease',
    'neutral',
    'cautious',
    'optimism',
    'greed',
    'euphoria',
    'extreme greed',
  ];
  return labels[Math.min(Math.floor((score / 100) * labels.length), labels.length - 1)];
}

function emaRelation(emaVal: number, price: number, otherEma: number, otherLabel: string): string {
  const parts: string[] = [];
  if (emaVal > price) parts.push('above price');
  else if (emaVal < price) parts.push('below price');
  else parts.push('at price');
  if (emaVal > otherEma) parts.push(`above ${otherLabel}`);
  else if (emaVal < otherEma) parts.push(`below ${otherLabel}`);
  else parts.push(`= ${otherLabel}`);
  return parts.join(', ');
}

function emaSpreadLabel(ema20: number, ema50: number): string {
  if (ema50 === 0) return '';
  const spread = ((ema20 - ema50) / ema50) * 100;
  const abs = Math.abs(spread);
  if (abs < 0.1) return '→ converged, indecision';
  if (spread > 0 && abs >= 1) return '→ bullish, strong separation';
  if (spread > 0 && abs >= 0.3) return '→ bullish lean';
  if (spread > 0) return '→ slightly bullish, converging';
  if (spread < 0 && abs >= 1) return '→ bearish, strong separation';
  if (spread < 0 && abs >= 0.3) return '→ bearish lean';
  return '→ slightly bearish, converging';
}

function bbWidthLabel(bw: number): string {
  if (bw < 2) return 'tight';
  if (bw < 5) return 'moderate';
  return 'wide';
}

function bbPositionLabel(pctB: number): string {
  if (pctB >= 0.8) return 'upper band';
  if (pctB >= 0.6) return 'upper half';
  if (pctB >= 0.4) return 'mid';
  if (pctB >= 0.2) return 'lower half';
  return 'lower band';
}

function formatOptionsInsightLine(
  price: number,
  exp: FinSnap['equities'][string]['expirations'][number]
): string {
  const insight = exp.insight;
  if (!insight) return '';
  if (insight.label === 'balanced' || insight.label === 'thin') return '';

  const side =
    insight.dominantSide === 'puts' ? 'Puts' : insight.dominantSide === 'calls' ? 'Calls' : '';
  if (!side) return '';

  const strike = insight.wallStrike || price + insight.distanceToSpotAbs;
  const pct = insight.distanceToSpotPct;
  const sign = pct >= 0 ? '+' : '';

  const zone = insight.dominantSide === 'puts' ? 'potential dip zone' : 'potential squeeze/ceiling';

  const clusterNote = insight.nearSpotCluster ? ' (cluster near spot)' : '';

  return `    ↳ ${side} stacking near $${fmtNum(strike, 2)} (${sign}${pct.toFixed(
    1
  )}% vs spot) — ${zone}${clusterNote}`;
}

function formatEthBlock(snap: FinSnap): string {
  if (!snap.eth) return '';
  const eth = snap.eth;
  const p = eth.currentPrice;

  const displayTfs = eth.timeframes.filter((tf) => ['5M', '1H', '4H', 'D'].includes(tf.timeframe));
  const daily =
    eth.timeframes.find((tf) => tf.timeframe === 'D') ?? eth.timeframes[eth.timeframes.length - 1];

  if (!daily || p === 0) return '';

  const sentimentLine = displayTfs
    .map((tf) => {
      const label = timeframeSentimentLabel(
        tf.changePct,
        tf.ema20AboveEma50,
        tf.ema20Trajectory,
        tf.bollinger.percentB
      );
      const sign = tf.changePct >= 0 ? '+' : '';
      return `${tf.timeframe} ${sign}${tf.changePct.toFixed(1)}% ${label}`;
    })
    .join(' | ');

  const ema20Rel = emaRelation(daily.ema20, p, daily.ema50, '50');
  const ema50Rel = emaRelation(daily.ema50, p, daily.ema20, '20');
  const spreadNote = emaSpreadLabel(daily.ema20, daily.ema50);
  const bb = daily.bollinger;

  return [
    `ETH $${fmtPrice(p)}`,
    `  ${sentimentLine}`,
    `  EMA20 $${fmtPrice(daily.ema20)} — ${ema20Rel}, ${daily.ema20Trajectory}`,
    `  EMA50 $${fmtPrice(daily.ema50)} — ${ema50Rel}, ${daily.ema50Trajectory}`,
    `  EMA  ${spreadNote}`,
    `  BB σ2 $${fmtPrice(bb.std2.lower)}–$${fmtPrice(bb.std2.upper)}`,
    `     σ3 $${fmtPrice(bb.std3.lower)}–$${fmtPrice(bb.std3.upper)}`,
    `     BW ${bb.bandwidth.toFixed(1)}% (${bbWidthLabel(bb.bandwidth)})  %B ${bb.percentB.toFixed(2)} (${bbPositionLabel(bb.percentB)})`,
  ].join('\n');
}

function formatBtcBlock(snap: FinSnap): string {
  if (!snap.btc) return '';
  const btc = snap.btc;
  const p = btc.currentPrice;

  const displayTfs = btc.timeframes.filter((tf) => ['5M', '1H', '4H', 'D'].includes(tf.timeframe));
  const daily =
    btc.timeframes.find((tf) => tf.timeframe === 'D') ?? btc.timeframes[btc.timeframes.length - 1];

  if (!daily || p === 0) return '';

  const sentimentLine = displayTfs
    .map((tf) => {
      const label = timeframeSentimentLabel(
        tf.changePct,
        tf.ema20AboveEma50,
        tf.ema20Trajectory,
        tf.bollinger.percentB
      );
      const sign = tf.changePct >= 0 ? '+' : '';
      return `${tf.timeframe} ${sign}${tf.changePct.toFixed(1)}% ${label}`;
    })
    .join(' | ');

  const ema20Rel = emaRelation(daily.ema20, p, daily.ema50, '50');
  const ema50Rel = emaRelation(daily.ema50, p, daily.ema20, '20');
  const spreadNote = emaSpreadLabel(daily.ema20, daily.ema50);
  const bb = daily.bollinger;

  return [
    `BTC $${fmtPrice(p)}`,
    `  ${sentimentLine}`,
    `  EMA20 $${fmtPrice(daily.ema20)} — ${ema20Rel}, ${daily.ema20Trajectory}`,
    `  EMA50 $${fmtPrice(daily.ema50)} — ${ema50Rel}, ${daily.ema50Trajectory}`,
    `  EMA  ${spreadNote}`,
    `  BB σ2 $${fmtPrice(bb.std2.lower)}–$${fmtPrice(bb.std2.upper)}`,
    `     σ3 $${fmtPrice(bb.std3.lower)}–$${fmtPrice(bb.std3.upper)}`,
    `     BW ${bb.bandwidth.toFixed(1)}% (${bbWidthLabel(bb.bandwidth)})  %B ${bb.percentB.toFixed(
      2
    )} (${bbPositionLabel(bb.percentB)})`,
  ].join('\n');
}

function formatMarketBlock(snap: FinSnap): string {
  if (!snap.mood) return '';
  const { mood } = snap;
  const tsmomAssets: string[] = [];
  if (snap.btc) tsmomAssets.push(`BTC ${snap.btc.tsmom.score} ${snap.btc.tsmom.label}`);
  if (snap.eth) tsmomAssets.push(`ETH ${snap.eth.tsmom.score} ${snap.eth.tsmom.label}`);
  const tsmomLine = tsmomAssets.length > 0 ? `TSMOM  ${tsmomAssets.join(' | ')}` : '';
  return [
    `— market —`,
    `F/G ${mood.fearGreed.value} (${mood.fearGreed.label})  Momentum ${mood.priceMomentum.value} (${mood.priceMomentum.label})`,
    tsmomLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatTickerBlock(ticker: string, eq: FinSnap['equities'][string]): string {
  const lines = [`${ticker}  $${fmtNum(eq.price, 2)}`];
  if (eq.description) lines.push(`  ${eq.description}`);
  for (const exp of eq.expirations.slice(0, 6)) {
    lines.push(
      `  ${exp.date}  P/C ${exp.pcRatio.toFixed(2)}`,
      `    C $${fmtNum(exp.calls.weightedMeanStrike, 2)} ±${fmtNum(exp.calls.weightedStdStrike, 2)}  vol ${fmtK(exp.calls.totalVolume)}  OI ${fmtK(exp.calls.totalOI)}`,
      `    P $${fmtNum(exp.puts.weightedMeanStrike, 2)} ±${fmtNum(exp.puts.weightedStdStrike, 2)}  vol ${fmtK(exp.puts.totalVolume)}  OI ${fmtK(exp.puts.totalOI)}`
    );
    const insightLine = formatOptionsInsightLine(eq.price, exp);
    if (insightLine) lines.push(insightLine);
  }
  return `<pre>${escapeHtml(lines.join('\n'))}</pre>`;
}

function formatSnap(snap: FinSnap): string[] {
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

  // --- One message per ticker ---
  const tickerMsgs = Object.entries(snap.equities).map(([ticker, eq]) =>
    formatTickerBlock(ticker, eq)
  );

  // --- Last message: price analysis + market ---
  const btcBlock = formatBtcBlock(snap);
  const ethBlock = formatEthBlock(snap);
  const marketBlock = formatMarketBlock(snap);
  const onChainBlock = [
    `— ETH on-chain —`,
    `Block ${snap.blockHeight.toLocaleString()}`,
    `Gas ${fmtNum(onChain.gas.averageGwei)} gwei (${onChain.gas.trend})  Stress ${onChain.gas.congestionScore}${snap.mood ? ` (${snap.mood.networkStress.label})` : ''}`,
    `Whales ${onChain.whale.count}  ${fmtNum(onChain.whale.totalValueEth, 0)} ETH  Energy ${onChain.whale.energyScore}${snap.mood ? ` (${snap.mood.whaleEnergy.label})` : ''}`,
    `Vol ${fmtNum(onChain.volume.totalValueEth, 0)} ETH  ${fmtK(onChain.volume.txCount)} txns  ${onChain.volume.intensityScore}${snap.mood ? ` (${snap.mood.volumeCharacter.label})` : ''}`,
  ].join('\n');

  const msgPriceParts = [btcBlock, ethBlock, onChainBlock, marketBlock].filter(Boolean);
  const msgPrice =
    msgPriceParts.length > 0 ? `<pre>${escapeHtml(msgPriceParts.join('\n\n'))}</pre>` : '';

  return [msg1, ...tickerMsgs, msgPrice].filter(Boolean);
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
    const messages = formatSnap(snap);
    for (let i = 0; i < messages.length; i++) {
      const label =
        i === 0 ? 'summary' : i === messages.length - 1 ? 'price/market' : `options[${i}]`;
      try {
        await this.bot.telegram.sendMessage(this.channelId, messages[i], { parse_mode: 'HTML' });
        log.info(`sent ${label} (${messages[i].length} chars) for snap ${snap.id}`);
      } catch (err) {
        log.error(`failed to send ${label}: ${err}`);
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
            const insightLine = formatOptionsInsightLine(eq.price, exp);
            if (insightLine) lines.push(insightLine);
          }
          await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
          return;
        }

        // Default: full snap summary
        const messages = formatSnap(snap);
        for (const msg of messages) {
          await ctx.reply(msg, { parse_mode: 'HTML' });
        }
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
