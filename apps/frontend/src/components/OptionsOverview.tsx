import styled from 'styled-components';
import { theme } from '../styles/theme';
import { fmtK, fmtNum } from '../lib/format';
import { daysToExpiry, shortDate, wallOf, type ChainSummary, type Wall } from '../lib/options';
import { WallPriceChart } from './WallPriceChart';
import { OptionsSide } from '../types/enums';
import type { OptionsExpiration } from '../types/finsnap';

/**
 * What the chain says, before the row-by-row detail underneath it.
 *
 * The table answers "what is on this expiry" one line at a time. It cannot
 * answer the questions people actually arrive with — is this chain leaning
 * long, where is the wall spot runs into first, and is that the only one or is
 * there a bigger one three weeks out. Those are chain-level readings, so they
 * get their own strip above the table.
 */

// ---------- Side colour ----------

/**
 * Calls green, puts red — the convention already used in the table below and
 * the report.
 *
 * The pair separates poorly under deuteranopia (ΔE 7.9), so side is never
 * carried by colour alone: every marker is also a triangle pointing the way the
 * wall sits, and every wall is spelled out in text beside it.
 */
function sideColor(side: OptionsSide): string {
  if (side === OptionsSide.Calls) return theme.colors.success;
  if (side === OptionsSide.Puts) return theme.colors.danger;
  return theme.colors.label;
}

const sideGlyph = (side: OptionsSide) => (side === OptionsSide.Calls ? '▲' : '▼');
const sideWord = (side: OptionsSide) => (side === OptionsSide.Calls ? 'call' : 'put');

// ---------- Stat tiles ----------

/**
 * The right-hand column: the four tiles, then the chart underneath them —
 * stacked so both sit to the right of "walls by date" as one column.
 */
const Strip = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

/** Always two columns, so the tiles keep a clean 2×2 at any width. */
const TileGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr));
  align-content: start;
  gap: 10px;
`;

const ChartSlot = styled.div`
  border-radius: ${theme.radius.md};
  background: ${theme.colors.slateOverlayStrong};
  border: 1px solid ${theme.colors.borderSlateStrong};
  padding: 10px 12px 6px;
`;

const Tile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 14px;
  border-radius: ${theme.radius.md};
  background: ${theme.colors.slateOverlayStrong};
  border: 1px solid ${theme.colors.borderSlateStrong};
`;

const TileLabel = styled.span`
  font-size: 0.62rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const TileValue = styled.span<{ $color?: string }>`
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  color: ${({ $color }) => $color ?? theme.colors.textSlate};
`;

/** The ratio in words, on the same line as the ratio itself. */
const Lean = styled.span`
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0;
  color: ${theme.colors.textMuted};
  margin-left: 5px;
  white-space: nowrap;
`;

const TileSub = styled.span`
  font-size: 0.68rem;
  line-height: 1.45;
  color: ${theme.colors.textMuted};
  font-variant-numeric: tabular-nums;
`;

/**
 * Two segments, one bar: how the chain splits between calls and puts.
 *
 * A ratio alone ("0.94") tells you the direction but not the scale, and reading
 * two long numbers side by side to compare them is work. The 2px gap between
 * segments is what keeps them from reading as one continuous bar.
 */
const SplitBar = styled.div`
  display: flex;
  gap: 2px;
  height: 5px;
  margin-top: 1px;
`;

const Segment = styled.div<{ $share: number; $color: string }>`
  flex: ${({ $share }) => $share};
  min-width: ${({ $share }) => ($share > 0 ? '3px' : '0')};
  background: ${({ $color }) => $color};
  border-radius: 2px;
  opacity: 0.85;
