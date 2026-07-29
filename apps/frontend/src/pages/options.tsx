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

/**
 * The page's own header, aligned to the card under it.
 *
 * This was a bare paragraph in a centring container with a `ch` cap, which at
 * this type size resolved to about 480px — so it floated in the middle of a
 * 1400px page, attached to nothing. Full width, left edge shared with the card,
 * and the sentence split off the title it was doing double duty as.
 */
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
        <Head>
          <Title>Options positioning</Title>
          <Note>
            Open interest and volume by expiry for the liquid tickers, with the walls each chain is
            building and the dates they sit on. Read it as context rather than as a signal — none of
            it feeds the strategies, and a wall of puts is a statement about positioning, not about
            direction.
          </Note>
        </Head>

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
