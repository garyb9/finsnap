import type { Context } from 'hono';

/** Parse a `?limit=` query with a default and a hard ceiling. */
export function parseLimit(c: Context, fallback: number, max: number): number {
  const raw = parseInt(c.req.query('limit') ?? '', 10);
  const value = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.min(value, max);
}

/** Parse an arbitrary positive-integer query param. */
export function parseCount(c: Context, name: string, fallback: number, max: number): number {
  const raw = parseInt(c.req.query(name) ?? '', 10);
  const value = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.min(value, max);
}

/** True when the caller asked for the unabridged payload. */
export function wantsFullDetail(c: Context): boolean {
  return c.req.query('detail') === 'full';
}

/** Normalize a path param used to look up an asset. */
export function assetKey(raw: string): string {
  return raw.replace('$', '').toUpperCase();
}
