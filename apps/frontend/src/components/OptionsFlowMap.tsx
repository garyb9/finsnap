import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { ChartTooltip } from './ChartTooltip';
import { ExpTable, ExpTableScroll } from './Card';
import { theme } from '../styles/theme';
import { fmtK, fmtNum } from '../lib/format';
import { daysToExpiry, shortDate, summarizeChain, wallOf, type Wall } from '../lib/options';
import { OptionsSide } from '../types/enums';
import type { AssetSnap } from '../types/finsnap';

/**
 * Every featured chain's walls, on one shared axis.
 *
 * The per-ticker "wall price by expiry" chart answers one chain at a time, in
 * that chain's own dollar terms. This is the same question across every
 * featured name at once, which raw strike price can't answer side by
 * side — SPY's wall sits in the 500s, XLF's in the 40s. Distance from spot,
 * in percent, is the number that means the same thing for both, so it is
 * what goes on the shared axis; the actual strike price is one hover away.
 *
 * Colour here means ticker identity, not call/put — a different job for
 * colour than the rest of this page, where green/red always means call/put.
 * Side is instead carried by the marker's own shape (▲ call wall, ▼ put
 * wall), same glyphs the per-ticker chart uses, just tinted by ticker rather
 * than by side. Past ~8 lines no fixed palette stays pairwise distinct (see
 * the dataviz palette notes), so identity leans on hover isolation and the
 * legend/tooltip text as much as on hue — never on colour alone.
 */

const TICKER_COLORS = [
  '#4f9bf0', // blue
  '#f08a3c', // orange
  '#22b8a3', // teal
  '#e0b23c', // amber
  '#e07ab0', // magenta
  '#9b7ee0', // violet
  '#3cc4d9', // cyan
  '#7d90e8', // periwinkle
  '#d6905c', // copper
  '#c76bd1', // orchid
  '#6fb8e0', // sky
  '#8fa8d9', // slate
];

/** The graph's own horizon — a LEAPS date months out would stretch the axis
 * until every near-term point the reader actually came for bunches up on the
 * left. Chart only; the compare table below still reads the whole chain. */
const MAX_DAYS_OUT = 90;

/** Safety cap once a chain has more weeklies inside that horizon than are worth plotting at once. */
const MAX_POINTS_PER_TICKER = 16;

/**
 * VXX's walls sit far from every equity/commodity chain's percent range —
 * its line runs almost flat near the top of the axis and drags the shared
 * scale with it, crowding out the names the reader actually came to compare.
 * Off by default; the checkbox below the chart opts back in.
 */
const VOLATILITY_SYMBOL = 'VXX';

const VIEW_W = 1160;
const VIEW_H = 340;
const PAD = { top: 20, right: 100, bottom: 44, left: 46 };
const X_TICKS = 6;
const Y_TICKS = 5;

type SeriesPoint = {
  date: string;
  t: number;
  side: Wall['side'];
  strike: number;
  /** Signed: positive is above spot. Clamped to the axis span for plotting. */
  distancePct: number;
  soft: boolean;
  nearSpot: boolean;
  sideOI: number;
  /** True distance exceeds the axis span — drawn pinned to the edge. */
  clamped: boolean;
};

type Series = {
  symbol: string;
  label: string;
  color: string;
  /** The chain's underlying price — same figure the per-ticker tab shows as its header. */
  spot: number;
  points: SeriesPoint[];
};

type PlottedPoint = SeriesPoint & { value: number };
type PlottedSeries = Omit<Series, 'points'> & { points: PlottedPoint[] };

type Tip = { x: number; y: number; series: Series; point: PlottedPoint };

type ViewMode = 'percent' | 'price' | 'notional';

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'percent', label: 'Percent (%)' },
  { mode: 'price', label: 'Price ($)' },
  { mode: 'notional', label: 'Wall size ($)' },
];

function rawValue(mode: ViewMode, p: SeriesPoint, spot: number): number {
  return mode === 'price' ? p.strike - spot : p.distancePct;
}

function notionalOf(p: SeriesPoint): number {
  return p.sideOI * 100 * p.strike;
}

const MARKER_SCALE_MIN = 0.75;
const MARKER_SCALE_MAX = 2.4;

