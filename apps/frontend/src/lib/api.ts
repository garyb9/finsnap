import type { FinSnap } from '../types/finsnap';
import type { Guide } from '../types/guide';
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

export function fetchReport(): Promise<CompactReport | null> {
  return getJson<CompactReport>('/report?strategies=4');
}

export function fetchGuide(): Promise<Guide | null> {
  return getJson<Guide>('/guide');
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
