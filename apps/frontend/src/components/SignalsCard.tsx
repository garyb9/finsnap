import {
  Card,
  CardTitle,
  MetricLabel,
  BigScore,
  SignalGrid,
  SignalItem,
  SignalLabel,
  SignalValue,
} from './Card';
import { theme } from '../styles/theme';
import type { FinSnap } from '../types/finsnap';

export function SignalsCard({ snap }: { snap: FinSnap }) {
  const { signals } = snap;
  return (
    <Card>
      <CardTitle>Signals</CardTitle>
      <BigScore $score={signals.overallSentiment}>
        {signals.overallSentiment}
        <span style={{ fontSize: '1rem', color: theme.colors.label, fontWeight: 400 }}>/100</span>
      </BigScore>
      <MetricLabel>Overall Sentiment</MetricLabel>
      <SignalGrid>
        <SignalItem>
          <SignalLabel>Network Stress</SignalLabel>
          <SignalValue $score={100 - signals.networkStress}>{signals.networkStress}</SignalValue>
        </SignalItem>
        <SignalItem>
          <SignalLabel>Whale Energy</SignalLabel>
          <SignalValue $score={signals.whaleEnergy}>{signals.whaleEnergy}</SignalValue>
        </SignalItem>
        <SignalItem>
          <SignalLabel>Vol Intensity</SignalLabel>
          <SignalValue $score={signals.volumeIntensity}>{signals.volumeIntensity}</SignalValue>
        </SignalItem>
        <SignalItem>
          <SignalLabel>Gas↓ Inverted</SignalLabel>
          <SignalValue $score={100 - signals.gasCongestion}>
            {100 - signals.gasCongestion}
          </SignalValue>
        </SignalItem>
      </SignalGrid>
    </Card>
  );
}
