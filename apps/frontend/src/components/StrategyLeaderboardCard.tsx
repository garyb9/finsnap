import { useMemo, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { CardTitle, ExpTableScroll } from './Card';
import { changeColor, columnRankColor, fmtPct, STRATEGY_KIND_LABEL } from '../lib/format';
import { strategyAnchor } from '../types/guide';
import type {
  BenchmarkSummary,
  StrategyLeaderboard,
  StrategyLeaderboardRow,
} from '../types/leaderboard';
import { WindowId } from '../types/enums';

/**
 * Which rule actually has an edge, pooled across the whole universe rather
 * than read one asset at a time.
 *
 * The daily report answers "how did this strategy do on BTC" twenty times
 * over. This collapses that into one table: for each lookback horizon, what
 * share of assets did the rule beat buy-and-hold on, and which rule wins that
 * horizon outright. The "Overall" column is the same question with every
 * horizon pooled — the closest thing here to "does this rule just work".
 */

// ---------- Sort ----------

type SortKey = 'overall' | 'excess' | WindowId;
type SortState = { key: SortKey | null; dir: 'asc' | 'desc' };

function cellValue(row: StrategyLeaderboardRow, key: SortKey): number | null {
  if (key === 'overall') return row.overallWinRatePct;
  if (key === 'excess') return row.overallAvgExcessCagrPct;
  const cell = row.perWindow.find((w) => w.window === key);
  return cell ? cell.winRatePct : null;
}

function sortRows(rows: StrategyLeaderboardRow[], sort: SortState): StrategyLeaderboardRow[] {
  if (!sort.key) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = cellValue(a, sort.key!);
    const right = cellValue(b, sort.key!);

    // Unknowns last, whichever way the column points.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    return sign * (left - right);
  });
}

/** Clicking cycles descending → ascending → back to the board's own ranking. */
function nextSort(current: SortState, clicked: SortKey): SortState {
  if (current.key !== clicked) return { key: clicked, dir: 'desc' };
  if (current.dir === 'desc') return { key: clicked, dir: 'asc' };
  return { key: null, dir: 'desc' };
}

// ---------- Styled ----------

const Wrap = styled.section`
  width: 100%;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 20px 22px 12px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  flex-wrap: wrap;
`;

const Meta = styled.span`
  font-size: 0.72rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
`;

const GuideLink = styled(Link)`
  margin-left: auto;
  font-size: 0.66rem;
  color: ${theme.colors.label};
  text-decoration: none;
  border-bottom: 1px solid transparent;
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.accent};
    border-bottom-color: ${theme.colors.accent};
  }
`;

/**
 * The legend that replaced the intro paragraphs.
 *
 * Explaining a table in prose above it asks the reader to hold the rules in
 * their head before they have seen anything to apply them to — the block was
 * skipped. Everything it said now lives where it is used: the column tooltips,
 * the guide link in the header, and this one line over the table itself.
 */
const Legend = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.68rem;
  color: ${theme.colors.label};
`;

/**
 * A grid, not a wrapped flex row — `auto-fit`/`minmax` spreads every card to
 * fill the width evenly instead of leaving a fixed 150px box to wrap a long
 * strategy name onto two cramped lines while the row has room to spare.
 */
const CalloutRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  /* Clears the header rule — with the intro text gone the boxes sat on it. */
  padding: 18px 22px 20px;
`;

const calloutFace = `
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 16px;
  border-radius: ${theme.radius.md};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid ${theme.colors.borderSlateStrong};
`;

const Callout = styled.div`
  ${calloutFace}
`;

/**
 * The name in a callout is the answer to "which rule won this horizon", and the
 * next question is always "what does that rule actually do" — which the guide
 * already answers. Linking the whole box rather than the name alone keeps the
 * target big enough to hit.
 */
const CalloutLink = styled(Link)`
  ${calloutFace}
  text-decoration: none;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover {
    border-color: ${theme.colors.accent};
    background: ${theme.colors.accentHover};
  }

  &:focus-visible {
    outline: 1px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

const CalloutLabel = styled.span`
  font-size: 0.64rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const CalloutValue = styled.span`
  font-size: 0.94rem;
  font-weight: 700;
  line-height: 1.35;
  color: ${theme.colors.textSlate};

  ${CalloutLink}:hover & {
    color: ${theme.colors.accent};
  }
`;

