import { useEffect, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { Header } from '../components/Header';
import { StatusBar, PulseDot } from '../components/StatusBar';
import { OptionsTabCard } from '../components/OptionsTabCard';
import { PriceCard } from '../components/PriceCard';
import { DailyReportCard } from '../components/DailyReportCard';
import { SyncPanel } from '../components/SyncPanel';
import { LoadingStateContent } from '../components/LoadingState';
import { relativeTime } from '../lib/format';
import { fetchGuide, fetchReport, fetchSnap } from '../lib/api';
import type { FinSnap } from '../types/finsnap';
import type { Guide } from '../types/guide';
import type { CompactReport } from '../types/report';

const SNAP_POLL_MS = 60_000;
const REPORT_POLL_MS = 5 * 60_000;
const SNAP_STALE_MS = 15 * 60_000;

const PriceGrid = styled.div`
  width: 100%;
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
`;

const HeaderLink = styled(Link)`
  font-size: 0.75rem;
  color: ${theme.colors.label};
  text-decoration: none;
  border-bottom: 1px solid transparent;

  &:hover {
    color: ${theme.colors.accent};
    border-bottom-color: ${theme.colors.accent};
  }
`;

export default function HomePage() {
  const [snap, setSnap] = useState<FinSnap | null>(null);
  const [report, setReport] = useState<CompactReport | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadSnap = async () => {
      const next = await fetchSnap();
      if (cancelled) return;
      if (next) setSnap(next);
      setLastFetched(new Date());
    };

    const loadReport = async () => {
      const next = await fetchReport();
      if (!cancelled && next) setReport(next);
    };

    // The guide is static for the lifetime of the server, so it is fetched once
    // rather than polled. It supplies the plain-English names and blurbs the
    // report itself does not carry.
    const loadGuide = async () => {
      const next = await fetchGuide();
      if (!cancelled && next) setGuide(next);
    };

    Promise.all([loadSnap(), loadReport(), loadGuide()]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    const snapTimer = setInterval(loadSnap, SNAP_POLL_MS);
    const reportTimer = setInterval(loadReport, REPORT_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(snapTimer);
      clearInterval(reportTimer);
    };
  }, []);

  // Keeps the "x ago" labels ticking without refetching.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const assets = snap ? Object.values(snap.assets) : [];
  const snapAge = snap ? Date.now() - new Date(snap.timestamp).getTime() : Infinity;
  const isStale = snapAge > SNAP_STALE_MS;

  return (
    <Page>
      <SyncPanel />

      <MainContainer>
        <Header>
          <h1>FinSnap</h1>
          <p>
            Price action across the market, its sectors and the macro instruments that move them —
            every strategy backtested against simply holding.{' '}
            <HeaderLink href="/guide">Field guide →</HeaderLink>
          </p>
        </Header>

        {snap && (
          <StatusBar $stale={isStale}>
            <PulseDot />
            {isStale ? 'Stale data' : 'Live'} · snap {snap.id.slice(-6)} ·{' '}
            {relativeTime(snap.timestamp)} ·{' '}
            {lastFetched ? `checked ${relativeTime(lastFetched.toISOString())}` : ''}
          </StatusBar>
        )}

        {loading && !snap && !report ? (
          <LoadingStateContent />
        ) : (
          <>
            {report && <DailyReportCard report={report} guide={guide} />}

            {assets.length > 0 && (
              <>
                <PriceGrid>
                  {assets.map((asset) => (
                    <PriceCard key={asset.symbol} asset={asset} />
                  ))}
                </PriceGrid>

                <OptionsTabCard assets={assets} />
              </>
            )}

            {snap && (
              <StatusBar $stale={false} style={{ marginTop: 8 }}>
                {snap.market.assetsTracked} assets · breadth {snap.market.breadth}% · avg TSMOM{' '}
                {snap.market.avgTsmom} · snap v{snap.version}
              </StatusBar>
            )}
          </>
        )}
      </MainContainer>
    </Page>
  );
}