`;

function Split({ calls, puts, unit }: { calls: number; puts: number; unit: string }) {
  const total = calls + puts;
  if (total <= 0) return null;

  return (
    <>
      <SplitBar
        role="img"
        aria-label={`${fmtK(calls)} call ${unit}, ${fmtK(puts)} put ${unit}`}
        title={`${fmtK(calls)} call ${unit} · ${fmtK(puts)} put ${unit}`}
      >
        <Segment $share={calls} $color={theme.colors.success} />
        <Segment $share={puts} $color={theme.colors.danger} />
      </SplitBar>
      <TileSub>
        {fmtK(calls)} calls · {fmtK(puts)} puts
      </TileSub>
    </>
  );
}

function ratioColor(putCall: number | null): string {
  if (putCall === null) return theme.colors.textSlate;
  if (putCall > 1.05) return theme.colors.danger;
  if (putCall < 0.95) return theme.colors.success;
  return theme.colors.textSlate;
}

function ratioWord(putCall: number | null): string {
  if (putCall === null) return 'no open interest';
  if (putCall > 1.05) return 'more puts than calls';
  if (putCall < 0.95) return 'more calls than puts';
  return 'evenly split';
}

/** What is worth saying about a wall once its strike, date and distance are already shown. */
function wallNote(wall: Wall): string {
  if (wall.soft) return 'soft lean';
  if (wall.nearSpot) return 'clustered on spot';
  return `${fmtK(wall.sideOI)} ${sideWord(wall.side)} OI`;
}

function WallTile({ label, wall, note }: { label: string; wall: Wall | null; note?: string }) {
  if (!wall) {
    return (
      <Tile>
        <TileLabel>{label}</TileLabel>
        <TileValue $color={theme.colors.label}>—</TileValue>
        <TileSub>no expiry leans far enough</TileSub>
      </Tile>
    );
  }

  const days = daysToExpiry(wall.date);
  return (
    <Tile>
      <TileLabel>{label}</TileLabel>
      <TileValue $color={sideColor(wall.side)}>
        {sideGlyph(wall.side)} ${fmtNum(wall.strike, 2)}
      </TileValue>
      <TileSub>
        {shortDate(wall.date)} · {days === 0 ? 'today' : `${days}d`} ·{' '}
        {wall.distancePct >= 0 ? '+' : ''}
        {wall.distancePct.toFixed(1)}% · {note ?? wallNote(wall)}
      </TileSub>
    </Tile>
  );
}

// ---------- Wall map ----------

/**
 * Capped rather than stretched to the card.
 *
 * Spread across 1300px the markers sit so far apart that the clustering — the
 * whole point of plotting them together — stops being visible.
 */
const MapWrap = styled.div`
  max-width: 780px;
  min-width: 0;
`;

const MapHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`;

const MapTitle = styled.span`
  font-size: 0.65rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const LegendRow = styled.div`
  display: flex;
  gap: 12px;
  font-size: 0.66rem;
  color: ${theme.colors.textMuted};
`;

const LegendItem = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &::before {
    content: attr(data-glyph);
    color: ${({ $color }) => $color};
    font-size: 0.6rem;
  }
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
`;

const Row = styled.div<{ $muted: boolean }>`
  display: grid;
  grid-template-columns: 74px 1fr 96px;
  align-items: center;
  gap: 10px;
  height: 22px;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  color: ${({ $muted }) => ($muted ? theme.colors.label : theme.colors.textSlateLight)};
`;

const Track = styled.div`
  position: relative;
  height: 100%;

  /* Spot, and the only reference line the plot needs. */
  &::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: ${theme.colors.borderSlateMuted};
  }
`;

const Marker = styled.span<{
  $left: number;
  $color: string;
  $soft: boolean;
  $clamped: boolean;
}>`
  position: absolute;
  top: 50%;
  left: ${({ $left }) => $left}%;
  transform: translate(-50%, -50%);
  font-size: 0.62rem;
  line-height: 1;
  color: ${({ $color }) => $color};
  /* Soft leans and pinned outliers both read as "less certain than it looks". */
  opacity: ${({ $soft, $clamped }) => ($soft ? 0.5 : $clamped ? 0.65 : 1)};
  /* Reads as a mark on the track rather than as text that fell on the line. */
  text-shadow:
    0 0 2px ${theme.colors.cardBgEnd},
    0 0 2px ${theme.colors.cardBgEnd};
  cursor: default;
`;

