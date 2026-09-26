import { createLogger } from '../logger';
import type { Bar, SymbolBars } from '../collectors/types';
import { bollinger, closes, ema, rsi, sma, stdev } from '../backtest/indicators';
import {
  CONTEXT_BARS,
  EMA_CROSS_THRESHOLD_PCT,
  HOUR_MS,
  LIVE_INDICATOR_PERIODS,
  TRAJECTORY,
} from '../constants';
import { resampleCalendar, resampleFixed } from './resample';
import { CrossLabel, Timeframe, Trajectory } from '../constants/enums';
import type { TimeframeAnalysis, AssetAnalysis } from './types';

const log = createLogger('price');

const P = LIVE_INDICATOR_PERIODS;

function lastFinite(series: number[]): number {
  for (let i = series.length - 1; i >= 0; i--) {
    if (Number.isFinite(series[i])) return series[i];
  }
  return 0;
}

/** Recent slope of an EMA series, as a coarse direction label. */
function trajectory(series: number[], lookback = TRAJECTORY.lookback): Trajectory {
  const finite = series.filter((v) => Number.isFinite(v));
  if (finite.length < lookback + 1) return Trajectory.Flat;

  const recent = finite.slice(-lookback);
  const older = finite.slice(-(lookback + 1), -1);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
  if (olderAvg === 0) return Trajectory.Flat;

  const changePct = ((recentAvg - olderAvg) / olderAvg) * 100;
  if (changePct > TRAJECTORY.thresholdPct) return Trajectory.Rising;
  if (changePct < -TRAJECTORY.thresholdPct) return Trajectory.Falling;
  return Trajectory.Flat;
}

function crossoverLabel(fastEma: number, slowEma: number): CrossLabel {
  if (slowEma === 0) return CrossLabel.Neutral;
  const spreadPct = ((fastEma - slowEma) / slowEma) * 100;
  if (spreadPct > EMA_CROSS_THRESHOLD_PCT) return CrossLabel.Bullish;
  if (spreadPct < -EMA_CROSS_THRESHOLD_PCT) return CrossLabel.Bearish;
  return CrossLabel.Converging;
}

const EMPTY_TF: Omit<TimeframeAnalysis, 'timeframe'> = {
  open: 0,
  close: 0,
  high: 0,
  low: 0,
  changePct: 0,
  volume: 0,
  sma20: 0,
  stdDev20: 0,
  bollinger: {
    middle: 0,
    std2: { upper: 0, lower: 0 },
    std3: { upper: 0, lower: 0 },
    bandwidth: 0,
    percentB: 0.5,
  },
  ema20: 0,
  ema50: 0,
  ema20AboveEma50: false,
  emaCrossLabel: CrossLabel.Neutral,
  ema20Trajectory: Trajectory.Flat,
  ema50Trajectory: Trajectory.Flat,
  rsi14: 50,
};

/**
 * Analyze one timeframe.
 *
 * `changePct` is the move across the most recent completed bar of this
 * timeframe — so the D row is the day's change and the W row is the week's,
 * rather than every row measuring the same underlying span.
 */
function analyzeTimeframe(bars: Bar[], timeframe: Timeframe): TimeframeAnalysis {
  if (bars.length === 0) return { ...EMPTY_TF, timeframe };

  const window = bars.slice(-CONTEXT_BARS);
  const price = closes(window);
  const last = window[window.length - 1];

  const bb = bollinger(price, P.bollinger, P.bollingerStd2);
  const bb3 = bollinger(price, P.bollinger, P.bollingerStd3);
  const ema20Series = ema(price, P.emaFast);
  const ema50Series = ema(price, P.emaSlow);

  const ema20 = lastFinite(ema20Series);
  const ema50 = lastFinite(ema50Series);
  const middle = lastFinite(bb.middle);

  return {
    timeframe,
    open: last.open,
    close: last.close,
    high: last.high,
    low: last.low,
    changePct: last.open > 0 ? ((last.close - last.open) / last.open) * 100 : 0,
    volume: last.volume,
    sma20: lastFinite(sma(price, P.sma)),
    stdDev20: lastFinite(stdev(price, P.sma)),
    bollinger: {
      middle,
      std2: { upper: lastFinite(bb.upper), lower: lastFinite(bb.lower) },
      std3: { upper: lastFinite(bb3.upper), lower: lastFinite(bb3.lower) },
      bandwidth: lastFinite(bb.bandwidth),
      percentB: Number.isFinite(bb.percentB[bb.percentB.length - 1])
        ? bb.percentB[bb.percentB.length - 1]
        : 0.5,
    },
    ema20,
    ema50,
    ema20AboveEma50: ema20 > ema50,
    emaCrossLabel: crossoverLabel(ema20, ema50),
    ema20Trajectory: trajectory(ema20Series),
    ema50Trajectory: trajectory(ema50Series),
    rsi14: lastFinite(rsi(price, P.rsi)) || 50,
  };
}

/**
 * Build the multi-timeframe view for one asset.
 *
 * 4H is resampled from hourly bars and W/M from daily bars, because Yahoo does
 * not serve those intervals directly. Timeframes with no underlying data are
 * omitted rather than zero-filled, so a thinly traded ticker does not report a
 * flat 5M candle that never existed.
 */
export function analyzeAssetBars(label: string, bars: SymbolBars): AssetAnalysis {
  const daily = bars.daily?.bars ?? [];
  const hourly = bars.hourly?.bars ?? [];
  const intraday = bars.intraday5m?.bars ?? [];

  const candidates: [Timeframe, Bar[]][] = [
    [Timeframe.M5, intraday],
    [Timeframe.H1, hourly],
    [Timeframe.H4, hourly.length > 0 ? resampleFixed(hourly, 4 * HOUR_MS) : []],
    [Timeframe.D, daily],
    [Timeframe.W, daily.length > 0 ? resampleCalendar(daily, 'week') : []],
    [Timeframe.M, daily.length > 0 ? resampleCalendar(daily, 'month') : []],
    // Yearly needs deep history to say anything; assets listed a few years
    // ago simply produce too few candles and are filtered out below.
    [Timeframe.Y, daily.length > 0 ? resampleCalendar(daily, 'year') : []],
  ];

  const timeframes = candidates
    .filter(([, series]) => series.length > 0)
    .map(([timeframe, series]) => analyzeTimeframe(series, timeframe));

  const currentPrice =
    intraday[intraday.length - 1]?.close ??
    hourly[hourly.length - 1]?.close ??
    daily[daily.length - 1]?.close ??
    0;

  // Fraction of bullish structure across timeframes, 0-100.
  let bullish = 0;
  let total = 0;
  for (const tf of timeframes) {
    if (tf.ema20AboveEma50) bullish += 1;
    if (tf.changePct > 0) bullish += 0.5;
    if (tf.ema20Trajectory === Trajectory.Rising) bullish += 0.5;
    total += 2;
  }
  const marketMomentum = Math.round(
    Math.min(100, Math.max(0, total > 0 ? (bullish / total) * 100 : 50))
  );

  log.info(
    `${label} $${currentPrice.toFixed(2)} | momentum ${marketMomentum}/100 | ` +
      timeframes.map((tf) => `${tf.timeframe} ${tf.changePct.toFixed(1)}%`).join(' ')
  );

  return { currentPrice, timeframes, marketMomentum };
}
