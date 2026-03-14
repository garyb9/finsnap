export function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

import { theme } from '../styles/theme';

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

export function relativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}
