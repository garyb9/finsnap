import styled from 'styled-components';
import {
  OptionsCard as OptionsCardStyled,
  CardTitle,
  TickerPrice,
  MetricLabel,
  ExpTableScroll,
  ExpTable,
} from './Card';
import { fmtNum, fmtK } from '../lib/format';
import { theme } from '../styles/theme';
import type { FinSnap, OptionsSkewInsight } from '../types/finsnap';

const InsightCell = styled.td<{ $side: 'calls' | 'puts' | 'none' }>`
  min-width: 220px;
  width: 22%;
  color: ${({ $side }) =>
    $side === 'calls'
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

function InsightContent({ insight }: { insight?: OptionsSkewInsight }) {
  if (
    !insight ||
    insight.label === 'balanced' ||
    insight.label === 'thin' ||
    insight.dominantSide === 'none'
  ) {
    return <span style={{ color: theme.colors.label }}>—</span>;
  }
  const { dominantSide, wallStrike, distanceToSpotPct, nearSpotCluster } = insight;
  const arrow = dominantSide === 'calls' ? '↑' : '↓';
  const sign = distanceToSpotPct >= 0 ? '+' : '';
  return (
    <>
      {arrow} ${fmtNum(wallStrike, 2)}{' '}
      <span style={{ opacity: 0.7 }}>
        ({sign}
        {distanceToSpotPct.toFixed(1)}%)
      </span>
      {nearSpotCluster && <NearSpotBadge>near spot</NearSpotBadge>}
    </>
  );
}

export function OptionsCard({
  ticker,
  data,
}: {
  ticker: string;
  data: FinSnap['equities'][string];
}) {
  const { price, expirations } = data;
  return (
    <OptionsCardStyled>
      <CardTitle>Options — {ticker}</CardTitle>
      <TickerPrice>
        ${fmtNum(price, 2)}
        <span>{ticker}</span>
      </TickerPrice>
      {expirations.length === 0 ? (
        <MetricLabel>No expirations available</MetricLabel>
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
              {expirations.slice(0, 12).map((exp) => {
                const side = exp.insight?.dominantSide ?? 'none';
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
                    <InsightCell
                      $side={
                        side === 'none'
                          ? 'none'
                          : exp.insight?.label === 'call_stack'
                            ? 'calls'
                            : exp.insight?.label === 'put_stack'
                              ? 'puts'
                              : 'none'
                      }
                    >
                      <InsightContent insight={exp.insight} />
                    </InsightCell>
                  </tr>
                );
              })}
            </tbody>
          </ExpTable>
        </ExpTableScroll>
      )}
    </OptionsCardStyled>
  );
}