function markerScale(notional: number, min: number, max: number): number {
  if (max <= min) return 1;
  const t = (notional - min) / (max - min);
  return MARKER_SCALE_MIN + t * (MARKER_SCALE_MAX - MARKER_SCALE_MIN);
}

function fmtAxisTick(v: number, mode: ViewMode): string {
  const sign = v >= 0 ? '+' : '-';
  return mode === 'price'
    ? `${sign}$${Math.abs(v).toFixed(0)}`
    : `${sign}${Math.abs(v).toFixed(0)}%`;
}

function fmtPointValue(v: number, mode: ViewMode): string {
  const sign = v >= 0 ? '+' : '-';
  return mode === 'price'
    ? `${sign}$${Math.abs(v).toFixed(2)}`
    : `${sign}${Math.abs(v).toFixed(1)}%`;
}

function sideGlyph(side: Wall['side']): string {
  return side === OptionsSide.Calls ? '▲' : '▼';
}

function sideWord(side: Wall['side']): string {
  return side === OptionsSide.Calls ? 'call' : 'put';
}

/** Same thresholds the per-ticker overview tiles use: >1.05 leans put, <0.95 leans call. */
function chainDirection(oiPutCall: number | null): { word: string; color: string; glyph: string } {
  if (oiPutCall === null) return { word: 'no OI', color: theme.colors.label, glyph: '—' };
  if (oiPutCall > 1.05) return { word: 'put-heavy', color: theme.colors.danger, glyph: '▼' };
  if (oiPutCall < 0.95) return { word: 'call-heavy', color: theme.colors.success, glyph: '▲' };
  return { word: 'balanced', color: theme.colors.textSlate, glyph: '—' };
}

type ChainRow = {
  symbol: string;
  label: string;
  color: string;
  spot: number;
  summary: ReturnType<typeof summarizeChain>;
};

/** The 1st of every month strictly inside [minT, maxT] — a light orientation cue, not a data tick. */
function monthStarts(minT: number, maxT: number): number[] {
  const first = new Date(minT);
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  if (cursor < minT) cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1);
  const starts: number[] = [];
  while (cursor <= maxT) {
    starts.push(cursor);
    const next = new Date(cursor);
    cursor = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
  }
  return starts;
}

function monthAbbrev(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function buildChainRows(assets: AssetSnap[]): ChainRow[] {
  return assets.map((asset, i) => ({
    symbol: asset.symbol,
    label: asset.label,
    color: TICKER_COLORS[i % TICKER_COLORS.length],
    spot: asset.options?.price ?? asset.currentPrice,
    summary: summarizeChain(asset.options?.expirations ?? []),
  }));
}

// ---------- Compare table sorting ----------

type ChainSortKey = 'symbol' | 'spot' | 'oi' | 'volume' | 'nearest' | 'heaviest';
type ChainSort = { key: ChainSortKey; dir: 'asc' | 'desc' };
const DEFAULT_CHAIN_SORT: ChainSort = { key: 'oi', dir: 'asc' };

function chainSortValue(row: ChainRow, key: ChainSortKey): number | string | null {
  switch (key) {
    case 'symbol':
      return row.symbol;
    case 'spot':
      return row.spot;
    case 'oi':
      // The ratio, not the raw total — it's the number actually bolded in
      // the cell, so sorting by anything else makes the column look
      // unsorted even though it technically isn't.
      return row.summary.oiPutCall;
    case 'volume':
      return row.summary.volumePutCall;
    case 'nearest':
      return row.summary.nearest ? Math.abs(row.summary.nearest.distancePct) : null;
    case 'heaviest':
      return row.summary.heaviest ? row.summary.heaviest.sideOI : null;
  }
}

function sortChainRows(rows: ChainRow[], sort: ChainSort): ChainRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = chainSortValue(a, sort.key);
    const right = chainSortValue(b, sort.key);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === 'string' || typeof right === 'string') {
      return sign * String(left).localeCompare(String(right));
    }
    return sign * (left - right);
  });
}

