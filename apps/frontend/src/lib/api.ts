import type { CorrelationMatrix } from '../types/correlation';
import type { FinSnap } from '../types/finsnap';
import type { Guide } from '../types/guide';
import type { StrategyLeaderboard } from '../types/leaderboard';
import type { CompactReport } from '../types/report';
import type { SyncJob } from '../types/sync';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * GET a JSON endpoint, returning null on any failure.
 *
 * The dashboard renders whatever it has: a missing report should still leave
 * the live tape and price panels on screen, so failures degrade rather than
 * blank the page.
 */
async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchSnap(): Promise<FinSnap | null> {
  return getJson<FinSnap>('/snap');
}

/**
 * Ten strategies per asset, not four.
 *
 * The consensus count is over every non-benchmark rule in the registry (22 at
 * the time of writing), so showing only four made the "n long" tally above the
 * list look like it contradicted the list underneath it. Ten
 * covers the ones with any real edge on almost every asset, and the expanded
 * view says explicitly how many of the total it is showing.
 */
export function fetchReport(): Promise<CompactReport | null> {
  return getJson<CompactReport>('/report?strategies=10');
}

export function fetchGuide(): Promise<Guide | null> {
  return getJson<Guide>('/guide');
}

/** Which strategy wins, pooled across the whole universe — derives from the latest report. */
export function fetchStrategyLeaderboard(): Promise<StrategyLeaderboard | null> {
  return getJson<StrategyLeaderboard>('/strategies/leaderboard');
}

/** Pairwise price correlation across the universe, over the given lookback window. */
export function fetchCorrelation(windowId: string): Promise<CorrelationMatrix | null> {
  return getJson<CorrelationMatrix>(`/correlation?window=${encodeURIComponent(windowId)}`);
}

export function fetchSyncStatus(): Promise<SyncJob | null> {
  return getJson<SyncJob>('/sync');
}

/**
 * Kick off a sync. Returns the job on success, or null when one is already
 * running (409) — the caller polls either way, so a rejected start is not an
 * error worth surfacing.
 */
export async function startSync(): Promise<SyncJob | null> {
  try {
    const res = await fetch(`${API_BASE}/sync`, { method: 'POST' });
    const body = (await res.json()) as { job?: SyncJob };
    return body.job ?? null;
  } catch {
    return null;
  }
}

export type SearchTickerResult =
  | { ok: true; symbol: string; label: string; expiresAt: string | null }
  | { ok: false; error: string };

/**
 * Pull a ticker into the tracked universe for 24 hours.
 *
 * Unlike the other calls here this surfaces the failure reason rather than
 * swallowing it — a search box that fails silently on a typo just looks
 * broken, so the caller needs the server's actual message to show the user.
 */
export async function searchTicker(symbol: string): Promise<SearchTickerResult> {
  try {
    const res = await fetch(`${API_BASE}/universe/${encodeURIComponent(symbol)}`, {
      method: 'POST',
    });
    const body = (await res.json()) as {
      spec?: { symbol: string; label: string };
      expiresAt?: string | null;
      error?: string;
    };

    if (!res.ok || !body.spec) {
      return { ok: false, error: body.error ?? 'Ticker search failed — try again' };
    }

    return {
      ok: true,
      symbol: body.spec.symbol,
      label: body.spec.label,
      expiresAt: body.expiresAt ?? null,
    };
  } catch {
    return { ok: false, error: 'Could not reach the server — try again' };
  }
}
