import styled from 'styled-components';
import { theme } from '../../styles/theme';
import { SkeletonBlock, SkeletonText } from '../Skeleton';

const Wrap = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const KpiRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  overflow: hidden;

  @media (max-width: ${theme.breakpoints.sm}) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const Tile = styled.div`
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: ${theme.colors.slateOverlay};
`;

const TickerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
`;

const TickerCardSkel = styled.div`
  padding: 14px 16px;
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.borderSlate};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ReportCard = styled.div`
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  overflow: hidden;
`;

const ReportHead = styled.div`
  padding: 20px 22px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  display: flex;
  gap: 24px;
`;

const OrderRow = styled.div`
  padding: 12px 22px;
  border-bottom: 1px solid ${theme.colors.slateOverlayDark};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export function DashboardSkeleton() {
  return (
    <Wrap aria-hidden>
      <KpiRow>
        {Array.from({ length: 4 }).map((_, i) => (
          <Tile key={i}>
            <SkeletonText $width="50%" />
            <SkeletonBlock $width="40%" $height="22px" />
          </Tile>
        ))}
      </KpiRow>

      <TickerGrid>
        {Array.from({ length: 8 }).map((_, i) => (
          <TickerCardSkel key={i}>
            <SkeletonText $width="60%" />
            <SkeletonBlock $width="70%" $height="20px" />
            <SkeletonBlock $width="100%" $height="22px" />
          </TickerCardSkel>
        ))}
      </TickerGrid>

      <ReportCard>
        <ReportHead>
          <SkeletonBlock $width="140px" $height="18px" />
          <SkeletonBlock $width="220px" $height="18px" />
        </ReportHead>
        {Array.from({ length: 5 }).map((_, i) => (
          <OrderRow key={i}>
            <SkeletonText $width="40%" />
            <SkeletonText $width="80%" />
          </OrderRow>
        ))}
      </ReportCard>
    </Wrap>
  );
}
