import { theme } from '../styles/theme';
import { AssetCategory, SignalAction, StrategyKind, Verdict } from '../types/enums';

export function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Prices above four figures drop decimals — cents on BTC are noise. */
export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2);
}

/** $1.29T / $781B / $8.2B / $436M — abbreviated, because the digits are noise. */
export function fmtMoneyShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [scale, suffix] of units) {
    if (n >= scale) {
      const scaled = n / scale;
      // Two significant figures below 10, one above: $1.3T and $781B both read
      // cleanly, while $781.4B is more precision than the number deserves.
      return `$${scaled < 10 ? scaled.toFixed(1) : Math.round(scaled)}${suffix}`;
    }
  }
  return `$${Math.round(n)}`;
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function scoreColor(score: number): string {
  if (score >= 60) return theme.colors.success;
  if (score >= 40) return theme.colors.warning;
  return theme.colors.danger;
}

export function scoreDot(score: number): string {
  if (score >= 60) return '●';
  if (score >= 40) return '●';
  return '●';
}

export function changeColor(pct: number): string {
  if (pct > 0) return theme.colors.success;
  if (pct < 0) return theme.colors.danger;
  return theme.colors.textMuted;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return `#${a.map((v, i) => lerp(v, b[i], t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Diverging around 50% — the coin-flip line for "beat buy & hold". A flat
 * three-bucket status scale (the one `scoreColor` uses) reads as a wall of red
 * once most values sit under 40, because 3% and 38% render identically. This
 * interpolates continuously so nearby win rates are visibly different shades:
 * warm toward red below 50, a muted neutral at 50, cool toward green above it.
 */
export function winRateColor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped <= 50) return lerpColor(theme.colors.danger, theme.colors.label, clamped / 50);
  return lerpColor(theme.colors.label, theme.colors.success, (clamped - 50) / 50);
}

/**
 * Colour a value against the rest of its column rather than against a fixed
 * line.
 *
 * Beating buy-and-hold gets steadily harder the longer the horizon, so a
 * scale anchored at 50% paints a twenty-year column entirely red and tells you
 * nothing about which rule held up best in it. Ranking within the column keeps
 * the comparison the eye actually wants to make: best cell greenest, worst
 * reddest, the middle of the spread neutral.
 *
 * Colour therefore means "best in this column", never "good in absolute terms"
 * — the number beside it is what says whether the winner is any good.
 */
export function columnRankColor(value: number, min: number, max: number): string {
  // One distinct value, or a column of identical cells: nothing to rank.
  if (!Number.isFinite(value) || max <= min) return theme.colors.textMuted;

  const t = (value - min) / (max - min);
  return t <= 0.5
    ? lerpColor(theme.colors.danger, theme.colors.label, t * 2)
    : lerpColor(theme.colors.label, theme.colors.success, (t - 0.5) * 2);
}

/**
 * Diverging around 0 — the "no relationship" line for a correlation
 * coefficient. Warm toward red below 0, a muted neutral at 0, cool toward
 * green above it, same construction as `winRateColor` but centered on the
 * coefficient's own natural midpoint instead of a 50% win rate.
 */
export function correlationColor(r: number): string {
  const clamped = Math.max(-1, Math.min(1, r));
  return clamped <= 0
    ? lerpColor(theme.colors.danger, theme.colors.label, clamped + 1)
    : lerpColor(theme.colors.label, theme.colors.success, clamped);
}

// --- Daily report labels ---

export const VERDICT_LABEL: Record<Verdict, string> = {
  [Verdict.StrongBuy]: 'Strong Buy',
  [Verdict.Accumulate]: 'Accumulate',
  [Verdict.Neutral]: 'Neutral',
  [Verdict.Reduce]: 'Reduce',
  [Verdict.Avoid]: 'Avoid',
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  [Verdict.StrongBuy]: theme.colors.success,
  [Verdict.Accumulate]: theme.colors.greenMuted,
  [Verdict.Neutral]: theme.colors.textMuted,
  [Verdict.Reduce]: theme.colors.warning,
  [Verdict.Avoid]: theme.colors.danger,
};

export const ACTION_LABEL: Record<SignalAction, string> = {
  [SignalAction.Enter]: 'Enter',
  [SignalAction.Hold]: 'Hold',
  [SignalAction.Exit]: 'Exit',
  [SignalAction.StayOut]: 'Cash',
};

export const STRATEGY_KIND_LABEL: Record<StrategyKind, string> = {
  [StrategyKind.Benchmark]: 'Benchmark',
  [StrategyKind.Trend]: 'Trend',
  [StrategyKind.Momentum]: 'Momentum',
  [StrategyKind.Breakout]: 'Breakout',
  [StrategyKind.MeanReversion]: 'Mean Reversion',
};

/** One color per strategy family, used by `StrategyKindTag` everywhere a strategy name shows up. */
export const STRATEGY_KIND_COLOR: Record<StrategyKind, string> = {
  [StrategyKind.Benchmark]: theme.colors.label,
  [StrategyKind.Trend]: theme.colors.kindTrend,
  [StrategyKind.Momentum]: theme.colors.kindMomentum,
  [StrategyKind.Breakout]: theme.colors.kindBreakout,
  [StrategyKind.MeanReversion]: theme.colors.kindMeanReversion,
};

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  [AssetCategory.EquityIndex]: 'Market indices',
  [AssetCategory.Sector]: 'Sectors',
  [AssetCategory.Crypto]: 'Crypto',
  [AssetCategory.Commodity]: 'Commodities',
  [AssetCategory.Currency]: 'Currency',
  [AssetCategory.Bond]: 'Bonds',
  [AssetCategory.Stock]: 'Single stocks',
};

export const ACTION_COLOR: Record<SignalAction, string> = {
  [SignalAction.Enter]: theme.colors.success,
  [SignalAction.Hold]: theme.colors.accent,
  [SignalAction.Exit]: theme.colors.danger,
  [SignalAction.StayOut]: theme.colors.label,
};

export function relativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

/**
 * What `capital` becomes after `years` at `cagrPct` a year.
 *
 * Deliberately compounding rather than applying the total return: the report
 * stores an annualized rate, and multiplying it by the number of years would
 * understate every multi-year result.
 */
export function compoundValue(capital: number, cagrPct: number, years: number): number {
  if (!Number.isFinite(cagrPct) || !Number.isFinite(years) || years <= 0) return capital;
  return capital * Math.pow(1 + cagrPct / 100, years);
}

/** $12,450 — whole dollars, because cents on a hypothetical are noise. */
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
