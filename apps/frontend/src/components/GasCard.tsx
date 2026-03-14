import { Card, CardTitle, MetricRow, MetricLabel, MetricValue, ScoreBadge, DotColor } from './Card';
import { fmtNum, scoreDot } from '../lib/format';
import type { FinSnap } from '../types/finsnap';

export function GasCard({ snap }: { snap: FinSnap }) {
  const score = 100 - snap.onChain.gas.congestionScore;
  return (
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
        <ScoreBadge $score={score}>
          <DotColor $score={score}>{scoreDot(score)}</DotColor> {snap.onChain.gas.congestionScore}
          /100
        </ScoreBadge>
      </MetricRow>
    </Card>
  );
}
