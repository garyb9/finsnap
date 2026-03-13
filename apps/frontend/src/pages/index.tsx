import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';

// ---------- Types (mirroring backend FinSnap) ----------

type OptionsLegStats = {
  totalVolume: number;
  totalOI: number;
  weightedMeanStrike: number;
  weightedStdStrike: number;
};

type OptionsExpiration = {
  date: string;
  pcRatio: number;
  calls: OptionsLegStats;
  puts: OptionsLegStats;
};

type FinSnap = {
  id: string;
  timestamp: string;
  blockHeight: number;
  version: string;
  onChain: {
    whale: { count: number; totalValueEth: number; energyScore: number };
    gas: { averageGwei: number; trend: string; congestionScore: number };
    volume: { txCount: number; totalValueEth: number; intensityScore: number };
    networkStress: number;
  };
  equities: Record<string, { price: number; expirations: OptionsExpiration[] }>;
  signals: {
    networkStress: number;
    whaleEnergy: number;
    volumeIntensity: number;
    gasCongestion: number;
    overallSentiment: number;
  };
};

// ---------- Helpers ----------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function scoreColor(score: number): string {
  if (score >= 60) return '#4ade80'; // green
  if (score >= 40) return '#facc15'; // yellow
  return '#f87171'; // red
}

function scoreDot(score: number): string {
  if (score >= 60) return '●';
  if (score >= 40) return '●';
  return '●';
}

function relativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

// ---------- Styled Components ----------

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

const Page = styled.main`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px 64px;
  gap: 24px;
  max-width: 1120px;
  margin: 0 auto;
`;

const Header = styled.header`
  text-align: center;
  h1 {
    font-size: 2rem;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    font-weight: 700;
  }
  p {
    font-size: 0.85rem;
    color: #9ca3af;
    margin: 2px 0;
  }
`;

