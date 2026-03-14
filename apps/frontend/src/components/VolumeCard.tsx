import { Card, CardTitle, MetricRow, MetricLabel, MetricValue, ScoreBadge, DotColor } from './Card';
import { fmtNum, fmtK, scoreDot } from '../lib/format';
import type { FinSnap } from '../types/finsnap';

export function VolumeCard({ snap }: { snap: FinSnap }) {
  const { volume } = snap.onChain;
  return (
    <Card>
      <CardTitle>Network Volume</CardTitle>
      <MetricRow>
        <MetricLabel>Transactions</MetricLabel>
        <MetricValue>{fmtK(volume.txCount)}</MetricValue>
      </MetricRow>
      <MetricRow>
        <MetricLabel>Total Value</MetricLabel>
        <MetricValue>{fmtNum(volume.totalValueEth, 0)} ETH</MetricValue>
      </MetricRow>
      <MetricRow>
        <MetricLabel>Intensity</MetricLabel>
        <ScoreBadge $score={volume.intensityScore}>
          <DotColor $score={volume.intensityScore}>{scoreDot(volume.intensityScore)}</DotColor>{' '}
          {volume.intensityScore}/100
        </ScoreBadge>
      </MetricRow>
    </Card>
  );
}
