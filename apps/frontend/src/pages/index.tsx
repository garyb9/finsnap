import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { DailyReportCard } from '../components/DailyReportCard';
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
 * The dashboard is now just the daily report.
 *
 * Option chains and the per-asset technical readouts moved to their own tabs —
 * they were three unrelated things stacked on one page, and the report is the
 * one you act on.
 */
export default function HomePage() {
  const { report, guide, loading } = useFinSnapData();

  return (
    <Page>
      <MainContainer>
        {loading && !report ? (
          <LoadingStateContent />
        ) : report ? (
          <DailyReportCard report={report} guide={guide} />
        ) : (
          <Empty>
            No daily report yet. Run a sync from the control in the top right, or wait for the
            pre-market build.
          </Empty>
        )}
      </MainContainer>
    </Page>
  );
}
