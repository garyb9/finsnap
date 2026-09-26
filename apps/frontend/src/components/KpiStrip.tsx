import styled from 'styled-components';
import { theme } from '../styles/theme';
import { relativeTime, scoreColor } from '../lib/format';
import type { FinSnap } from '../types/finsnap';

const Strip = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  background: ${theme.colors.borderSlate};
  overflow: hidden;
  box-shadow: ${theme.colors.shadowCard};

  @media (max-width: ${theme.breakpoints.sm}) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const Tile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
`;

const TileLabel = styled.span`
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const TileValue = styled.span<{ $color?: string }>`
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${({ $color }) => $color ?? theme.colors.textSlate};
`;

export interface KpiStripProps {
  market: FinSnap['market'];
  snapAt: string | null;
  stale: boolean;
}

export function KpiStrip({ market, snapAt, stale }: KpiStripProps) {
  return (
    <Strip>
      <Tile>
        <TileLabel>Breadth</TileLabel>
        <TileValue $color={scoreColor(market.breadth)}>{Math.round(market.breadth)}/100</TileValue>
      </Tile>
      <Tile>
        <TileLabel>Avg TSMOM</TileLabel>
        <TileValue $color={scoreColor(market.avgTsmom)}>{Math.round(market.avgTsmom)}</TileValue>
      </Tile>
      <Tile>
        <TileLabel>Tracked</TileLabel>
        <TileValue>{market.assetsTracked}</TileValue>
      </Tile>
      <Tile>
        <TileLabel>Updated</TileLabel>
        <TileValue $color={stale ? theme.colors.warning : theme.colors.success}>
          {snapAt ? relativeTime(snapAt) : '—'}
        </TileValue>
      </Tile>
    </Strip>
  );
}
