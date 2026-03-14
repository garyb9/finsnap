import { Card, CardTitle, MetricRow, MetricLabel, MetricValue, ScoreBadge, DotColor } from './Card';
import { fmtNum, scoreDot } from '../lib/format';
import type { FinSnap } from '../types/finsnap';

export function WhaleCard({ snap }: { snap: FinSnap }) {
  const { whale } = snap.onChain;
  return (
    <Card>
      <CardTitle>Whale Activity</CardTitle>
      <MetricRow>
        <MetricLabel>Transactions</MetricLabel>
        <MetricValue>{whale.count}</MetricValue>
      </MetricRow>
      <MetricRow>
        <MetricLabel>Total Volume</MetricLabel>
        <MetricValue>{fmtNum(whale.totalValueEth, 0)} ETH</MetricValue>
      </MetricRow>
      <MetricRow>
        <MetricLabel>Energy Score</MetricLabel>
        <ScoreBadge $score={whale.energyScore}>
          <DotColor $score={whale.energyScore}>{scoreDot(whale.energyScore)}</DotColor>{' '}
          {whale.energyScore}/100
        </ScoreBadge>
      </MetricRow>
    </Card>
  );
}