const CalloutSub = styled.span`
  font-size: 0.7rem;
  line-height: 1.4;
  color: ${theme.colors.textMuted};
  font-variant-numeric: tabular-nums;
`;

const SectionLabel = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 22px;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  background: ${theme.colors.slateOverlay};
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const Body = styled.div`
  padding: 4px 22px 20px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.76rem;
  white-space: nowrap;

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: right;
    font-weight: 500;
    padding: 6px 10px;
    color: ${theme.colors.label};
    background: ${theme.colors.cardBgEnd};
    border-bottom: 1px solid ${theme.colors.borderSlateStrong};

    &:first-child {
      text-align: left;
    }
  }

  tbody td {
    padding: 8px 10px;
    text-align: right;
    color: ${theme.colors.textSlateLight};
    border-bottom: 1px solid ${theme.colors.slateOverlayDark};
    font-variant-numeric: tabular-nums;

    &:first-child {
      text-align: left;
    }
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:nth-child(odd) {
    background: ${theme.colors.slateOverlay};
  }
`;

const HeadButton = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: ${({ $active }) => ($active ? theme.colors.accent : 'inherit')};

  &:hover {
    color: ${theme.colors.accent};
  }
`;

const StrategyCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const StrategyName = styled(Link)`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${theme.colors.textSlate};
  text-decoration: none;
  border-bottom: 1px solid transparent;
  width: fit-content;

  &:hover {
    color: ${theme.colors.accent};
    border-bottom-color: ${theme.colors.accent};
  }
`;

const StrategyKindTag = styled.span`
  font-size: 0.62rem;
  color: ${theme.colors.label};
`;

const Win = styled.span<{ $color: string; $leader: boolean }>`
  font-weight: ${({ $leader }) => ($leader ? 700 : 400)};
  color: ${({ $color }) => $color};
`;

const LeaderDot = styled.span`
  color: ${theme.colors.accent};
  margin-right: 3px;
`;

const Excess = styled.span<{ $pct: number }>`
  color: ${({ $pct }) => changeColor($pct)};
`;

/**
 * Buy & hold, lifted out of the table and given its own band.
 *
 * It was pinned as the first row, which put a *return* inside columns whose
 * every other cell is a *win rate*: "+741%" sitting directly above "13%" reads
 * as one rule beating another by a factor of fifty, when the two numbers do not
 * measure the same kind of thing at all. One unit per column — and the thing
 * being beaten states its own unit, above the table rather than inside it.
 */
const BenchmarkBand = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
  padding: 13px 22px 15px;
  background: ${theme.colors.slateOverlayStrong};
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const BandLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 128px;
`;

const BandTitle = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${theme.colors.textSlate};
`;

const BandUnit = styled.span`
  font-size: 0.62rem;
  line-height: 1.4;
  color: ${theme.colors.label};
`;

const BandItems = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px 12px;
  flex: 1;
  min-width: 0;
`;

const BandItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const BandWindow = styled.span`
  font-size: 0.6rem;
  color: ${theme.colors.label};
  white-space: nowrap;
`;

const Bench = styled.span<{ $color: string }>`
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${({ $color }) => $color};
`;

// ---------- Sub-components ----------

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  hint,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (next: SortState) => void;
  hint?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th>
      <HeadButton
        $active={active}
        onClick={() => onSort(nextSort(sort, sortKey))}
        title={hint ? `${hint} — click to sort` : 'Click to sort'}
      >
        {label}
        {active && <span>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </HeadButton>
    </th>
  );
}

/** Lowest and highest value in a column, which is what its colours are scaled to. */
type Range = { min: number; max: number };

function WindowCell({
  cell,
  isLeader,
  range,
}: {
  cell: { winRatePct: number; avgExcessCagrPct: number; assetsCovered: number } | undefined;
  isLeader: boolean;
  range?: Range;
}) {
  if (!cell) return <td>{/* no window mark to keep the layout stable */}</td>;

  return (
    <td
      title={
        `${cell.winRatePct}% win rate across ${cell.assetsCovered} assets · ` +
        `avg excess CAGR ${fmtPct(cell.avgExcessCagrPct)}` +
        (isLeader ? ' — best of the universe at this horizon' : '')
      }
    >
      {isLeader && <LeaderDot>★</LeaderDot>}
      <Win
        $color={columnRankColor(cell.winRatePct, range?.min ?? 0, range?.max ?? 100)}
        $leader={isLeader}
      >
        {cell.winRatePct}%
      </Win>
    </td>
  );
}

