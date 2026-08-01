import styled from 'styled-components';
import { theme } from '../styles/theme';
import { fmtPct } from '../lib/format';
import { PairRegimeStatus, SpreadDirection } from '../types/enums';
import type { CompactPair } from '../types/pairs';
import { ExpTable } from './Card';

const REGIME_LABEL: Record<PairRegimeStatus, string> = {
  [PairRegimeStatus.Active]: 'Active',
  [PairRegimeStatus.Warning]: 'Warning',
  [PairRegimeStatus.Halted]: 'Halted',
};

const REGIME_COLOR: Record<PairRegimeStatus, string> = {
  [PairRegimeStatus.Active]: theme.colors.success,
  [PairRegimeStatus.Warning]: theme.colors.warning,
  [PairRegimeStatus.Halted]: theme.colors.danger,
};

const DIRECTION_LABEL: Record<SpreadDirection, string> = {
  [SpreadDirection.LongSpread]: 'Long spread',
  [SpreadDirection.ShortSpread]: 'Short spread',
  [SpreadDirection.Flat]: 'Flat',
};

const RegimeBadge = styled.span<{ $status: PairRegimeStatus }>`
  font-size: 0.72rem;
  font-weight: 700;
  color: ${({ $status }) => REGIME_COLOR[$status]};
  padding: 1px 8px;
  border: 1px solid ${({ $status }) => REGIME_COLOR[$status]}44;
  border-radius: ${theme.radius.pill};
  white-space: nowrap;
`;

const PairName = styled.div`
  font-weight: 600;
  color: ${theme.colors.textSlate};
`;

const Rationale = styled.div`
  font-size: 0.72rem;
  color: ${theme.colors.label};
  max-width: 42ch;
  line-height: 1.4;
`;

const ZValue = styled.span<{ $z: number }>`
  font-weight: 700;
  color: ${({ $z }) => (Math.abs($z) >= 2 ? theme.colors.accent : theme.colors.textSlateLight)};
`;

/**
 * One row per cointegrated pair: its current health, which side of the
 * spread it's on, how stretched that spread is, and how the fixed rule has
 * performed historically over its headline window.
 */
export function PairsTable({ pairs }: { pairs: CompactPair[] }) {
  return (
    <ExpTable>
      <thead>
        <tr>
          <th>Status</th>
          <th>Pair</th>
          <th>Direction</th>
          <th>Z-score</th>
          <th>Half-life</th>
          <th>Hedge ratio</th>
          <th>p-value</th>
          <th>Headline return</th>
          <th>Sharpe</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((pair) => (
          <tr key={pair.pairId}>
            <td>
              <RegimeBadge $status={pair.regimeStatus}>
                {REGIME_LABEL[pair.regimeStatus]}
              </RegimeBadge>
            </td>
            <td>
              <PairName>{pair.pairId}</PairName>
              <Rationale>{pair.rationale}</Rationale>
            </td>
            <td>{DIRECTION_LABEL[pair.direction]}</td>
            <td>
              <ZValue $z={pair.currentZ}>{pair.currentZ.toFixed(2)}</ZValue>
            </td>
            <td>{pair.halfLifeDays.toFixed(0)}d</td>
            <td>{pair.hedgeRatio.toFixed(3)}</td>
            <td>{pair.pValue.toFixed(4)}</td>
            <td>{pair.headline ? fmtPct(pair.headline.totalReturnPct) : '—'}</td>
            <td>{pair.headline ? pair.headline.sharpe.toFixed(2) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </ExpTable>
  );
}