/** Descending first for numeric columns — that's "most" without an extra click; symbol sorts A→Z first instead. */
function nextChainSort(current: ChainSort, clicked: ChainSortKey): ChainSort {
  if (current.key !== clicked) return { key: clicked, dir: clicked === 'symbol' ? 'asc' : 'desc' };
  if (current.dir === (clicked === 'symbol' ? 'asc' : 'desc')) {
    return { key: clicked, dir: clicked === 'symbol' ? 'desc' : 'asc' };
  }
  return DEFAULT_CHAIN_SORT;
}

function buildSeries(assets: AssetSnap[]): Series[] {
  return assets
    .map((asset, i) => {
      const expirations = asset.options?.expirations ?? [];
      const sorted = [...expirations]
        .filter((exp) => daysToExpiry(exp.date) <= MAX_DAYS_OUT)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, MAX_POINTS_PER_TICKER);
      const points: SeriesPoint[] = sorted
        .map((exp) => {
          const wall = wallOf(exp);
          if (!wall) return null;
          return {
            date: exp.date,
            t: new Date(`${exp.date}T00:00:00Z`).getTime(),
            side: wall.side,
            strike: wall.strike,
            distancePct: wall.distancePct,
            soft: wall.soft,
            nearSpot: wall.nearSpot,
            sideOI: wall.sideOI,
            clamped: false,
          };
        })
        .filter((p): p is SeriesPoint => p !== null);
      return {
        symbol: asset.symbol,
        label: asset.label,
        color: TICKER_COLORS[i % TICKER_COLORS.length],
        spot: asset.options?.price ?? asset.currentPrice,
        points,
      };
    })
    .filter((s) => s.points.length > 0);
}

// ---------- Styled ----------

const Wrap = styled.div`
  width: 100%;
  padding: 6px 22px 20px;
`;

const Head = styled.div`
  margin-bottom: 10px;
`;

/**
 * Four short facts instead of one paragraph that only ever used the left
 * ~780px of a 1400px-wide card — the same tile pattern the wall glossary on
 * the page above already uses, so the two read as one system. Condensed:
 * this is a reference strip, not the thing the reader came here to read.
 */
const HintGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;

  @media (max-width: ${theme.breakpoints.lg}) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: ${theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
  }
`;

const HintTile = styled.div`
  padding: 5px 8px;
  border-radius: ${theme.radius.sm};
  background: ${theme.colors.slateOverlay};
  border: 1px solid ${theme.colors.borderSlate};
`;

const HintLabel = styled.div`
  font-size: 0.58rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  margin-bottom: 1px;
`;

const HintText = styled.div`
  font-size: 0.64rem;
  line-height: 1.3;
  color: ${theme.colors.textMuted};
`;

const Legend = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-bottom: 10px;
`;

const ModeRow = styled.div`
  display: flex;
  gap: 2px;
  margin-left: auto;
  padding: 2px;
  border-radius: ${theme.radius.md};
  background: ${theme.colors.slateOverlay};
  border: 1px solid ${theme.colors.borderSlate};
`;

const ModeButton = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  padding: 3px 9px;
  border-radius: ${theme.radius.sm};
  font-size: 0.64rem;
  font-weight: 600;
  color: ${({ $active }) => ($active ? theme.colors.textSlate : theme.colors.label)};
  background: ${({ $active }) => ($active ? theme.colors.accentHover : 'transparent')};

  &:hover {
    color: ${theme.colors.textSlate};
  }
`;

/**
 * Pinned reads as "selected" on the chip itself — a tint and ring in the
 * ticker's own colour — rather than a separate tag with its own dismiss
 * control. The chip already is the dismiss control: click it again, or click
 * the chart, and the tint goes away with it.
 */
const Chip = styled.button<{ $color: string; $dimmed: boolean; $pinned: boolean }>`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 3px 9px 3px 7px;
  border-radius: ${theme.radius.pill};
  color: ${({ $dimmed }) => ($dimmed ? theme.colors.label : theme.colors.textSlate)};
  opacity: ${({ $dimmed, $pinned }) => ($pinned ? 1 : $dimmed ? 0.45 : 1)};
  background: ${({ $pinned, $color }) => ($pinned ? `${$color}26` : 'transparent')};
  border: 1px solid ${({ $pinned, $color }) => ($pinned ? $color : 'transparent')};
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &::before {
    content: '';
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    flex: none;
  }
