import styled from 'styled-components';
import { theme } from '../../styles/theme';
import { SkeletonBlock, SkeletonText } from '../Skeleton';

const Wrap = styled.div`
  width: 100%;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  overflow: hidden;
`;

const Head = styled.div`
  padding: 22px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 132px 96px repeat(6, 1fr) 92px;
  gap: 12px;
  align-items: center;
  padding: 10px 22px;
  border-bottom: 1px solid ${theme.colors.slateOverlayDark};

  &:last-child {
    border-bottom: none;
  }
`;

const ROW_COUNT = 12;

export function TechnicalsSkeleton() {
  return (
    <Wrap aria-hidden>
      <Head>
        <SkeletonBlock $width="160px" $height="22px" />
        <SkeletonText $width="60%" />
      </Head>
      {Array.from({ length: ROW_COUNT }).map((_, i) => (
        <Row key={i}>
          {Array.from({ length: 9 }).map((__, j) => (
            <SkeletonText key={j} $width={j === 0 ? '80%' : '55%'} />
          ))}
        </Row>
      ))}
    </Wrap>
  );
}