/** Big multi-year returns don't need a decimal; a one-month move does. */
function fmtReturn(pct: number): string {
  return fmtPct(pct, Math.abs(pct) >= 100 ? 0 : 1);
}

/**
 * What holding actually did, per horizon — the bar every win rate below is
 * measured against, stated in its own unit.
 *
 * Shaded against its own horizons, never against the table: a return and a win
 * rate share no scale, and colouring them alike is what made them look
 * comparable in the first place.
 */
function BenchmarkBandRow({
  benchmark,
  windows,
  range,
}: {
  benchmark: BenchmarkSummary;
  windows: { id: WindowId; label: string }[];
  range?: Range;
}) {
  return (
    <BenchmarkBand>
      <BandLabel>
        <BandTitle>{benchmark.name}</BandTitle>
        <BandUnit>
          total return · median of {benchmark.assetsCovered} assets · what the rules below are
          trying to beat
        </BandUnit>
      </BandLabel>

      <BandItems>
        {windows.map((w) => {
          const cell = benchmark.perWindow.find((c) => c.window === w.id);
          const period = cell?.medianTotalReturnPct;

          return (
            <BandItem key={w.id}>
              <BandWindow>{w.label}</BandWindow>
              {typeof period === 'number' ? (
                <Bench
                  $color={columnRankColor(period, range?.min ?? 0, range?.max ?? 0)}
                  title={
                    `Holding returned ${fmtReturn(period)} over ${w.label.toLowerCase()} on the ` +
                    `median of ${cell!.assetsCovered} assets` +
                    (typeof cell!.medianCagrPct === 'number'
                      ? ` — ${fmtPct(cell!.medianCagrPct)}/yr annualized`
                      : '')
                  }
                >
                  {fmtReturn(period)}
                </Bench>
              ) : (
                <Bench $color={theme.colors.label}>—</Bench>
              )}
            </BandItem>
          );
        })}
      </BandItems>
    </BenchmarkBand>
  );
}

// ---------- Component ----------

