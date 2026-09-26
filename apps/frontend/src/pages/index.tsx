import { useMemo } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { DailyReportCard } from '../components/DailyReportCard';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { KpiStrip } from '../components/KpiStrip';
import { TickerCard } from '../components/TickerCard';
import { useFinSnapData } from '../lib/dataContext';
import { NAV_ITEMS } from '../lib/navIcons';

const FEATURED_COUNT = 8;

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

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
`;

const SectionLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const TickerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
`;

const QuickLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const QuickLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: ${theme.radius.pill};
  border: 1px solid ${theme.colors.borderSlate};
  color: ${theme.colors.textMuted};
  text-decoration: none;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

/**
 * Featured tickers, KPI pulse and quick links sit above the daily report —
 * the report is still the thing you act on, but it used to be the only thing
 * on the page.
 */
export default function HomePage() {
  const { snap, report, guide, loading, stale } = useFinSnapData();

  const featured = useMemo(() => {
    if (!snap) return [];
    return Object.values(snap.assets)
      .sort((a, b) => (b.size?.value ?? -1) - (a.size?.value ?? -1))
      .slice(0, FEATURED_COUNT);
  }, [snap]);

  const quickLinks = NAV_ITEMS.filter((item) => item.href !== '/');

  return (
    <Page>
      <MainContainer>
        {loading && !report ? (
          <DashboardSkeleton />
        ) : (
          <>
            {snap && <KpiStrip market={snap.market} snapAt={snap.timestamp} stale={stale} />}

            {featured.length > 0 && (
              <Section>
                <SectionLabel>Featured</SectionLabel>
                <TickerGrid>
                  {featured.map((asset) => (
                    <TickerCard key={asset.symbol} asset={asset} />
                  ))}
                </TickerGrid>
              </Section>
            )}

            {report ? (
              <DailyReportCard report={report} guide={guide} />
            ) : (
              <Empty>
                No daily report yet. Run a sync from the control in the top right, or wait for the
                pre-market build.
              </Empty>
            )}

            <Section>
              <SectionLabel>Explore</SectionLabel>
              <QuickLinks>
                {quickLinks.map(({ href, label, icon: Icon }) => (
                  <QuickLink key={href} href={href}>
                    <Icon aria-hidden />
                    {label}
                  </QuickLink>
                ))}
              </QuickLinks>
            </Section>
          </>
        )}
      </MainContainer>
    </Page>
  );
}
