import { useMemo, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { CardTitle, ExpTableScroll } from './Card';
import { ASSET_CLASS_LABEL, changeColor, columnRankColor, fmtPct } from '../lib/format';
import { StrategyKindTag } from './StrategyKindTag';
import { strategyAnchor } from '../types/guide';
import type {
  BenchmarkSummary,
  ClassLeaderboardCell,
  StrategyLeaderboard,
  StrategyLeaderboardRow,
} from '../types/leaderboard';
import { AssetClass, WindowId } from '../types/enums';

/** Equities first — it is most of the universe today; crypto is one asset and grows from here. */
const CLASS_ORDER = [AssetClass.Equity, AssetClass.Crypto];

/** How many rows each asset-class column shows before it is cut off. */
const CLASS_TOP_N = 5;

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

    &:nth-child(2) {
      text-align: left;
    }
  }

  tbody td {
    padding: 8px 10px;
    text-align: right;
    color: ${theme.colors.textSlateLight};
    border-bottom: 1px solid ${theme.colors.slateOverlayDark};
    font-variant-numeric: tabular-nums;

    &:nth-child(2) {
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

/** Narrow so the row count reads as a count, not another data column. */
const RankHead = styled.th`
  width: 28px;
`;

const RankNum = styled.span`
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
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
  align-items: center;
  gap: 7px;
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

const ClassGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  padding: 16px 22px 20px;
`;

const ClassColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ClassColumnTitle = styled.div`
  font-size: 0.72rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  padding-bottom: 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const ClassRow = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  text-decoration: none;
  border-bottom: 1px solid ${theme.colors.slateOverlayDark};

  &:last-child {
    border-bottom: none;
  }
`;

const ClassRank = styled.span`
  font-size: 0.66rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
  width: 14px;
  flex: none;
`;

const ClassName = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 0.76rem;
  font-weight: 600;
  color: ${theme.colors.textSlate};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${ClassRow}:hover & {
    color: ${theme.colors.accent};
  }
`;

const ClassWinRate = styled.span<{ $color: string }>`
  flex: none;
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${({ $color }) => $color};
`;

const ClassN = styled.span`
  flex: none;
  font-size: 0.62rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
`;

const ClassEmpty = styled.div`
  font-size: 0.74rem;
  color: ${theme.colors.label};
  padding: 8px 0;
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

type ClassLeader = { row: StrategyLeaderboardRow; cell: ClassLeaderboardCell };

/**
 * Top strategies for one asset class, ranked the same way the table's own
 * "Overall" column is — win rate first, average excess CAGR breaks a tie —
 * except pooled over only that class's assets instead of the whole universe.
 * A thin class (crypto is one asset today) still shows up, honestly labelled
 * with its own asset count rather than hidden behind a coverage floor.
 */
function ClassColumnBody({ assetClass, leaders }: { assetClass: AssetClass; leaders: ClassLeader[] }) {
  return (
    <ClassColumn>
      <ClassColumnTitle>{ASSET_CLASS_LABEL[assetClass]}</ClassColumnTitle>
      {leaders.length === 0 ? (
        <ClassEmpty>No strategy has a result on this class yet.</ClassEmpty>
      ) : (
        leaders.map(({ row, cell }, i) => (
          <ClassRow key={row.strategyId} href={`/guide#${strategyAnchor(row.strategyId)}`}>
            <ClassRank>{i + 1}</ClassRank>
            <StrategyKindTag kind={row.kind} />
            <ClassName>{row.name}</ClassName>
            <ClassWinRate
              $color={changeColor(cell.avgExcessCagrPct)}
              title={`${cell.winRatePct}% win rate · avg excess CAGR ${fmtPct(cell.avgExcessCagrPct)} · ${cell.assetsCovered} assets`}
            >
              {cell.winRatePct}%
            </ClassWinRate>
            <ClassN>n={cell.assetsCovered}</ClassN>
          </ClassRow>
        ))
      )}
    </ClassColumn>
  );
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

  const classColumns = useMemo(() => {
    return CLASS_ORDER.map((assetClass) => {
      const leaders = board.rows
        .map((row) => ({
          row,
          cell: row.byAssetClass.find((c) => c.assetClass === assetClass),
        }))
        .filter((x): x is ClassLeader => x.cell !== undefined)
        .sort(
          (a, b) =>
            b.cell.winRatePct - a.cell.winRatePct || b.cell.avgExcessCagrPct - a.cell.avgExcessCagrPct
        )
        .slice(0, CLASS_TOP_N);

      return { assetClass, leaders };
    }).filter((col) => col.leaders.length > 0);
  }, [board.rows]);

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
          {board.assetsAnalyzed} assets · {rows.length} strategies · through {board.date} close
        </Meta>
        <GuideLink href="/guide#strategies">how these rules work</GuideLink>
      </Header>

      {board.benchmark && (
        <BenchmarkBandRow benchmark={board.benchmark} windows={windows} range={ranges.benchmark} />
      )}

      <SectionLabel>
        <span>Every strategy, by horizon</span>
        <Legend>
          <span>share of assets that beat holding</span>
          <span>·</span>
          <span>
            green/red ranks the field at that horizon, best to worst — not a signal a green cell beat
            buy &amp; hold outright
          </span>
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
                <RankHead>#</RankHead>
                <th>Strategy</th>
                <SortHead
                  label="Win Rate"
                  sortKey="overall"
                  sort={sort}
                  onSort={setSort}
                  hint="Share of asset-window pairs this rule beat buy & hold on, pooled across everything. Below 50% means it loses to holding more often than not — buy & hold itself has no win rate, since it's the line every row is measured against."
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
              {rows.map((row, i) => (
                <tr key={row.strategyId}>
                  <td>
                    <RankNum>{i + 1}</RankNum>
                  </td>
                  <td>
                    <StrategyCell>
                      <StrategyKindTag kind={row.kind} />
                      <StrategyName href={`/guide#${strategyAnchor(row.strategyId)}`}>
                        {row.name}
                      </StrategyName>
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
                      title={`${row.overallWinRatePct}% win rate against buy & hold — shaded against the other ${rows.length} rules, not against a 50% coin flip`}
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

      {classColumns.length > 0 && (
        <>
          <SectionLabel>
            <span>Best by asset class</span>
            <Legend>
              <span>ranked the same way as Overall, pooled within the class instead of the universe</span>
            </Legend>
          </SectionLabel>
          <ClassGrid>
            {classColumns.map(({ assetClass, leaders }) => (
              <ClassColumnBody key={assetClass} assetClass={assetClass} leaders={leaders} />
            ))}
          </ClassGrid>
        </>
      )}
    </Wrap>
  );
}
