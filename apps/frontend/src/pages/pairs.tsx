import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { LoadingStateContent } from '../components/LoadingState';
import { Card, CardTitle } from '../components/Card';
import { PairsTable } from '../components/PairsTable';
import { usePairs } from '../lib/usePairs';

const Empty = styled.div`
  width: 100%;
  padding: 48px 22px;
  text-align: center;
  font-size: 0.82rem;
  color: ${theme.colors.label};
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: ${theme.radius.lg};
  background: ${theme.colors.slateOverlay};
`;

const Head = styled.header`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 2px 6px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 600;
  color: ${theme.colors.label};
`;

const Note = styled.p`
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.65;
  color: ${theme.colors.textMuted};
  max-width: 92ch;
`;

const CardWrap = styled(Card)`
  width: 100%;
`;

const Meta = styled.p`
  margin: 0 0 14px;
  font-size: 0.72rem;
  color: ${theme.colors.label};
`;

const TableScroll = styled.div`
  overflow-x: auto;
`;

/**
 * Cointegrated pairs — the market-neutral counterpart to the single-asset
 * strategy dashboard. Every row here passed Engle-Granger cointegration
 * (both directions) and the Hurst exponent check, not just a correlation
 * threshold; `regimeStatus` is the live answer to whether that relationship
 * still holds today.
 */
export default function PairsPage() {
  const { data, loading } = usePairs();

  return (
    <Page>
      <MainContainer>
        <Head>
          <Title>Pairs</Title>
          <Note>
            Candidate pairs tested for cointegration — a statistical anchor between two prices,
            stronger than correlation — rather than just how closely they&apos;ve recently moved
            together. Only pairs that pass Engle-Granger in both directions, the Hurst exponent
            check, and a tradeable half-life get monitored here. Status flips to Warning or Halted
            the moment the relationship weakens, independent of whether a position is currently
            open.
          </Note>
        </Head>

        {loading && !data ? (
          <LoadingStateContent />
        ) : data && data.pairs.length > 0 ? (
          <CardWrap>
            <CardTitle>Monitored pairs</CardTitle>
            <Meta>
              {data.pairs.length} of {data.candidatesScanned} candidates cointegrated · as of{' '}
              {data.date}
            </Meta>
            <TableScroll>
              <PairsTable pairs={data.pairs} />
            </TableScroll>
          </CardWrap>
        ) : (
          <Empty>
            No candidate pairs currently pass cointegration testing. This is expected — most
            candidate pairs will not, and the ones that pass are re-checked daily. Wait for the next
            report or widen the candidate list in <code>constants/pairs.ts</code>.
          </Empty>
        )}
      </MainContainer>
    </Page>
  );
}