export function StrategyLeaderboardCard({ board }: { board: StrategyLeaderboard }) {
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'desc' });

  // Short horizon first — "daily, monthly, yearly" reads left to right.
  const windows = useMemo(() => [...board.windows].reverse(), [board.windows]);
  const rows = useMemo(() => sortRows(board.rows, sort), [board.rows, sort]);
  const best = board.rows.find((r) => r.strategyId === board.bestOverall);

  // The spread of each win-rate column, which is what its colours are scaled
  // to. Built from the unsorted rows so re-sorting the table never repaints it,
  // and from strategies only — the benchmark is in a different unit.
  const ranges = useMemo(() => {
    const spread = (values: number[]): Range | undefined =>
      values.length > 0 ? { min: Math.min(...values), max: Math.max(...values) } : undefined;

    const perWindow = new Map<WindowId, Range | undefined>();
    for (const w of board.windows) {
      perWindow.set(
        w.id,
        spread(
          board.rows
            .map((r) => r.perWindow.find((c) => c.window === w.id)?.winRatePct)
            .filter((v): v is number => typeof v === 'number')
        )
      );
    }

    // The benchmark is in its own unit — a return, not a win rate — so it is
    // shaded against its own horizons rather than against the rules above it.
    const benchmark = spread(
      (board.benchmark?.perWindow ?? [])
        .map((c) => c.medianTotalReturnPct)
        .filter((v): v is number => typeof v === 'number')
    );

    return {
      overall: spread(board.rows.map((r) => r.overallWinRatePct)),
      perWindow,
      benchmark,
    };
  }, [board.rows, board.windows, board.benchmark]);

  return (
    <Wrap>
      <Header>
        <CardTitle style={{ margin: 0, whiteSpace: 'nowrap' }}>Strategy Leaderboard</CardTitle>
        <Meta>
          {board.assetsAnalyzed} assets · through {board.date} close
        </Meta>
        <GuideLink href="/guide#strategies">how these rules work</GuideLink>
      </Header>

      {best && (
        <CalloutRow>
          <CalloutLink href={`/guide#${strategyAnchor(best.strategyId)}`}>
            {/* Ranking first only means "beats hold most" when it beats hold at
                all. Every rule here currently loses to holding, so the honest
                label for the top row is that it loses least. */}
            <CalloutLabel>
              {board.bestBeatsBenchmark ? 'Beats buy & hold most' : 'Loses to buy & hold least'}
            </CalloutLabel>
            <CalloutValue>{best.name}</CalloutValue>
            <CalloutSub>
              {best.overallWinRatePct}% overall · {fmtPct(best.overallAvgExcessCagrPct)} avg excess
              CAGR · {best.assetsCovered} assets
            </CalloutSub>
          </CalloutLink>

          {windows.map((w) => {
            const leaderId = board.bestPerWindow[w.id];
            const leaderRow = leaderId ? board.rows.find((r) => r.strategyId === leaderId) : null;
            const cell = leaderRow?.perWindow.find((c) => c.window === w.id);

            // No qualifying rule at this horizon — nothing to link to.
            if (!leaderRow || !leaderId) {
              return (
                <Callout key={w.id}>
                  <CalloutLabel>{w.label}</CalloutLabel>
                  <CalloutValue>—</CalloutValue>
                </Callout>
              );
            }

            return (
              <CalloutLink key={w.id} href={`/guide#${strategyAnchor(leaderId)}`}>
                <CalloutLabel>{w.label}</CalloutLabel>
                <CalloutValue>{leaderRow.name}</CalloutValue>
                {cell && <CalloutSub>{cell.winRatePct}% win rate</CalloutSub>}
              </CalloutLink>
            );
          })}
        </CalloutRow>
      )}

      {board.benchmark && (
        <BenchmarkBandRow benchmark={board.benchmark} windows={windows} range={ranges.benchmark} />
      )}

      <SectionLabel>
        <span>Every strategy, by horizon</span>
        <Legend>
          <span>share of assets that beat holding</span>
          <span>·</span>
          <span>shading ranks each column</span>
          <span>·</span>
          <span>
            <LeaderDot>★</LeaderDot> leads the horizon
          </span>
        </Legend>
      </SectionLabel>

      <Body>
        <ExpTableScroll>
          <Table>
            <thead>
              <tr>
                <th>Strategy</th>
                <SortHead
                  label="Overall"
                  sortKey="overall"
                  sort={sort}
                  onSort={setSort}
                  hint="Win rate vs. buy & hold, pooled across every asset and window"
                />
                <SortHead
                  label="Avg excess CAGR"
                  sortKey="excess"
                  sort={sort}
                  onSort={setSort}
                  hint="Mean of (strategy CAGR − buy-and-hold CAGR)"
                />
                {windows.map((w) => (
                  <SortHead
                    key={w.id}
                    label={w.label}
                    sortKey={w.id}
                    sort={sort}
                    onSort={setSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.strategyId}>
                  <td>
                    <StrategyCell>
                      <StrategyName href={`/guide#${strategyAnchor(row.strategyId)}`}>
                        {row.name}
                      </StrategyName>
                      <StrategyKindTag>{STRATEGY_KIND_LABEL[row.kind]}</StrategyKindTag>
                    </StrategyCell>
                  </td>
                  <td>
                    <Win
                      $color={columnRankColor(
                        row.overallWinRatePct,
                        ranges.overall?.min ?? 0,
                        ranges.overall?.max ?? 100
                      )}
                      $leader={row.strategyId === board.bestOverall}
                    >
                      {row.strategyId === board.bestOverall && <LeaderDot>★</LeaderDot>}
                      {row.overallWinRatePct}%
                    </Win>
                  </td>
                  <td>
                    <Excess $pct={row.overallAvgExcessCagrPct}>
                      {fmtPct(row.overallAvgExcessCagrPct)}
                    </Excess>
                  </td>
                  {windows.map((w) => (
                    <WindowCell
                      key={w.id}
                      cell={row.perWindow.find((c) => c.window === w.id)}
                      isLeader={board.bestPerWindow[w.id] === row.strategyId}
                      range={ranges.perWindow.get(w.id)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </ExpTableScroll>
      </Body>
    </Wrap>
  );
}
