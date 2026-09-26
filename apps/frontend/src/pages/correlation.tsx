import { useState } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { LoadingStateContent } from '../components/LoadingState';
import { CardTitle } from '../components/Card';
import { CorrelationHeatmap } from '../components/CorrelationHeatmap';
import { CorrelationGraph } from '../components/CorrelationGraph';
import { useCorrelation } from '../lib/useCorrelation';
import { CORRELATION_WINDOWS, DEFAULT_CORRELATION_WINDOW } from '../lib/correlation';

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
`;

const WindowRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
`;

const WindowButton = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 5px 13px;
  border-radius: ${theme.radius.pill};
  color: ${({ $active }) => ($active ? theme.colors.background : theme.colors.textMuted)};
  background: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.slateOverlay)};
  border: 1px solid ${({ $active }) => ($active ? theme.colors.accent : theme.colors.borderSlate)};
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    color: ${({ $active }) => ($active ? theme.colors.background : theme.colors.text)};
  }
`;

const CardWrap = styled.section`
  width: 100%;
  border-radius: ${theme.radius.lg};
  padding: 20px 22px;
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
`;

const Meta = styled.p`
  margin: 0 0 14px;
  font-size: 0.72rem;
  color: ${theme.colors.label};
`;

/**
 * Cross-asset price correlation, as a map and as a network.
 *
 * The heatmap is the exhaustive read: every pair, at a glance, ranked by row
 * and column. The network below it is the same numbers asking a different
 * question — not "what is the value for this pair" but "which handful of
 * assets actually move as a block", which a grid of 500 cells cannot answer
 * as quickly as a cluster of lines can.
 */
export default function CorrelationPage() {
  const [windowId, setWindowId] = useState(DEFAULT_CORRELATION_WINDOW);
  const { matrix, loading } = useCorrelation(windowId);

  return (
    <Page>
      <MainContainer>
        <Head>
          <Title>Correlation</Title>
          <Note>
            How closely each asset&apos;s daily moves track every other&apos;s, computed from
            returns rather than price levels so a shared uptrend never reads as a relationship on
            its own. Not a signal — a diversified book leans on the pairs that sit near zero, and a
            concentrated one is usually concentrated in the ones sitting near +1.
          </Note>
        </Head>

        <WindowRow>
          {CORRELATION_WINDOWS.map((w) => (
            <WindowButton key={w.id} $active={w.id === windowId} onClick={() => setWindowId(w.id)}>
              {w.label}
            </WindowButton>
          ))}
        </WindowRow>

        {loading && !matrix ? (
          <LoadingStateContent />
        ) : matrix ? (
          <>
            <CardWrap>
              <CardTitle>Price correlation map</CardTitle>
              <Meta>
                {matrix.nodes.length} assets · {matrix.window.label.toLowerCase()} of daily bars ·
                generated {new Date(matrix.generatedAt).toLocaleString()}
              </Meta>
              <CorrelationHeatmap matrix={matrix} />
            </CardWrap>

            <CardWrap>
              <CardTitle>Correlation network</CardTitle>
              <Meta>
                Assets grouped by category around the circle; lines connect pairs whose correlation
                clears the threshold below, colored the same red-to-green scale as the map above.
              </Meta>
              <CorrelationGraph matrix={matrix} />
            </CardWrap>
          </>
        ) : (
          <Empty>
            No bar history available yet — the correlation map is built from the same daily bars the
            backtests use. Run a sync from the control in the top right, or wait for the scheduler.
          </Empty>
        )}
      </MainContainer>
    </Page>
  );
}
