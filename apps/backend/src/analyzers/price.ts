import { createLogger } from '../logger';
import type { PricePoint, VolumePoint, AssetPriceDataSet } from '../collectors/types';
import type {
  Timeframe,
  TimeframeAnalysis,
  BollingerBands,
  AssetAnalysis,
  EthAnalysis,
} from './types';

const log = createLogger('price');

// --- Math helpers ---

function computeSMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const window = prices.slice(-period);
  return window.reduce((s, p) => s + p, 0) / window.length;
}

function computeStdDev(prices: number[], period: number): number {
  if (prices.length < 2) return 0;
  const window = prices.slice(-period);
  const mean = window.reduce((s, p) => s + p, 0) / window.length;
  const variance = window.reduce((s, p) => s + (p - mean) ** 2, 0) / window.length;
  return Math.sqrt(variance);
}

function computeBollinger(prices: number[], period = 20): BollingerBands {
  const middle = computeSMA(prices, period);
  const stdDev = computeStdDev(prices, period);

  const std2 = { upper: middle + 2 * stdDev, lower: middle - 2 * stdDev };
  const std3 = { upper: middle + 3 * stdDev, lower: middle - 3 * stdDev };

  const bandwidth = middle > 0 ? ((std2.upper - std2.lower) / middle) * 100 : 0;
  const current = prices.length > 0 ? prices[prices.length - 1] : middle;
  const percentB =
    std2.upper !== std2.lower ? (current - std2.lower) / (std2.upper - std2.lower) : 0.5;

  return { middle, std2, std3, bandwidth, percentB };
}

function computeEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  if (prices.length < period) {
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    return prices.map(() => avg);
  }

  const k = 2 / (period + 1);
  const ema: number[] = [];
  const sma = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  for (let i = 0; i < period; i++) ema.push(sma);
  for (let i = period; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function trajectory(emaSeries: number[], lookback = 5): string {
  if (emaSeries.length < lookback + 1) return 'flat';
  const recent = emaSeries.slice(-lookback);
  const older = emaSeries.slice(-(lookback + 1), -1);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
  const changePct = ((recentAvg - olderAvg) / olderAvg) * 100;
  if (changePct > 0.2) return 'rising';
  if (changePct < -0.2) return 'falling';
  return 'flat';
}

function crossoverLabel(ema20: number, ema50: number): string {
  if (ema50 === 0) return 'neutral';
  const spread = ((ema20 - ema50) / ema50) * 100;
  if (spread > 1) return 'bullish crossover';
  if (spread < -1) return 'bearish crossover';
  return 'converging';
}

// --- Timeframe slicing ---

function sliceRecent(points: PricePoint[], hoursBack: number): PricePoint[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  return points.filter((p) => p.timestamp >= cutoff);
}

function sliceVolumes(volumes: VolumePoint[], hoursBack: number): VolumePoint[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  return volumes.filter((v) => v.timestamp >= cutoff);
}

const EMPTY_TF: TimeframeAnalysis = {
  timeframe: '5M',
  open: 0,
  close: 0,
  high: 0,
  low: 0,
  changePct: 0,
  volumeUsd: 0,
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
  emaCrossLabel: 'neutral',
  ema20Trajectory: 'flat',
  ema50Trajectory: 'flat',
};

function analyzeTimeframe(
  prices: PricePoint[],
  volumes: VolumePoint[],
  timeframe: Timeframe
): TimeframeAnalysis {
  if (prices.length === 0) return { ...EMPTY_TF, timeframe };

  const priceValues = prices.map((p) => p.price);
  const open = priceValues[0];
  const close = priceValues[priceValues.length - 1];
  const high = Math.max(...priceValues);
  const low = Math.min(...priceValues);
  const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
  const volumeUsd = volumes.length > 0 ? volumes[volumes.length - 1].volume : 0;

  const sma20 = computeSMA(priceValues, 20);
  const stdDev20 = computeStdDev(priceValues, 20);
  const bollinger = computeBollinger(priceValues, 20);

  const ema20Series = computeEMA(priceValues, 20);
  const ema50Series = computeEMA(priceValues, 50);
  const ema20 = ema20Series.at(-1) ?? 0;
  const ema50 = ema50Series.at(-1) ?? 0;

  return {
    timeframe,
    open,
    close,
    high,
    low,
    changePct,
    volumeUsd,
    sma20,
    stdDev20,
    bollinger,
    ema20,
    ema50,
    ema20AboveEma50: ema20 > ema50,
    emaCrossLabel: crossoverLabel(ema20, ema50),
    ema20Trajectory: trajectory(ema20Series),
    ema50Trajectory: trajectory(ema50Series),
  };
}

// --- Main exports ---

export function analyzeAssetPrices(asset: string, dataSet: AssetPriceDataSet): AssetAnalysis {
  const d1 = dataSet.day1 ?? { prices: [], volumes: [] };
  const d7 = dataSet.day7 ?? { prices: [], volumes: [] };
  const d30 = dataSet.day30 ?? { prices: [], volumes: [] };

  const currentPrice = d1.prices.at(-1)?.price ?? 0;

  const timeframes: TimeframeAnalysis[] = [
    analyzeTimeframe(sliceRecent(d1.prices, 5 / 60), sliceVolumes(d1.volumes, 5 / 60), '5M'),
    analyzeTimeframe(sliceRecent(d1.prices, 1), sliceVolumes(d1.volumes, 1), '1H'),
    analyzeTimeframe(sliceRecent(d1.prices, 4), sliceVolumes(d1.volumes, 4), '4H'),
    analyzeTimeframe(d1.prices, d1.volumes, 'D'),
    analyzeTimeframe(d7.prices, d7.volumes, 'W'),
    analyzeTimeframe(d30.prices, d30.volumes, 'M'),
  ];

  // Market momentum: fraction of bullish signals across timeframes
  let bullish = 0;
  let total = 0;
  for (const tf of timeframes) {
    total++;
    if (tf.ema20AboveEma50) bullish += 1;
    if (tf.changePct > 0) bullish += 0.5;
    if (tf.ema20Trajectory === 'rising') bullish += 0.5;
    total += 1;
  }
  const marketMomentum = Math.round(
    Math.min(100, Math.max(0, total > 0 ? (bullish / total) * 100 : 50))
  );

  log.info(
    `${asset} $${currentPrice.toFixed(2)} | momentum ${marketMomentum}/100 | ` +
      timeframes
        .filter((tf) => ['5M', '1H', '4H', 'D'].includes(tf.timeframe))
        .map((tf) => `${tf.timeframe} ${tf.changePct.toFixed(1)}%`)
        .join(' ')
  );

  return { currentPrice, timeframes, marketMomentum };
}

export function analyzeEthPrices(dataSet: AssetPriceDataSet): EthAnalysis {
  return analyzeAssetPrices('ETH', dataSet);
}

export function analyzeBtcPrices(dataSet: AssetPriceDataSet): AssetAnalysis {
  return analyzeAssetPrices('BTC', dataSet);
}
