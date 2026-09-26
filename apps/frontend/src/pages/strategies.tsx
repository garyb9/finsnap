import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { LoadingStateContent } from '../components/LoadingState';
import { StrategyLeaderboardCard } from '../components/StrategyLeaderboardCard';
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
 * Which strategy actually works, read across the whole universe rather than
 * one asset at a time.
 *
 * Every other tab answers "what does this asset's evidence say". This is the
 * cross-cut: pooling every asset's backtest by strategy and by horizon to find
 * the rule that beats buy-and-hold most consistently, and whether that holds
 * on a one-month lookback the same way it does on the full history.
 */
export default function StrategiesPage() {
  const { leaderboard, loading } = useFinSnapData();

  return (
    <Page>
      <MainContainer>
        {loading && !leaderboard ? (
          <LoadingStateContent />
        ) : leaderboard ? (
          <StrategyLeaderboardCard board={leaderboard} />
        ) : (
          <Empty>
            No daily report yet — the leaderboard is built from it. Run a sync from the control in
            the top right, or wait for the pre-market build.
          </Empty>
        )}
      </MainContainer>
    </Page>
  );
}