const Strike = styled.span<{ $color: string }>`
  text-align: right;
  color: ${({ $color }) => $color};
  white-space: nowrap;
`;

const AxisRow = styled.div`
  display: grid;
  grid-template-columns: 74px 1fr 96px;
  gap: 10px;
  font-size: 0.6rem;
  color: ${theme.colors.label};
  padding-top: 4px;
`;

const AxisTrack = styled.div`
  display: flex;
  justify-content: space-between;
`;

const MoreNote = styled.div`
  font-size: 0.66rem;
  color: ${theme.colors.label};
  padding-top: 6px;
`;

/** Rows past this and the map stops being a shape you can take in at once. */
const MAX_MAP_ROWS = 18;

/**
 * Where the walls sit, by date.
 *
 * The Wall column in the table gives one expiry's answer at a time, which is
 * the wrong shape for the question people actually ask of it: is this one wall
 * or a run of them, do they sit above or below, and does the whole thing march
 * away from spot as the dates get further out. Laid on a shared axis those read
 * off instantly and no single row has to be looked up.
 */
function WallMap({ expirations, spot }: { expirations: OptionsExpiration[]; spot: number }) {
  const shown = [...expirations]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_MAP_ROWS);
  const walls = shown.map((exp) => ({ exp, wall: wallOf(exp) }));

  if (walls.every((w) => w.wall === null)) return null;

  /*
   * A symmetric axis, so "above spot" and "below spot" are the same distance
   * from the centre line and the two sides can be compared directly.
   *
   * Scaled to the bulk of the walls rather than to the widest one: a single
   * expiry 17% out squeezed everything that actually matters into the middle
   * third of the track. Anything past the edge is pinned to it and says so on
   * hover — the exact position of a wall that far from spot costs nothing.
   */
  const distances = walls
    .map((w) => Math.abs(w.wall?.distancePct ?? 0))
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const p85 = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.85))] ?? 0;
  const span = Math.max(4, Math.ceil(p85));
  const clamped = distances.filter((d) => d > span).length;

  return (
    <MapWrap>
      <MapHead>
        <MapTitle>Walls by date</MapTitle>
        <LegendRow>
          <LegendItem data-glyph="▲" $color={theme.colors.success}>
            call wall
          </LegendItem>
          <LegendItem data-glyph="▼" $color={theme.colors.danger}>
            put wall
          </LegendItem>
          <LegendItem data-glyph="│" $color={theme.colors.borderSlateTable}>
            spot ${fmtNum(spot, 2)}
          </LegendItem>
        </LegendRow>
      </MapHead>

      <Rows>
        {walls.map(({ exp, wall }) => {
          const color = wall ? sideColor(wall.side) : theme.colors.label;
          const offset = wall ? Math.max(-span, Math.min(span, wall.distancePct)) : 0;
          const isClamped = wall ? Math.abs(wall.distancePct) > span : false;

          return (
            <Row key={exp.date} $muted={!wall}>
              <span>{shortDate(exp.date)}</span>
              <Track>
                {wall && (
                  <Marker
                    $left={50 + (offset / span) * 50}
                    $color={color}
                    $soft={wall.soft}
                    $clamped={isClamped}
                    title={
                      `${shortDate(wall.date)}: ${sideWord(wall.side)} wall at $${fmtNum(wall.strike, 2)}, ` +
                      `${wall.distancePct >= 0 ? '+' : ''}${wall.distancePct.toFixed(1)}% from spot` +
                      `${wall.nearSpot ? ' — clustered on spot' : ''}${wall.soft ? ' — soft' : ''}` +
                      `${isClamped ? ' — beyond the axis, pinned to the edge' : ''}`
                    }
                  >
                    {sideGlyph(wall.side)}
                  </Marker>
                )}
              </Track>
              <Strike $color={wall ? color : theme.colors.label}>
                {wall ? `$${fmtNum(wall.strike, 2)}` : '—'}
              </Strike>
            </Row>
          );
        })}
      </Rows>

      <AxisRow>
        <span />
        <AxisTrack>
          <span>{clamped > 0 ? `≤ −${span}%` : `−${span}%`}</span>
          <span>spot</span>
          <span>{clamped > 0 ? `≥ +${span}%` : `+${span}%`}</span>
        </AxisTrack>
        <span />
      </AxisRow>

      {expirations.length > MAX_MAP_ROWS && (
        <MoreNote>
          Nearest {MAX_MAP_ROWS} of {expirations.length} expiries — the rest are in the table below.
        </MoreNote>
      )}
    </MapWrap>
  );
}

