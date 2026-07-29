import { OptionsSide, OptionsSkewLabel } from '../types/enums';
import type { AssetSnap, OptionsExpiration } from '../types/finsnap';

/**
 * Chain-level arithmetic for the options tab.
 *
 * The snapshot arrives as a list of expiries, each self-contained. Every
 * question worth asking on that page is a question *across* expiries — is the
 * whole chain leaning long, where do the walls actually sit, which date carries
 * the weight — so the summing happens once here rather than inline in the view.
 */

/** One expiry's wall, lifted out of its row so walls can be ranked against each other. */
export type Wall = {
  date: string;
  side: OptionsSide.Calls | OptionsSide.Puts;
  strike: number;
  /** Signed: positive is above spot. */
  distancePct: number;
  /** The dominant side clustered right on top of spot. */
  nearSpot: boolean;
  /** The lean is there but weak — worth showing, not worth acting on. */
  soft: boolean;
  /**
   * Open interest on the wall's own side for that expiry.
   *
   * The chain gives per-expiry totals, not per-strike ones, so this is the
   * weight behind the side that owns the wall — not the contracts sitting on
   * that exact strike. It ranks walls against each other honestly; it is not a
   * count of the strike itself.
   */
  sideOI: number;
};

export type ChainSummary = {
  expiries: number;
  firstDate: string | null;
  lastDate: string | null;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
  /** Put/call on open interest — what is already positioned. */
  oiPutCall: number | null;
  /** Put/call on today's volume — what is being positioned right now. */
  volumePutCall: number | null;
  /** Every expiry that carries a wall, nearest to spot first. */
  walls: Wall[];
  /** The wall spot would run into first. */
  nearest: Wall | null;
  /** The wall with the most open interest behind it. */
  heaviest: Wall | null;
  callWalls: number;
  putWalls: number;
};

const SOFT_LABELS: OptionsSkewLabel[] = [OptionsSkewLabel.SoftCall, OptionsSkewLabel.SoftPut];

/** The wall on one expiry, or null where the expiry is balanced, thin or one-sided in name only. */
export function wallOf(exp: OptionsExpiration): Wall | null {
  const insight = exp.insight;
  if (!insight) return null;
  if (insight.dominantSide === OptionsSide.None) return null;
  if (insight.label === OptionsSkewLabel.Balanced || insight.label === OptionsSkewLabel.Thin) {
    return null;
  }

  const side = insight.dominantSide === OptionsSide.Calls ? OptionsSide.Calls : OptionsSide.Puts;
  return {
    date: exp.date,
    side,
    strike: insight.wallStrike,
    distancePct: insight.distanceToSpotPct,
    nearSpot: insight.nearSpotCluster,
    soft: SOFT_LABELS.includes(insight.label),
    sideOI: side === OptionsSide.Calls ? exp.calls.totalOI : exp.puts.totalOI,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function summarizeChain(expirations: OptionsExpiration[]): ChainSummary {
  const callOI = expirations.reduce((s, e) => s + e.calls.totalOI, 0);
  const putOI = expirations.reduce((s, e) => s + e.puts.totalOI, 0);
  const callVolume = expirations.reduce((s, e) => s + e.calls.totalVolume, 0);
  const putVolume = expirations.reduce((s, e) => s + e.puts.totalVolume, 0);

  const walls = expirations
    .map(wallOf)
    .filter((w): w is Wall => w !== null)
    .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));

  const dates = expirations.map((e) => e.date).sort();

  return {
    expiries: expirations.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    callOI,
    putOI,
    callVolume,
    putVolume,
    oiPutCall: ratio(putOI, callOI),
    volumePutCall: ratio(putVolume, callVolume),
    walls,
    nearest: walls[0] ?? null,
    heaviest: walls.reduce<Wall | null>(
      (best, w) => (!best || w.sideOI > best.sideOI ? w : best),
      null
    ),
    callWalls: walls.filter((w) => w.side === OptionsSide.Calls).length,
    putWalls: walls.filter((w) => w.side === OptionsSide.Puts).length,
  };
}

/** Every asset carrying a usable chain, in the order the snapshot listed them. */
export function assetsWithChains(assets: AssetSnap[]): AssetSnap[] {
  return assets.filter((a) => a.options && a.options.expirations.length > 0);
}

/** 'YYYY-MM-DD' → '29 Jul'. Long enough to place a date, short enough for a stat tile. */
export function shortDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Calendar days from today to an expiry, floored at zero. */
export function daysToExpiry(iso: string, from: Date = new Date()): number {
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.max(0, Math.round((target - today) / 86_400_000));
}
