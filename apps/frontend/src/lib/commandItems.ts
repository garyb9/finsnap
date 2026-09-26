import type { LucideIcon } from 'lucide-react';
import { NAV_ITEMS } from './navIcons';
import type { AssetSnap } from '../types/finsnap';

export type CommandItemKind = 'route' | 'ticker';

export interface CommandItem {
  kind: CommandItemKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: LucideIcon;
}

export function buildCommandItems(assets: Record<string, AssetSnap> | undefined): CommandItem[] {
  const routes: CommandItem[] = NAV_ITEMS.map((item) => ({
    kind: 'route',
    id: `route:${item.href}`,
    title: item.label,
    href: item.href,
    icon: item.icon,
  }));

  const tickers: CommandItem[] = Object.values(assets ?? {}).map((asset) => ({
    kind: 'ticker',
    id: `ticker:${asset.symbol}`,
    title: asset.label,
    subtitle: asset.symbol,
    href: `/chart?ticker=${encodeURIComponent(asset.symbol)}`,
  }));

  return [...routes, ...tickers];
}

/** Exact > prefix > substring (earlier is better) > subsequence > no match (-1). */
function score(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const idx = t.indexOf(q);
  if (idx >= 0) return 60 - idx;

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 20 : -1;
}

function scoreItem(query: string, item: CommandItem): number {
  return Math.max(score(query, item.title), item.subtitle ? score(query, item.subtitle) : -1);
}

export function searchCommandItems(query: string, items: CommandItem[]): CommandItem[] {
  const trimmed = query.trim();
  if (!trimmed) return items;

  return items
    .map((item) => ({ item, s: scoreItem(trimmed, item) }))
    .filter(({ s }) => s >= 0)
    .sort((a, b) => b.s - a.s)
    .map(({ item }) => item);
}