`;

const Svg = styled.svg`
  width: 100%;
  height: ${VIEW_H}px;
  display: block;
  overflow: visible;
`;

const AxisText = styled.text`
  font-size: 10px;
  fill: ${theme.colors.label};
`;

const DaysOutText = styled.text`
  font-size: 8px;
  fill: ${theme.colors.label};
  opacity: 0.7;
`;

const MonthLabel = styled.text`
  font-size: 9px;
  fill: ${theme.colors.label};
  opacity: 0.55;
`;

const RefLabel = styled.text`
  font-size: 9px;
  fill: ${theme.colors.textMuted};
`;

const Line = styled.path<{ $color: string; $highlighted: boolean; $dimmed: boolean }>`
  fill: none;
  stroke: ${({ $color }) => $color};
  stroke-width: ${({ $highlighted }) => ($highlighted ? 2.75 : 1.5)};
  stroke-linejoin: round;
  stroke-linecap: round;
  opacity: ${({ $dimmed }) => ($dimmed ? 0.15 : 1)};
  filter: ${({ $highlighted, $color }) =>
    $highlighted ? `drop-shadow(0 0 3px ${$color})` : 'none'};
  transition:
    opacity 0.15s ease,
    stroke-width 0.15s ease,
    filter 0.15s ease;
  pointer-events: none;
`;

const Marker = styled.text<{
  $color: string;
  $soft: boolean;
  $highlighted: boolean;
  $scale: number;
}>`
  font-size: ${({ $highlighted, $scale }) => ($highlighted ? 15 : 12) * $scale}px;
  fill: ${({ $color }) => $color};
  opacity: ${({ $soft, $highlighted }) => ($highlighted ? 1 : $soft ? 0.55 : 1)};
  filter: ${({ $highlighted, $color }) =>
    $highlighted ? `drop-shadow(0 0 3px ${$color})` : 'none'};
  transition:
    font-size 0.15s ease,
    opacity 0.15s ease,
    filter 0.15s ease;
  text-anchor: middle;
  dominant-baseline: central;
  cursor: pointer;
`;

const MarkerHit = styled.circle`
  fill: transparent;
  cursor: pointer;
`;

const EndLabel = styled.text<{ $color: string; $dimmed: boolean }>`
  font-size: 10px;
  font-weight: 700;
  fill: ${({ $color }) => $color};
  opacity: ${({ $dimmed }) => ($dimmed ? 0.2 : 1)};
  dominant-baseline: middle;
  transition: opacity 0.15s ease;
`;

/**
 * The strike, spelled out above every point once its ticker is hovered.
 *
 * The tooltip already gives this on a single point; a hovered line is someone
 * reading the whole trajectory, and re-hovering eight points one at a time to
 * get there is the wrong amount of work. The stroke halo (rather than a
 * background rect) keeps it legible over whichever other lines still cross
 * behind it.
 */
const PriceLabel = styled.text<{ $color: string }>`
  font-size: 10px;
  font-weight: 700;
  fill: ${({ $color }) => $color};
  text-anchor: middle;
  paint-order: stroke;
  stroke: ${theme.colors.cardBgEnd};
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
`;

const VxxToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  margin: 6px 0 0;
  font-size: 0.66rem;
  color: ${theme.colors.textMuted};
  cursor: pointer;

  &:hover {
    color: ${theme.colors.textSlate};
  }
`;

// ---------- Compare table ----------

const CompareSection = styled.div`
  margin-top: 20px;
`;

const CompareTitle = styled.div`
  font-size: 0.65rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin-bottom: 8px;
`;

const TickerCell = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 700;
  color: ${theme.colors.textSlate} !important;
`;

const ColorDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex: none;
`;

const DirectionCell = styled.span<{ $color: string }>`
  color: ${({ $color }) => $color} !important;
  font-weight: 600;
`;

const WallSide = styled.span<{ $color: string }>`
  color: ${({ $color }) => $color} !important;
`;

const MutedSpan = styled.span`
  color: ${theme.colors.label} !important;
`;

const CompareRow = styled.tr<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? theme.colors.accentHover : 'inherit')} !important;
  cursor: pointer;
