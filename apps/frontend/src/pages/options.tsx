import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { OptionsTabCard } from '../components/OptionsTabCard';
import { LoadingStateContent } from '../components/LoadingState';
import { useFinSnapData } from '../lib/dataContext';

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

const Note = styled.p`
  width: 100%;
  margin: 0 0 4px;
  font-size: 0.74rem;
  line-height: 1.6;
  color: ${theme.colors.label};
  max-width: 80ch;
`;

/**
 * Options positioning, on its own tab.
 *
 * Given a page of its own because it answers a different question from the
 * report: not "should I be in this" but "where is everyone else positioned".
 * It is context, never a signal — nothing here feeds the backtests.
 */
export default function OptionsPage() {
  const { snap, loading } = useFinSnapData();
  const assets = snap ? Object.values(snap.assets).filter((a) => a.options) : [];

  if (loading && !snap) {
    return (
      <Page>
        <LoadingStateContent />
      </Page>
    );
  }

  return (
    <Page>
      <MainContainer>
        <Note>
          Open interest and volume by expiry for the liquid tickers. Read this as context rather
          than as a signal — none of it feeds the strategies, and a wall of puts is a statement
          about positioning, not about direction.
        </Note>

        {assets.length > 0 ? (
          <OptionsTabCard assets={assets} />
        ) : (
          <Empty>
            No option chains in the latest snapshot. Only the symbols in `OPTIONS_SYMBOLS` are
            pulled — paging every expiry for the whole universe is slow.
          </Empty>
        )}
      </MainContainer>
    </Page>
  );
}