const StatusBar = styled.div<{ $stale?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: ${({ $stale }) => ($stale ? '#f87171' : '#4ade80')};
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  padding: 4px 14px;
`;

const PulseDot = styled.span`
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #38bdf8;
  animation: ${pulse} 1.6s ease-in-out infinite;
`;

const Grid = styled.div`
  width: 100%;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
`;

const FullWidth = styled.div`
  width: 100%;
`;

const Card = styled.section`
  border-radius: 18px;
  padding: 20px 22px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: radial-gradient(circle at top left, #0f172a 0, #020617 70%);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.5);
`;

const CardTitle = styled.h2`
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 14px;
  font-weight: 600;
`;

const MetricRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const MetricLabel = styled.span`
  font-size: 0.8rem;
  color: #94a3b8;
`;

const MetricValue = styled.span`
  font-size: 0.88rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #e2e8f0;
`;

const ScoreBadge = styled.span<{ $score: number }>`
  font-size: 0.75rem;
  font-weight: 700;
  color: ${({ $score }) => scoreColor($score)};
  padding: 1px 6px;
  border: 1px solid ${({ $score }) => scoreColor($score)}44;
  border-radius: 6px;
`;

const BigScore = styled.div<{ $score: number }>`
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  color: ${({ $score }) => scoreColor($score)};
  margin-bottom: 4px;
`;

const SignalGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
`;

const SignalItem = styled.div`
  background: rgba(15, 23, 42, 0.6);
  border-radius: 10px;
  padding: 10px 12px;
`;

const SignalLabel = styled.div`
  font-size: 0.7rem;
  color: #64748b;
  margin-bottom: 4px;
`;

const SignalValue = styled.div<{ $score: number }>`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${({ $score }) => scoreColor($score)};
`;

const DotColor = styled.span<{ $score: number }>`
  color: ${({ $score }) => scoreColor($score)};
`;

const ExpTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.76rem;

  thead th {
    text-align: left;
    font-weight: 500;
    padding: 4px 6px;
    color: #64748b;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    white-space: nowrap;
  }

  tbody td {
    padding: 5px 6px;
    color: #cbd5e1;
    border-bottom: 1px solid rgba(15, 23, 42, 0.8);
    font-variant-numeric: tabular-nums;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:nth-child(odd) {
    background: rgba(15, 23, 42, 0.4);
  }
`;

const TickerPrice = styled.div`
  font-size: 1.6rem;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 14px;
  span {
    font-size: 0.9rem;
    color: #64748b;
    margin-left: 6px;
  }
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 24px;
  color: #64748b;
  text-align: center;

  h2 {
    font-size: 1.1rem;
    color: #94a3b8;
  }

  p {
    font-size: 0.85rem;
    max-width: 340px;
    line-height: 1.6;
  }
`;

const LoadingDots = styled.div`
  display: flex;
  gap: 8px;
`;

const Dot = styled.span<{ $delay: number }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
  animation: ${pulse} 1.4s ease-in-out ${({ $delay }) => $delay}s infinite;
`;

// ---------- Component ----------

export default function HomePage() {
  const [snap, setSnap] = useState<FinSnap | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

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

  const snapAge = snap ? Date.now() - new Date(snap.timestamp).getTime() : Infinity;
  const isStale = snapAge > 10 * 60 * 1000;

  return (
    <Page>
      <Header>
        <h1>FinSnap</h1>
        <p>On-chain Ethereum + equity options — updated every 10 minutes</p>
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
        <LoadingState>
          <LoadingDots>
            <Dot $delay={0} />
            <Dot $delay={0.2} />
            <Dot $delay={0.4} />
          </LoadingDots>
          <h2>Collecting &amp; analyzing data…</h2>
          <p>
            The engine is building the first snapshot — polling Ethereum blocks and options chains.
            This usually takes under a minute.
          </p>
        </LoadingState>
      ) : (
        <>
          <Grid>
            {/* Gas */}
            <Card>
              <CardTitle>Gas</CardTitle>
              <MetricRow>
                <MetricLabel>Average</MetricLabel>
                <MetricValue>{fmtNum(snap.onChain.gas.averageGwei)} gwei</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Trend</MetricLabel>
                <MetricValue>{snap.onChain.gas.trend}</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Congestion</MetricLabel>
                <ScoreBadge $score={100 - snap.onChain.gas.congestionScore}>
                  <DotColor $score={100 - snap.onChain.gas.congestionScore}>
                    {scoreDot(100 - snap.onChain.gas.congestionScore)}
                  </DotColor>{' '}
                  {snap.onChain.gas.congestionScore}/100
                </ScoreBadge>
              </MetricRow>
            </Card>

            {/* Whales */}
            <Card>
              <CardTitle>Whale Activity</CardTitle>
              <MetricRow>
                <MetricLabel>Transactions</MetricLabel>
                <MetricValue>{snap.onChain.whale.count}</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Total Volume</MetricLabel>
                <MetricValue>{fmtNum(snap.onChain.whale.totalValueEth, 0)} ETH</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Energy Score</MetricLabel>
                <ScoreBadge $score={snap.onChain.whale.energyScore}>
                  <DotColor $score={snap.onChain.whale.energyScore}>
                    {scoreDot(snap.onChain.whale.energyScore)}
                  </DotColor>{' '}
                  {snap.onChain.whale.energyScore}/100
                </ScoreBadge>
              </MetricRow>
            </Card>

            {/* Volume */}
            <Card>
              <CardTitle>Network Volume</CardTitle>
              <MetricRow>
                <MetricLabel>Transactions</MetricLabel>
                <MetricValue>{fmtK(snap.onChain.volume.txCount)}</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Total Value</MetricLabel>
                <MetricValue>{fmtNum(snap.onChain.volume.totalValueEth, 0)} ETH</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Intensity</MetricLabel>
                <ScoreBadge $score={snap.onChain.volume.intensityScore}>
                  <DotColor $score={snap.onChain.volume.intensityScore}>
                    {scoreDot(snap.onChain.volume.intensityScore)}
                  </DotColor>{' '}
                  {snap.onChain.volume.intensityScore}/100
                </ScoreBadge>
              </MetricRow>
            </Card>

            {/* Signals */}
            <Card>
              <CardTitle>Signals</CardTitle>
              <BigScore $score={snap.signals.overallSentiment}>
                {snap.signals.overallSentiment}
                <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 400 }}>/100</span>
              </BigScore>
              <MetricLabel>Overall Sentiment</MetricLabel>
              <SignalGrid>
                <SignalItem>
                  <SignalLabel>Network Stress</SignalLabel>
                  <SignalValue $score={100 - snap.signals.networkStress}>
                    {snap.signals.networkStress}
                  </SignalValue>
                </SignalItem>
                <SignalItem>
                  <SignalLabel>Whale Energy</SignalLabel>
                  <SignalValue $score={snap.signals.whaleEnergy}>
                    {snap.signals.whaleEnergy}
                  </SignalValue>
                </SignalItem>
                <SignalItem>
                  <SignalLabel>Vol Intensity</SignalLabel>
                  <SignalValue $score={snap.signals.volumeIntensity}>
                    {snap.signals.volumeIntensity}
                  </SignalValue>
                </SignalItem>
                <SignalItem>
                  <SignalLabel>Gas↓ Inverted</SignalLabel>
                  <SignalValue $score={100 - snap.signals.gasCongestion}>
                    {100 - snap.signals.gasCongestion}
                  </SignalValue>
                </SignalItem>
              </SignalGrid>
            </Card>
          </Grid>

          {/* Options per ticker */}
          {Object.keys(snap.equities).length > 0 && (
            <FullWidth>
              <Grid>
                {Object.entries(snap.equities).map(([ticker, eq]) => (
                  <Card key={ticker} style={{ gridColumn: 'span 2' }}>
                    <CardTitle>Options — {ticker}</CardTitle>
                    <TickerPrice>
                      ${fmtNum(eq.price, 2)}
                      <span>{ticker}</span>
                    </TickerPrice>
                    {eq.expirations.length === 0 ? (
                      <MetricLabel>No expirations available</MetricLabel>
                    ) : (
                      <ExpTable>
                        <thead>
                          <tr>
                            <th>Expiry</th>
                            <th>P/C</th>
                            <th>Call Strike</th>
                            <th>Call Vol</th>
                            <th>Call OI</th>
                            <th>Put Strike</th>
                            <th>Put Vol</th>
                            <th>Put OI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eq.expirations.slice(0, 6).map((exp) => (
                            <tr key={exp.date}>
                              <td>{exp.date}</td>
                              <td
                                style={{
                                  color: exp.pcRatio > 1 ? '#f87171' : '#4ade80',
                                }}
                              >
                                {exp.pcRatio.toFixed(2)}
                              </td>
                              <td>
                                ${fmtNum(exp.calls.weightedMeanStrike, 2)}{' '}
                                <span style={{ color: '#64748b' }}>
                                  ±{fmtNum(exp.calls.weightedStdStrike, 2)}
                                </span>
                              </td>
                              <td>{fmtK(exp.calls.totalVolume)}</td>
                              <td>{fmtK(exp.calls.totalOI)}</td>
                              <td>
                                ${fmtNum(exp.puts.weightedMeanStrike, 2)}{' '}
                                <span style={{ color: '#64748b' }}>
                                  ±{fmtNum(exp.puts.weightedStdStrike, 2)}
                                </span>
                              </td>
                              <td>{fmtK(exp.puts.totalVolume)}</td>
                              <td>{fmtK(exp.puts.totalOI)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </ExpTable>
                    )}
                  </Card>
                ))}
              </Grid>
            </FullWidth>
          )}

          {/* Block info footer */}
          <StatusBar $stale={false} style={{ marginTop: 8 }}>
            Block {snap.blockHeight.toLocaleString()} · snap v{snap.version}
          </StatusBar>
        </>
      )}
    </Page>
  );
}