`;

const HeadButton = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  font: inherit;
  color: ${({ $active }) => ($active ? theme.colors.accent : 'inherit')};
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.accent};
  }
`;

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  hint,
}: {
  label: string;
  sortKey: ChainSortKey;
  sort: ChainSort;
  onSort: (next: ChainSort) => void;
  hint?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th>
      <HeadButton
        $active={active}
        onClick={() => onSort(nextChainSort(sort, sortKey))}
        title={hint ? `${hint} — click to sort` : 'Click to sort'}
      >
        {label}
        {active && <span>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </HeadButton>
    </th>
  );
}

function WallCell({ wall }: { wall: Wall | null }) {
  if (!wall) return <MutedSpan>—</MutedSpan>;
  const color = wall.side === OptionsSide.Calls ? theme.colors.success : theme.colors.danger;
  return (
    <>
      <WallSide $color={color}>
        {sideGlyph(wall.side)} ${fmtNum(wall.strike, 2)}
      </WallSide>{' '}
      <MutedSpan>
        ({wall.distancePct >= 0 ? '+' : ''}
        {wall.distancePct.toFixed(1)}% · {shortDate(wall.date)})
      </MutedSpan>
    </>
  );
}

function RatioCell({ ratio, calls, puts }: { ratio: number | null; calls: number; puts: number }) {
  const direction = chainDirection(ratio);
  return (
    <>
      <DirectionCell $color={direction.color} title={direction.word}>
        {direction.glyph} {ratio === null ? '—' : ratio.toFixed(2)}
      </DirectionCell>{' '}
      <MutedSpan>
        ({fmtK(calls)} · {fmtK(puts)})
      </MutedSpan>
    </>
  );
}

// ---------- Component ----------

