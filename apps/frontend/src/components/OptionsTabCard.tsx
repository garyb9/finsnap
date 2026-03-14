import { useState } from 'react';
import styled from 'styled-components';
import { CardTitle, ExpTableScroll, ExpTable } from './Card';
import { fmtNum, fmtK } from '../lib/format';
import { theme } from '../styles/theme';
import type { FinSnap, OptionsSkewInsight } from '../types/finsnap';

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

const InsightCell = styled.td<{ $side: 'calls' | 'puts' | 'none'; $soft?: boolean }>`
  min-width: 200px;
  width: 20%;
  color: ${({ $side, $soft }) =>
    $soft
      ? theme.colors.textMuted
      : $side === 'calls'
        ? theme.colors.success
        : $side === 'puts'
          ? theme.colors.danger
          : theme.colors.label} !important;
`;

const NearSpotBadge = styled.span`
  display: inline-block;
  font-size: 0.63rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 5px;
  background: rgba(56, 189, 248, 0.1);
  color: ${theme.colors.accent};
  border: 1px solid rgba(56, 189, 248, 0.2);
  vertical-align: middle;
`;

// ---------- Helpers ----------

function InsightContent({ insight }: { insight?: OptionsSkewInsight }) {
  if (
    !insight ||
    insight.label === 'balanced' ||
    insight.label === 'thin' ||
    insight.dominantSide === 'none'
  ) {
    return <span style={{ color: theme.colors.label }}>—</span>;
  }
  const { dominantSide, wallStrike, distanceToSpotPct, nearSpotCluster, label } = insight;
  const isSoft = label === 'soft_call' || label === 'soft_put';
  const arrow = dominantSide === 'calls' ? '↑' : '↓';
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

// ---------- Component ----------

type EquityEntry = FinSnap['equities'][string];

interface Props {
  equities: FinSnap['equities'];
}

export function OptionsTabCard({ equities }: Props) {
  const tickers = Object.keys(equities);
  const [active, setActive] = useState(tickers[0] ?? '');

  if (tickers.length === 0) return null;

  const data: EquityEntry = equities[active] ?? equities[tickers[0]];

  return (
    <Wrap>
      <Header>
        <CardTitle style={{ margin: 0, whiteSpace: 'nowrap' }}>Options</CardTitle>
        <TabBar>
          {tickers.map((t) => (
            <Tab key={t} $active={t === active} onClick={() => setActive(t)}>
              {t}
            </Tab>
          ))}
        </TabBar>
      </Header>

      <PriceRow>
        <PriceNum>${fmtNum(data.price, 2)}</PriceNum>
        <TickerLabel>{active}</TickerLabel>
      </PriceRow>

      {data.description && <Description>{data.description}</Description>}

      <Body>
        {data.expirations.length === 0 ? (
          <NoData>No expirations available</NoData>
        ) : (
          <ExpTableScroll>
            <ExpTable>
              <thead>
                <tr>
                  <th>Expiry</th>
                  <th>P/C</th>
                  <th>Call Strike</th>
                  <th>Call Vol</th>
                  <th>Call OI</th>
                  <th>Put Strike</th>
                  <th>Put Vol</th>
                  <th>Put OI</th>
                  <th>Wall</th>
                </tr>
              </thead>
              <tbody>
                {data.expirations.slice(0, 12).map((exp) => {
                  const insightLabel = exp.insight?.label;
                  const isSoft = insightLabel === 'soft_call' || insightLabel === 'soft_put';
                  const side: 'calls' | 'puts' | 'none' =
                    insightLabel === 'call_stack' || insightLabel === 'soft_call'
                      ? 'calls'
                      : insightLabel === 'put_stack' || insightLabel === 'soft_put'
                        ? 'puts'
                        : 'none';
                  return (
                    <tr key={exp.date}>
                      <td>{exp.date}</td>
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
