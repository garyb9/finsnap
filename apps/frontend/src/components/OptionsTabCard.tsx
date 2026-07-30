import { Fragment, useMemo, useState } from 'react';
import styled from 'styled-components';
import { CardTitle, ExpTableScroll, ExpTable } from './Card';
import { OptionsOverview } from './OptionsOverview';
import { fmtNum, fmtK } from '../lib/format';
import {
  assetsWithChains,
  daysToExpiry,
  shortDate,
  summarizeChain,
  type WallKind,
} from '../lib/options';
import { theme } from '../styles/theme';
import { OptionsSide, OptionsSkewLabel } from '../types/enums';
import type { AssetSnap, OptionsExpiration, OptionsSkewInsight } from '../types/finsnap';

// ---------- Sort ----------

type SortKey =
  | 'date'
  | 'pcRatio'
  | 'callStrike'
  | 'callVolume'
  | 'callOI'
  | 'putStrike'
  | 'putVolume'
  | 'putOI'
  | 'wall';

type SortState = { key: SortKey; dir: 'asc' | 'desc' };

/**
 * Expiry order is the table's natural reading, so it is where sorting starts
 * and where a third click returns to.
 */
const DEFAULT_SORT: SortState = { key: 'date', dir: 'asc' };

function sortValue(exp: OptionsExpiration, key: SortKey): number | string | null {
  switch (key) {
    case 'date':
      return exp.date;
    case 'pcRatio':
      return exp.pcRatio;
    case 'callStrike':
      return exp.calls.weightedMeanStrike;
    case 'callVolume':
      return exp.calls.totalVolume;
    case 'callOI':
      return exp.calls.totalOI;
    case 'putStrike':
      return exp.puts.weightedMeanStrike;
    case 'putVolume':
      return exp.puts.totalVolume;
    case 'putOI':
      return exp.puts.totalOI;
    case 'wall':
      // How far the wall sits from spot, sign discarded: sorting by wall means
      // "which expiry has one closest to the money", not "which is highest".
      return exp.insight && exp.insight.dominantSide !== OptionsSide.None
        ? Math.abs(exp.insight.distanceToSpotPct)
        : null;
  }
}

function sortExpirations(rows: OptionsExpiration[], sort: SortState): OptionsExpiration[] {
  const sign = sort.dir === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);

    // Expiries with no wall sink to the bottom whichever way the column points.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    if (typeof left === 'string' || typeof right === 'string') {
      return sign * String(left).localeCompare(String(right));
    }
    return sign * (left - right);
  });
}