export function OptionsFlowMap({ assets }: { assets: AssetSnap[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  // A click sticks the highlight past mouse-leave — pinned wins over hover
  // wherever the two disagree, so a chart you've clicked into stays isolated
  // while you move the cursor around reading it.
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [chainSort, setChainSort] = useState<ChainSort>(DEFAULT_CHAIN_SORT);
  const [viewMode, setViewMode] = useState<ViewMode>('percent');
  // Off by default — see VOLATILITY_SYMBOL. Chart only; the compare table
  // below still lists every featured chain regardless of this toggle.
  const [showVxx, setShowVxx] = useState(false);
  const active = pinned ?? hovered;
  const togglePin = (symbol: string) => setPinned((cur) => (cur === symbol ? null : symbol));

  const allSeries = useMemo(() => buildSeries(assets), [assets]);
  const hasVxx = useMemo(() => allSeries.some((s) => s.symbol === VOLATILITY_SYMBOL), [allSeries]);
  const series = useMemo(() => {
    const rest = allSeries.filter((s) => s.symbol !== VOLATILITY_SYMBOL);
    if (!showVxx) return rest;
    // Tacked on at the end of the legend/render order rather than wherever
    // it falls in the asset list — it's an opt-in extra, not a peer.
    const vxx = allSeries.filter((s) => s.symbol === VOLATILITY_SYMBOL);
    return [...rest, ...vxx];
  }, [allSeries, showVxx]);
  const chainRows = useMemo(() => buildChainRows(assets), [assets]);
  const sortedChainRows = useMemo(
    () => sortChainRows(chainRows, chainSort),
    [chainRows, chainSort]
  );

  const overview = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => ({ s, p })));
    if (all.length === 0) return null;

    const nearest = all.reduce((best, cur) =>
      Math.abs(cur.p.distancePct) < Math.abs(best.p.distancePct) ? cur : best
    );
    const heaviest = all.reduce((best, cur) =>
      notionalOf(cur.p) > notionalOf(best.p) ? cur : best
    );
    const calls = all.filter((x) => x.p.side === OptionsSide.Calls).length;
    const puts = all.length - calls;

    return { nearest, heaviest, calls, puts };
  }, [series]);

  const { minT, maxT, span, notionalMax, plottedSeries } = useMemo(() => {
    const allPoints = series.flatMap((s) => s.points);
    if (allPoints.length === 0) {
      return { minT: 0, maxT: 1, span: 4, notionalMax: 0, plottedSeries: [] as PlottedSeries[] };
    }

    const times = allPoints.map((p) => p.t);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const notionalMax = Math.max(...allPoints.map(notionalOf));

    const rawValues = series
      .flatMap((s) => s.points.map((p) => Math.abs(rawValue(viewMode, p, s.spot))))
      .sort((a, b) => a - b);
    const p85 = rawValues[Math.min(rawValues.length - 1, Math.floor(rawValues.length * 0.85))] ?? 4;
    const span = Math.max(4, Math.ceil(p85 * 1.15));

    const plottedSeries: PlottedSeries[] = series.map((s) => ({
      ...s,
      points: s.points.map((p) => {
        const raw = rawValue(viewMode, p, s.spot);
        return { ...p, value: Math.max(-span, Math.min(span, raw)), clamped: Math.abs(raw) > span };
      }),
    }));

    return { minT, maxT, span, notionalMax, plottedSeries };
  }, [series, viewMode]);

  if (series.length === 0) return null;

  const innerW = VIEW_W - PAD.left - PAD.right;
  const innerH = VIEW_H - PAD.top - PAD.bottom;

  const xOf = (t: number) =>
    maxT === minT ? PAD.left + innerW / 2 : PAD.left + ((t - minT) / (maxT - minT)) * innerW;
  const yOf = (distancePct: number) => {
    const clamped = Math.max(-span, Math.min(span, distancePct));
    return PAD.top + innerH - ((clamped + span) / (2 * span)) * innerH;
  };

  const xTickTimes = Array.from({ length: X_TICKS }, (_, i) =>
    maxT === minT ? minT : minT + (i / (X_TICKS - 1)) * (maxT - minT)
  );
  const yTickDistances = Array.from(
    { length: Y_TICKS },
    (_, i) => -span + (i / (Y_TICKS - 1)) * (2 * span)
  );

  const refY = yOf(0);

  // Ticker labels off the right edge, nudged apart where lines converge —
  // several featured names often end within a hairline of each other, and
  // stacked text there is unreadable without this.
  const LABEL_GAP = 12;
  const endLabelY = new Map<string, number>();
  const ends = plottedSeries
    .filter((s) => s.points.length > 0)
    .map((s) => ({ symbol: s.symbol, y: yOf(s.points[s.points.length - 1].value) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < LABEL_GAP) ends[i].y = ends[i - 1].y + LABEL_GAP;
  }
  for (let i = ends.length - 2; i >= 0; i--) {
    if (ends[i + 1].y - ends[i].y < LABEL_GAP) ends[i].y = ends[i + 1].y - LABEL_GAP;
  }
  ends.forEach(({ symbol, y }) => endLabelY.set(symbol, y));

  return (
    <Wrap>
      <Head>
        <HintGrid>
          <HintTile>
            <HintLabel>Wall direction</HintLabel>
            <HintText>▲ call wall · ▼ put wall</HintText>
          </HintTile>
          {overview && (
            <>
              <HintTile>
                <HintLabel>Nearest wall</HintLabel>
                <HintText>
                  {overview.nearest.s.symbol} {sideWord(overview.nearest.p.side)} wall,{' '}
                  {fmtPointValue(overview.nearest.p.distancePct, 'percent')} away
                </HintText>
              </HintTile>
              <HintTile>
                <HintLabel>Heaviest wall</HintLabel>
                <HintText>
                  {overview.heaviest.s.symbol} {sideWord(overview.heaviest.p.side)} wall · $
                  {fmtK(notionalOf(overview.heaviest.p))} notional
                </HintText>
              </HintTile>
              <HintTile>
                <HintLabel>Call / put walls</HintLabel>
                <HintText>
                  {overview.calls} call · {overview.puts} put
                </HintText>
              </HintTile>
            </>
          )}
        </HintGrid>
      </Head>

      <Legend>
        {plottedSeries.map((s) => (
          <Chip
            key={s.symbol}
            $color={s.color}
            $dimmed={active !== null && active !== s.symbol}
            $pinned={pinned === s.symbol}
            onMouseEnter={() => setHovered(s.symbol)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => togglePin(s.symbol)}
          >
            {s.label}
          </Chip>
        ))}

        <ModeRow>
          {VIEW_MODES.map(({ mode, label }) => (
            <ModeButton key={mode} $active={viewMode === mode} onClick={() => setViewMode(mode)}>
              {label}
            </ModeButton>
          ))}
        </ModeRow>
      </Legend>

      <Svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Wall distance from spot by expiry date, one line per featured ticker"
        onClick={() => setPinned(null)}
      >
        {yTickDistances.map((dist, i) => {
          const y = yOf(dist);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={y}
                y2={y}
                stroke={theme.colors.borderSlate}
                strokeWidth={1}
              />
              {Math.abs(dist) > 0.01 && (
                <AxisText x={PAD.left - 8} y={y} textAnchor="end" dominantBaseline="middle">
                  {fmtAxisTick(dist, viewMode)}
                </AxisText>
              )}
            </g>
          );
        })}

        {monthStarts(minT, maxT).map((t) => (
          <g key={t}>
            <line
              x1={xOf(t)}
              x2={xOf(t)}
              y1={PAD.top}
              y2={VIEW_H - PAD.bottom}
              stroke={theme.colors.borderSlate}
              strokeWidth={1}
            />
            <MonthLabel x={xOf(t)} y={PAD.top - 6} textAnchor="middle">
              {monthAbbrev(t)}
            </MonthLabel>
          </g>
        ))}

        {xTickTimes.map((t, i) => {
          const iso = new Date(t).toISOString().slice(0, 10);
          return (
            <g key={i}>
              <AxisText x={xOf(t)} y={VIEW_H - PAD.bottom + 17} textAnchor="middle">
                {shortDate(iso)}
              </AxisText>
              <DaysOutText x={xOf(t)} y={VIEW_H - PAD.bottom + 28} textAnchor="middle">
                {daysToExpiry(iso)}d
              </DaysOutText>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={VIEW_W - PAD.right}
          y1={refY}
          y2={refY}
          stroke={theme.colors.borderSlateTable}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <RefLabel x={PAD.left - 8} y={refY - 5} textAnchor="end" dominantBaseline="middle">
          spot
        </RefLabel>

        {plottedSeries.map((s) => {
          const dimmed = active !== null && active !== s.symbol;
          const highlighted = active === s.symbol;
          const d = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t)},${yOf(p.value)}`)
            .join(' ');
          const last = s.points[s.points.length - 1];

          return (
            <g key={s.symbol}>
              <Line d={d} $color={s.color} $highlighted={highlighted} $dimmed={dimmed} />
              {s.points.map((p) => (
                <g key={p.date}>
                  <MarkerHit
                    cx={xOf(p.t)}
                    cy={yOf(p.value)}
                    r={10}
                    onMouseEnter={(e) => {
                      setHovered(s.symbol);
                      setTip({ x: e.clientX, y: e.clientY, series: s, point: p });
                    }}
                    onMouseMove={(e) =>
                      setTip((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur))
                    }
                    onMouseLeave={() => {
                      setHovered(null);
                      setTip(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(s.symbol);
                    }}
                  />
                  <Marker
                    x={xOf(p.t)}
                    y={yOf(p.value)}
                    $color={s.color}
                    $soft={p.soft}
                    $highlighted={highlighted}
                    $scale={
                      viewMode === 'notional' ? markerScale(notionalOf(p), 0, notionalMax) : 1
                    }
                    style={{ pointerEvents: 'none' }}
                  >
                    {sideGlyph(p.side)}
                  </Marker>
                  {highlighted && (
                    <PriceLabel
                      x={xOf(p.t)}
                      y={yOf(p.value) + (p.value >= 0 ? -13 : 16)}
                      $color={s.color}
                    >
                      ${fmtNum(p.strike, 2)} ({fmtPointValue(p.value, viewMode)})
                    </PriceLabel>
                  )}
                </g>
              ))}
              {last &&
                (() => {
                  const trueY = yOf(last.value);
                  const labelY = endLabelY.get(s.symbol) ?? trueY;
                  return (
                    <>
                      {Math.abs(labelY - trueY) > 1 && (
                        <line
                          x1={xOf(last.t)}
                          x2={xOf(last.t) + 6}
                          y1={trueY}
                          y2={labelY}
                          stroke={s.color}
                          strokeWidth={1}
                          opacity={dimmed ? 0.15 : 0.5}
                        />
                      )}
                      <EndLabel x={xOf(last.t) + 8} y={labelY} $color={s.color} $dimmed={dimmed}>
                        {s.symbol}
                        {highlighted ? `  $${fmtNum(s.spot, 2)}` : ''}
                      </EndLabel>
                    </>
                  );
                })()}
            </g>
          );
        })}
      </Svg>

      {hasVxx && (
        <VxxToggleRow>
          <input type="checkbox" checked={showVxx} onChange={(e) => setShowVxx(e.target.checked)} />
          Show {VOLATILITY_SYMBOL} (volatility proxy, often skews the scale)
        </VxxToggleRow>
      )}

      <CompareSection>
        <CompareTitle>Chain comparison</CompareTitle>
        <ExpTableScroll>
          <ExpTable>
            <thead>
              <tr>
                <SortHead label="Ticker" sortKey="symbol" sort={chainSort} onSort={setChainSort} />
                <SortHead label="Spot" sortKey="spot" sort={chainSort} onSort={setChainSort} />
                <SortHead
                  label="Open Interest"
                  sortKey="oi"
                  sort={chainSort}
                  onSort={setChainSort}
                  hint="Every open contract, calls against puts — what is already positioned"
                />
                <SortHead
                  label="Volume Today"
                  sortKey="volume"
                  sort={chainSort}
                  onSort={setChainSort}
                  hint="Contracts traded today, calls against puts — what is being positioned right now"
                />
                <SortHead
                  label="Nearest Wall"
                  sortKey="nearest"
                  sort={chainSort}
                  onSort={setChainSort}
                  hint="The wall spot would run into first"
                />
                <SortHead
                  label="Heaviest Wall"
                  sortKey="heaviest"
                  sort={chainSort}
                  onSort={setChainSort}
                  hint="The wall with the most open interest behind it"
                />
              </tr>
            </thead>
            <tbody>
              {sortedChainRows.map((row) => (
                <CompareRow
                  key={row.symbol}
                  $active={active === row.symbol}
                  onMouseEnter={() => setHovered(row.symbol)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => togglePin(row.symbol)}
                >
                  <td>
                    <TickerCell>
                      <ColorDot $color={row.color} />
                      {row.symbol}
                    </TickerCell>
                  </td>
                  <td>${fmtNum(row.spot, 2)}</td>
                  <td>
                    <RatioCell
                      ratio={row.summary.oiPutCall}
                      calls={row.summary.callOI}
                      puts={row.summary.putOI}
                    />
                  </td>
                  <td>
                    <RatioCell
                      ratio={row.summary.volumePutCall}
                      calls={row.summary.callVolume}
                      puts={row.summary.putVolume}
                    />
                  </td>
                  <td>
                    <WallCell wall={row.summary.nearest} />
                  </td>
                  <td>
                    <WallCell wall={row.summary.heaviest} />
                  </td>
                </CompareRow>
              ))}
            </tbody>
          </ExpTable>
        </ExpTableScroll>
      </CompareSection>

      {tip && (
        <ChartTooltip x={tip.x} y={tip.y}>
          <strong style={{ color: tip.series.color, fontSize: '0.85rem' }}>
            {tip.series.symbol}
          </strong>{' '}
          <span style={{ color: theme.colors.label }}>${fmtNum(tip.series.spot, 2)} spot</span>
          <br />
          {sideWord(tip.point.side)} wall · ${fmtNum(tip.point.strike, 2)}
          <br />
          <span style={{ color: theme.colors.label }}>
            {shortDate(tip.point.date)} · {daysToExpiry(tip.point.date)}d out ·{' '}
            {fmtPointValue(tip.point.value, viewMode)} from spot
            {tip.point.soft ? ' · soft lean' : ''}
            {tip.point.nearSpot ? ' · clustered on spot' : ''}
            {tip.point.clamped ? ' · off-scale' : ''}
            <br />
            {fmtK(tip.point.sideOI)} {sideWord(tip.point.side)} OI
          </span>
        </ChartTooltip>
      )}
    </Wrap>
  );
}
