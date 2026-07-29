import { theme } from '../styles/theme';
import { SignalAction, Verdict } from '../types/enums';

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
