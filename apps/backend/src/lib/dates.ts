/**
 * Date parsing and validation helpers.
 *
 * Two flavours, deliberately separate:
 *   - `isIsoDate` / `parseIsoDate` — strict `YYYY-MM-DD`, for API path params
 *     and stored report keys, where anything else is a client mistake.
 *   - `toEpochMs` — lenient, for data arriving from outside (Yahoo timestamps,
 *     a pasted date), where several common shapes are all legitimate.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a strict `YYYY-MM-DD` string that is also a real calendar date. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  // Round-trips only if the day exists — Date.parse rolls 2025-02-30 forward.
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/**
 * Parse a strict `YYYY-MM-DD` string to epoch milliseconds at UTC midnight.
 * Returns null for anything that is not an exact ISO date.
 */
export function parseIsoDate(value: string): number | null {
  if (!isIsoDate(value)) return null;
  return Date.parse(`${value}T00:00:00Z`);
}

/**
 * True if `value` can be read as a date. Lenient by design: accepts ISO dates,
 * and the `M/D/YYYY`, `D-M-YYYY` and `Month D, YYYY` shapes that show up in
 * exports and copy-paste. Returns false for empty or non-date strings.
 */
export function isDate(value: string): boolean {
  return toEpochMs(value) !== null;
}

/**
 * Best-effort parse of a date-like string to epoch milliseconds.
 *
 * Order matters: ISO first (unambiguous), then slash/dash forms interpreted
 * as month-first (US convention, matching every source FinSnap reads), then
 * anything `Date.parse` still recognises. Returns null when nothing fits.
 */
export function toEpochMs(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  const iso = parseIsoDate(trimmed);
  if (iso !== null) return iso;

  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const ms = Date.UTC(year, month - 1, day);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }

  const fallback = Date.parse(trimmed);
  if (!Number.isFinite(fallback)) return null;
  // `Date.parse` reads bare date/time text as *local* time. Normalize to the
  // UTC midnight of the day it resolved to, so a date-only string means the
  // same instant regardless of the host timezone.
  const local = new Date(fallback);
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate());
}