/** Descending → ascending → back to expiry order. */
function nextSort(current: SortState, clicked: SortKey): SortState {
  if (current.key !== clicked) return { key: clicked, dir: 'desc' };
  if (current.dir === 'desc') return { key: clicked, dir: 'asc' };
  return DEFAULT_SORT;
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
  align-items: center;
  gap: 16px;
  padding: 20px 22px 0;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const TabBar = styled.div`
  display: flex;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

/**
 * Separates the base universe from tickers pulled in by a search.
 *
 * Stretched to the row rather than given a fixed height, so it always matches
 * the tabs' own height instead of guessing at their font metrics.
 */
const TabDivider = styled.span`
  flex: none;
  align-self: stretch;
  width: 1px;
  margin: 5px 3px;
  background: ${theme.colors.borderSlateTable};
`;

const Tab = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 4px 12px 6px;
  border-radius: ${theme.radius.sm} ${theme.radius.sm} 0 0;
  margin-bottom: -1px;
  color: ${({ $active }) => ($active ? theme.colors.textSlate : theme.colors.label)};
  border-bottom: 2px solid ${({ $active }) => ($active ? theme.colors.accent : 'transparent')};
  transition:
    color 0.15s,
    border-color 0.15s;
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.textSlate};
  }
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 22px 6px;
`;

const PriceNum = styled.span`
  font-size: 1.6rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  font-variant-numeric: tabular-nums;
`;

const TickerLabel = styled.span`
  font-size: 0.88rem;
  color: ${theme.colors.label};
`;

const Description = styled.div`
  font-size: 0.72rem;
  color: ${theme.colors.textMuted};
  padding: 0 22px 10px;
`;

const Body = styled.div`
  padding: 0 22px 20px;
`;

const NoData = styled.div`
  padding: 20px 0;
  font-size: 0.8rem;
  color: ${theme.colors.label};
`;

const InsightCell = styled.td<{ $side: OptionsSide; $soft?: boolean }>`
  min-width: 200px;
  width: 20%;
  color: ${({ $side, $soft }) =>
    $soft
      ? theme.colors.textMuted
      : $side === OptionsSide.Calls
        ? theme.colors.success
        : $side === OptionsSide.Puts
          ? theme.colors.danger
          : theme.colors.label} !important;
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

  &:focus-visible {
    outline: 1px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

const DateCell = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
`;

const DaysOut = styled.span`
  font-size: 0.66rem;
  color: ${theme.colors.label};
`;

const NearSpotBadge = styled.span`
  display: inline-block;
  font-size: 0.63rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 5px;
  background: rgba(46, 194, 174, 0.12);
  color: ${theme.colors.accent};
  border: 1px solid rgba(46, 194, 174, 0.22);
  vertical-align: middle;
`;

// ---------- Helpers ----------

function InsightContent({ insight }: { insight?: OptionsSkewInsight }) {
  if (
    !insight ||
    insight.label === OptionsSkewLabel.Balanced ||
    insight.label === OptionsSkewLabel.Thin ||
    insight.dominantSide === OptionsSide.None
  ) {
    return <span style={{ color: theme.colors.label }}>—</span>;
  }
  const { dominantSide, wallStrike, distanceToSpotPct, nearSpotCluster, label } = insight;
  const isSoft = label === OptionsSkewLabel.SoftCall || label === OptionsSkewLabel.SoftPut;
  // Same glyphs the wall map uses, so a call wall looks like a call wall in both.
  const arrow = dominantSide === OptionsSide.Calls ? '▲' : '▼';
  const sign = distanceToSpotPct >= 0 ? '+' : '';
  return (
    <>
      <span style={{ opacity: isSoft ? 0.55 : 1 }}>{arrow}</span> ${fmtNum(wallStrike, 2)}{' '}
      <span style={{ opacity: 0.6 }}>
        ({sign}
        {distanceToSpotPct.toFixed(1)}%)
      </span>
      {isSoft && <span style={{ fontSize: '0.65rem', marginLeft: 4, opacity: 0.5 }}>soft</span>}
      {!isSoft && nearSpotCluster && <NearSpotBadge>near spot</NearSpotBadge>}
    </>
  );
}

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

// ---------- Component ----------

interface Props {
  assets: AssetSnap[];
  /** Which wall glossary term is highlighted right now, shared with the page above. */
  hoveredKind: WallKind | null;
  onHoverKind: (kind: WallKind | null) => void;
}

export function OptionsTabCard({ assets, hoveredKind, onHoverKind }: Props) {
  // Only assets that actually carry a chain get a tab.
  const withChains = assetsWithChains(assets);
  // The snapshot lists the configured universe first, searched tickers
  // appended after — a divider marks where that split falls, when both kinds
  // are actually present.
  const firstSearched = withChains.findIndex((a) => a.searched);
  const showDivider = firstSearched > 0;
  const [active, setActive] = useState(0);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const asset = withChains[Math.min(active, Math.max(0, withChains.length - 1))];
  const expirations = useMemo(() => asset?.options?.expirations ?? [], [asset]);
  const summary = useMemo(() => summarizeChain(expirations), [expirations]);
  const rows = useMemo(() => sortExpirations(expirations, sort), [expirations, sort]);

  if (withChains.length === 0 || !asset) return null;

  const data = {
    price: asset.options?.price ?? asset.currentPrice,
    expirations,
  };

  return (
    <Wrap>
      <Header>
        <CardTitle style={{ margin: 0, whiteSpace: 'nowrap' }}>Options</CardTitle>
        <TabBar>
          {withChains.map((a, i) => (
            <Fragment key={a.symbol}>
              {showDivider && i === firstSearched && <TabDivider />}
              <Tab $active={a.symbol === asset.symbol} onClick={() => setActive(i)}>
                {a.label}
              </Tab>
            </Fragment>
          ))}
        </TabBar>
      </Header>

      <PriceRow>
        <PriceNum>${fmtNum(data.price, 2)}</PriceNum>
        <TickerLabel>{asset.label}</TickerLabel>
      </PriceRow>

      {asset.description && <Description>{asset.description}</Description>}

      {data.expirations.length > 0 && (
        <OptionsOverview
          summary={summary}
          expirations={data.expirations}
          spot={data.price}
          hoveredKind={hoveredKind}
          onHoverKind={onHoverKind}
        />
      )}

      <Body>
        {data.expirations.length === 0 ? (
          <NoData>No expirations available</NoData>
        ) : (
          <ExpTableScroll>
            <ExpTable>
              <thead>
                <tr>
                  <SortHead
                    label="Expiry"
                    sortKey="date"
                    sort={sort}
                    onSort={setSort}
                    hint="Contract expiry date"
                  />
                  <SortHead
                    label="P/C"
                    sortKey="pcRatio"
                    sort={sort}
                    onSort={setSort}
                    hint="Put volume divided by call volume — above 1 means more puts traded"
                  />
                  <SortHead
                    label="Call Strike"
                    sortKey="callStrike"
                    sort={sort}
                    onSort={setSort}
                    hint="Volume-weighted mean call strike, ± one weighted standard deviation"
                  />
                  <SortHead label="Call Vol" sortKey="callVolume" sort={sort} onSort={setSort} />
                  <SortHead label="Call OI" sortKey="callOI" sort={sort} onSort={setSort} />
                  <SortHead
                    label="Put Strike"
                    sortKey="putStrike"
                    sort={sort}
                    onSort={setSort}
                    hint="Volume-weighted mean put strike, ± one weighted standard deviation"
                  />
                  <SortHead label="Put Vol" sortKey="putVolume" sort={sort} onSort={setSort} />
                  <SortHead label="Put OI" sortKey="putOI" sort={sort} onSort={setSort} />
                  <SortHead
                    label="Wall"
                    sortKey="wall"
                    sort={sort}
                    onSort={setSort}
                    hint="Sorts by how close the wall sits to spot; expiries without one go last"
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((exp) => {
                  const insightLabel = exp.insight?.label;
                  const isSoft =
                    insightLabel === OptionsSkewLabel.SoftCall ||
                    insightLabel === OptionsSkewLabel.SoftPut;
                  const side: OptionsSide =
                    insightLabel === OptionsSkewLabel.CallStack || isSoft
                      ? insightLabel === OptionsSkewLabel.SoftPut
                        ? OptionsSide.Puts
                        : OptionsSide.Calls
                      : insightLabel === OptionsSkewLabel.PutStack
                        ? OptionsSide.Puts
                        : OptionsSide.None;
                  return (
                    <tr key={exp.date}>
                      <td>
                        <DateCell>
                          {exp.date}
                          <DaysOut title={`${shortDate(exp.date)} — days from today`}>
                            {daysToExpiry(exp.date)}d
                          </DaysOut>
                        </DateCell>
                      </td>
                      <td
                        style={{
                          color: exp.pcRatio > 1 ? theme.colors.danger : theme.colors.success,
                        }}
                      >
                        {exp.pcRatio.toFixed(2)}
                      </td>
                      <td>
                        ${fmtNum(exp.calls.weightedMeanStrike, 2)}{' '}
                        <span style={{ color: theme.colors.label }}>
                          ±{fmtNum(exp.calls.weightedStdStrike, 2)}
                        </span>
                      </td>
                      <td>{fmtK(exp.calls.totalVolume)}</td>
                      <td>{fmtK(exp.calls.totalOI)}</td>
                      <td>
                        ${fmtNum(exp.puts.weightedMeanStrike, 2)}{' '}
                        <span style={{ color: theme.colors.label }}>
                          ±{fmtNum(exp.puts.weightedStdStrike, 2)}
                        </span>
                      </td>
                      <td>{fmtK(exp.puts.totalVolume)}</td>
                      <td>{fmtK(exp.puts.totalOI)}</td>
                      <InsightCell $side={side} $soft={isSoft}>
                        <InsightContent insight={exp.insight} />
                      </InsightCell>
                    </tr>
                  );
                })}
              </tbody>
            </ExpTable>
          </ExpTableScroll>
        )}
      </Body>
    </Wrap>
  );
}
