import { useMemo, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { CardTitle, ExpTableScroll } from './Card';
import { changeColor, fmtPct, STRATEGY_KIND_LABEL, winRateColor } from '../lib/format';
import { strategyAnchor } from '../types/guide';
import type { StrategyLeaderboard, StrategyLeaderboardRow } from '../types/leaderboard';
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

type SortKey = 'overall' | 'excess' | 'assets' | WindowId;
type SortState = { key: SortKey | null; dir: 'asc' | 'desc' };

function cellValue(row: StrategyLeaderboardRow, key: SortKey): number | null {
  if (key === 'overall') return row.overallWinRatePct;
  if (key === 'excess') return row.overallAvgExcessCagrPct;
  if (key === 'assets') return row.assetsCovered;
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

const Lede = styled.p`
  margin: 0;
  padding: 0 22px 16px;
  font-size: 0.74rem;
  line-height: 1.6;
  color: ${theme.colors.textMuted};
  max-width: 86ch;
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
  padding: 0 22px 20px;
`;

const Callout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 16px;
  border-radius: ${theme.radius.md};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid ${theme.colors.borderSlateStrong};
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

const Win = styled.span<{ $pct: number; $leader: boolean }>`
  font-weight: ${({ $leader }) => ($leader ? 700 : 400)};
  color: ${({ $pct }) => winRateColor($pct)};
`;

const LeaderDot = styled.span`
  color: ${theme.colors.accent};
  margin-right: 3px;
`;

const Excess = styled.span<{ $pct: number }>`
  color: ${({ $pct }) => changeColor($pct)};
`;

/** Buy-and-hold's own row — pinned first, never sorted, and reads CAGR, not a win rate. */
const BenchmarkRow = styled.tr`
  background: ${theme.colors.slateOverlayStrong} !important;

  td {
    border-bottom: 1px solid ${theme.colors.borderSlateStrong} !important;
  }
`;

const BenchmarkTag = styled.span`
  font-size: 0.62rem;
  padding: 1px 6px;
  border-radius: ${theme.radius.sm};
  color: ${theme.colors.label};
  border: 1px solid ${theme.colors.borderSlateMuted};
  white-space: nowrap;
`;

const Cagr = styled.span<{ $pct: number }>`
  color: ${({ $pct }) => changeColor($pct)};
`;

const Dash = styled.span`
  color: ${theme.colors.label};
`;

const BenchmarkName = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${theme.colors.textSlate};
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

function WindowCell({
  cell,
  isLeader,
}: {
  cell: { winRatePct: number; avgExcessCagrPct: number; assetsCovered: number } | undefined;
  isLeader: boolean;
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
      <Win $pct={cell.winRatePct} $leader={isLeader}>
        {cell.winRatePct}%
      </Win>
    </td>
  );
}

function BenchmarkWindowCell({
  cell,
}: {
  cell: { avgCagrPct: number; assetsCovered: number } | undefined;
}) {
  if (!cell) return <td>{/* no window mark to keep the layout stable */}</td>;

  return (
    <td title={`Buy & hold's own realized CAGR across ${cell.assetsCovered} assets`}>
      <Cagr $pct={cell.avgCagrPct}>{fmtPct(cell.avgCagrPct)}/yr</Cagr>
    </td>
  );
}

// ---------- Component ----------

export function StrategyLeaderboardCard({ board }: { board: StrategyLeaderboard }) {
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'desc' });

  // Short horizon first — "daily, monthly, yearly" reads left to right.
  const windows = useMemo(() => [...board.windows].reverse(), [board.windows]);
  const rows = useMemo(() => sortRows(board.rows, sort), [board.rows, sort]);
  const best = board.rows.find((r) => r.strategyId === board.bestOverall);

  return (
    <Wrap>
      <Header>
        <CardTitle style={{ margin: 0, whiteSpace: 'nowrap' }}>Strategy Leaderboard</CardTitle>
        <Meta>
          {board.assetsAnalyzed} assets · through {board.date} close
        </Meta>
        <GuideLink href="/guide#strategies">how these rules work</GuideLink>
      </Header>

      <Lede>
        Every rule in the registry, scored across the entire universe instead of one asset at a
        time. Each horizon column is a win rate — the share of assets where the rule beat buying the
        asset at the start of that lookback and holding it, on both return and drawdown. Colour
        follows that split too: red below the 50% coin-flip line, green above it, so two losing
        rules still read as different shades rather than the same flat red. A{' '}
        <LeaderDot>★</LeaderDot> marks the rule that wins a horizon outright; a strategy only
        qualifies once it ran on at least half the universe, so a rule that only cleared warm-up on
        one or two tickers cannot &ldquo;win&rdquo; on a sample of one. The pinned{' '}
        <strong>Buy &amp; Hold</strong> row at the top of the table is the benchmark itself — its
        own realized return per horizon, not a win rate, since it can&rsquo;t beat itself.
      </Lede>

      {best && (
        <CalloutRow>
          <Callout>
            <CalloutLabel>Beats buy &amp; hold most</CalloutLabel>
            <CalloutValue>{best.name}</CalloutValue>
            <CalloutSub>
              {best.overallWinRatePct}% overall · {fmtPct(best.overallAvgExcessCagrPct)} avg excess
              CAGR · {best.assetsCovered} assets
            </CalloutSub>
          </Callout>

          {windows.map((w) => {
            const leaderId = board.bestPerWindow[w.id];
            const leaderRow = leaderId ? board.rows.find((r) => r.strategyId === leaderId) : null;
            const cell = leaderRow?.perWindow.find((c) => c.window === w.id);
            return (
              <Callout key={w.id}>
                <CalloutLabel>{w.label}</CalloutLabel>
                <CalloutValue>{leaderRow ? leaderRow.name : '—'}</CalloutValue>
                {cell && <CalloutSub>{cell.winRatePct}% win rate</CalloutSub>}
              </Callout>
            );
          })}
        </CalloutRow>
      )}

      <SectionLabel>
        <span>Every strategy, by horizon</span>
        <span>win rate vs. buy &amp; hold</span>
      </SectionLabel>

      <Body>
        <ExpTableScroll>
          <Table>
            <thead>
              <tr>
                <th>Strategy</th>
                <SortHead
                  label="Assets"
                  sortKey="assets"
                  sort={sort}
                  onSort={setSort}
                  hint="Distinct assets this rule produced a result for"
                />
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
              {board.benchmark && (
                <BenchmarkRow>
                  <td>
                    <StrategyCell>
                      <BenchmarkName>{board.benchmark.name}</BenchmarkName>
                      <BenchmarkTag title="Fully invested from the first bar — the baseline every row above tries to beat, not a candidate to rank">
                        always long · reference
                      </BenchmarkTag>
                    </StrategyCell>
                  </td>
                  <td>{board.benchmark.assetsCovered}</td>
                  <td title="Buy & hold's own realized CAGR, pooled across every asset and window">
                    <Cagr $pct={board.benchmark.overallAvgCagrPct}>
                      {fmtPct(board.benchmark.overallAvgCagrPct)}/yr
                    </Cagr>
                  </td>
                  <td>
                    <Dash>—</Dash>
                  </td>
                  {windows.map((w) => (
                    <BenchmarkWindowCell
                      key={w.id}
                      cell={board.benchmark!.perWindow.find((c) => c.window === w.id)}
                    />
                  ))}
                </BenchmarkRow>
              )}
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
                  <td>{row.assetsCovered}</td>
                  <td>
                    <Win
                      $pct={row.overallWinRatePct}
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