// ---------- Component ----------

/**
 * Map on the left, readings on the right, once there is room for both.
 *
 * The map is capped at the width where its clustering still reads, which on a
 * wide card left half the row empty while the tiles sat in a band above it.
 * Side by side they are one block, and the tiles land next to the plot the
 * numbers are describing.
 *
 * Stacked below that width, and tiles first: on a narrow screen the summary is
 * what you want before scrolling into detail.
 */
const Overview = styled.div<{ $split: boolean }>`
  display: grid;
  gap: 16px;
  padding: 14px 22px 6px;

  @media (min-width: ${theme.breakpoints.xl}) {
    grid-template-columns: ${({ $split }) =>
      $split ? 'minmax(0, 780px) minmax(300px, 1fr)' : '1fr'};
    gap: 24px;
    align-items: start;

    ${MapWrap} {
      grid-column: 1;
      grid-row: 1;
    }

    ${Strip} {
      grid-column: ${({ $split }) => ($split ? 2 : 1)};
      grid-row: 1;
    }
  }
`;

export function OptionsOverview({
  summary,
  expirations,
  spot,
}: {
  summary: ChainSummary;
  expirations: OptionsExpiration[];
  spot: number;
}) {
  const { oiPutCall, volumePutCall } = summary;

  return (
    <Overview $split={summary.walls.length > 0}>
      <Strip>
        <TileGrid>
          <Tile title="Every open contract on the chain, calls against puts — what is already positioned">
            <TileLabel>Open interest</TileLabel>
            <TileValue $color={ratioColor(oiPutCall)}>
              {oiPutCall === null ? '—' : `${oiPutCall.toFixed(2)} P/C`}
              <Lean>{ratioWord(oiPutCall)}</Lean>
            </TileValue>
            <Split calls={summary.callOI} puts={summary.putOI} unit="open interest" />
          </Tile>

          <Tile title="Contracts traded today, calls against puts — what is being positioned right now">
            <TileLabel>Volume today</TileLabel>
            <TileValue $color={ratioColor(volumePutCall)}>
              {volumePutCall === null ? '—' : `${volumePutCall.toFixed(2)} P/C`}
              <Lean>{ratioWord(volumePutCall)}</Lean>
            </TileValue>
            <Split calls={summary.callVolume} puts={summary.putVolume} unit="contracts" />
          </Tile>

          <WallTile label="Nearest wall" wall={summary.nearest} />

          <WallTile
            label="Heaviest wall"
            wall={summary.heaviest}
            note={summary.heaviest ? `${fmtK(summary.heaviest.sideOI)} OI on that side` : undefined}
          />
        </TileGrid>

        {summary.walls.length > 0 && (
          <ChartSlot>
            <WallPriceChart
              expirations={expirations}
              spot={spot}
              compact
              maxPoints={MAX_MAP_ROWS}
            />
          </ChartSlot>
        )}
      </Strip>

      <WallMap expirations={expirations} spot={spot} />
    </Overview>
  );
}
