import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { Header } from '../components/Header';
import { StatusBar, PulseDot } from '../components/StatusBar';
import { Grid } from '../components/Grid';
import { GasCard } from '../components/GasCard';
import { WhaleCard } from '../components/WhaleCard';
import { VolumeCard } from '../components/VolumeCard';
import { OptionsTabCard } from '../components/OptionsTabCard';
import { PriceCard } from '../components/PriceCard';
import { LoadingStateContent } from '../components/LoadingState';
import { relativeTime } from '../lib/format';
import type { FinSnap } from '../types/finsnap';

const PriceGrid = styled.div`
  width: 100%;
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(2, 1fr);
`;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HomePage() {
  const [snap, setSnap] = useState<FinSnap | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const fetchSnap = async () => {
      try {
        const res = await fetch(`${API_BASE}/snap`);
        if (res.ok) {
          const data = (await res.json()) as FinSnap;
          setSnap(data);
        }
      } catch {
        // backend not reachable yet — keep loading state
      } finally {
        setLoading(false);
        setLastFetched(new Date());
      }
    };

    fetchSnap();
    const interval = setInterval(fetchSnap, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const snapAge = snap ? Date.now() - new Date(snap.timestamp).getTime() : Infinity;
  const isStale = snapAge > 10 * 60 * 1000;

  return (
    <Page>
      <MainContainer>
        <Header>
          <h1>FinSnap</h1>
        </Header>

        {snap && (
          <StatusBar $stale={isStale}>
            <PulseDot />
            {isStale ? 'Stale data' : 'Live'} · snap {snap.id.slice(-6)} ·{' '}
            {relativeTime(snap.timestamp)} ·{' '}
            {lastFetched ? `checked ${relativeTime(lastFetched.toISOString())}` : ''}
          </StatusBar>
        )}

        {loading || !snap ? (
          <LoadingStateContent />
        ) : (
          <>
            {(snap.btc || snap.eth) && (
              <PriceGrid>
                {snap.btc && <PriceCard symbol="BTC" data={snap.btc} />}
                {snap.eth && <PriceCard symbol="ETH" data={snap.eth} />}
              </PriceGrid>
            )}

            {Object.keys(snap.equities).length > 0 && <OptionsTabCard equities={snap.equities} />}

            <Grid>
              <GasCard snap={snap} />
              <WhaleCard snap={snap} />
              <VolumeCard snap={snap} />
            </Grid>

            <StatusBar $stale={false} style={{ marginTop: 8 }}>
              Block {snap.blockHeight.toLocaleString()} · snap v{snap.version}
            </StatusBar>
          </>
        )}
      </MainContainer>
    </Page>
  );
}
