import styled from 'styled-components';
import { theme } from '../styles/theme';
import type { AssetSnap, TimeframeAnalysis } from '../types/finsnap';

// ---------- Helpers ----------

function fmtPrice(n: number): string {
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function fmtNum(n: number, d = 2): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
}

function sentimentLabel(tf: TimeframeAnalysis): string {
  let score = 50;
  score += Math.max(-20, Math.min(20, tf.changePct * 10));
  if (tf.ema20AboveEma50) score += 10;
  else score -= 10;
  if (tf.ema20Trajectory === 'rising') score += 5;
  else if (tf.ema20Trajectory === 'falling') score -= 5;
  score += (tf.bollinger.percentB - 0.5) * 20;
  score = Math.max(0, Math.min(100, score));
  const labels = [
    'extreme fear',
    'fear',
    'anxiety',
    'unease',
    'neutral',
    'cautious',
    'optimism',
    'greed',
    'euphoria',
    'extreme greed',
  ];
  return labels[Math.min(Math.floor((score / 100) * labels.length), labels.length - 1)];
}

function sentimentColor(tf: TimeframeAnalysis): string {
  let score = 50;
  score += Math.max(-20, Math.min(20, tf.changePct * 10));
  if (tf.ema20AboveEma50) score += 10;
  else score -= 10;
  if (tf.ema20Trajectory === 'rising') score += 5;
  else if (tf.ema20Trajectory === 'falling') score -= 5;
  score += (tf.bollinger.percentB - 0.5) * 20;
  score = Math.max(0, Math.min(100, score));
  if (score >= 60) return '#4ade80';
  if (score >= 40) return '#facc15';
  return '#f87171';
}

function changePctColor(pct: number): string {
  if (pct > 0) return '#4ade80';
  if (pct < 0) return '#f87171';
  return '#94a3b8';
}

function emaRelation(ema: number, price: number, other: number, otherLabel: string): string {
  const vs = ema > price ? 'above price' : ema < price ? 'below price' : 'at price';
  const rel =
    ema > other ? `above ${otherLabel}` : ema < other ? `below ${otherLabel}` : `= ${otherLabel}`;
  return `${vs}, ${rel}`;
}

function bbBandPosition(price: number, lower: number, upper: number): string {
  if (price > upper) return 'above upper';
  if (price < lower) return 'below lower';
  const mid = (upper + lower) / 2;
  return price > mid ? 'upper half' : 'lower half';
}

function bbWidthLabel(bw: number): string {
  if (bw < 2) return 'tight';
  if (bw < 5) return 'moderate';
  return 'wide';
}

function bbPositionLabel(pctB: number): string {
  if (pctB >= 0.8) return 'upper band';
  if (pctB >= 0.6) return 'upper half';
  if (pctB >= 0.4) return 'mid';
  if (pctB >= 0.2) return 'lower half';
  return 'lower band';
}

function emaSpread(ema20: number, ema50: number): string {
  if (ema50 === 0) return '';
  const spread = ((ema20 - ema50) / ema50) * 100;
  const abs = Math.abs(spread);
  if (abs < 0.1) return 'converged — indecision';
  if (spread > 0 && abs >= 1) return 'bullish, strong separation';
  if (spread > 0 && abs >= 0.3) return 'bullish lean';
  if (spread > 0) return 'slightly bullish, converging';
  if (spread < 0 && abs >= 1) return 'bearish, strong separation';
  if (spread < 0 && abs >= 0.3) return 'bearish lean';
  return 'slightly bearish, converging';
}

// ---------- Styled ----------

const Wrap = styled.section`
  border-radius: ${theme.radius.lg};
  padding: 20px 22px;
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const Label = styled.div`
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin-bottom: 8px;
  font-weight: 600;
`;

const PriceNum = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 8px;
`;

const TsmomRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 14px;
`;

const TsmomBadge = styled.span<{ $score: number }>`
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: ${({ $score }) => ($score >= 60 ? '#4ade80' : $score >= 40 ? '#facc15' : '#f87171')};
  background: ${({ $score }) =>
    $score >= 60
      ? 'rgba(74,222,128,0.08)'
      : $score >= 40
        ? 'rgba(250,204,21,0.08)'
        : 'rgba(248,113,113,0.08)'};
  border: 1px solid
    ${({ $score }) => ($score >= 60 ? '#4ade8030' : $score >= 40 ? '#facc1530' : '#f8717130')};
  border-radius: ${theme.radius.pill};
  padding: 2px 8px;
`;

const TfRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-bottom: 16px;
`;

const TfChip = styled.span`
  font-size: 0.73rem;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textMuted};
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: ${theme.radius.sm};
  padding: 2px 7px;

  strong {
    color: ${theme.colors.textSlateLight};
    font-weight: 600;
  }
`;

/* Unified grid for EMA + BB rows: label | value | relation */
const MetricsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 8px;
`;

const MetricLine = styled.div`
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: baseline;
  gap: 8px;
  font-size: 0.75rem;
`;

const MLabel = styled.span`
  color: ${theme.colors.label};
  font-size: 0.69rem;
  letter-spacing: 0.06em;
  white-space: nowrap;
`;

const MValue = styled.span`
  color: ${theme.colors.textSlate};
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const MNote = styled.span`
  color: ${theme.colors.textMuted};
  font-size: 0.7rem;
  text-align: right;
  white-space: nowrap;
`;

const Conclusion = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: ${theme.colors.textMuted};
  margin-top: 2px;
`;

// ---------- Component ----------

const DISPLAY_TFS = ['5M', '1H', '4H', 'D'];

interface Props {
  symbol: string;
  data: AssetSnap;
}

export function PriceCard({ symbol, data }: Props) {
  const displayTfs = data.timeframes.filter((tf) => DISPLAY_TFS.includes(tf.timeframe));
  const daily = data.timeframes.find((tf) => tf.timeframe === 'D') ?? data.timeframes.at(-1);

  if (!daily) return null;

  const bb = daily.bollinger;
  const spread = emaSpread(daily.ema20, daily.ema50);

  return (
    <Wrap>
      <Label>{symbol} Price</Label>
      <PriceNum>${fmtPrice(data.currentPrice)}</PriceNum>

      <TsmomRow>
        <TsmomBadge $score={data.tsmom.score}>
          TSMOM {data.tsmom.score} · {data.tsmom.label}
        </TsmomBadge>
      </TsmomRow>

      <TfRow>
        {displayTfs.map((tf) => {
          const sign = tf.changePct >= 0 ? '+' : '';
          const col = changePctColor(tf.changePct);
          return (
            <TfChip key={tf.timeframe}>
              <strong>{tf.timeframe}</strong>{' '}
              <span style={{ color: col }}>
                {sign}
                {tf.changePct.toFixed(1)}%
              </span>{' '}
              <span style={{ color: sentimentColor(tf) }}>{sentimentLabel(tf)}</span>
            </TfChip>
          );
        })}
      </TfRow>

      <MetricsGrid>
        <MetricLine>
          <MLabel>EMA20</MLabel>
          <MValue>${fmtPrice(daily.ema20)}</MValue>
          <MNote>{emaRelation(daily.ema20, data.currentPrice, daily.ema50, 'EMA50')}</MNote>
        </MetricLine>
        <MetricLine>
          <MLabel>EMA50</MLabel>
          <MValue>${fmtPrice(daily.ema50)}</MValue>
          <MNote>{emaRelation(daily.ema50, data.currentPrice, daily.ema20, 'EMA20')}</MNote>
        </MetricLine>
        <MetricLine>
          <MLabel>BB σ2</MLabel>
          <MValue>
            ${fmtNum(bb.std2.lower)} – ${fmtNum(bb.std2.upper)}
          </MValue>
          <MNote>{bbBandPosition(data.currentPrice, bb.std2.lower, bb.std2.upper)}</MNote>
        </MetricLine>
        <MetricLine>
          <MLabel>BB σ3</MLabel>
          <MValue>
            ${fmtNum(bb.std3.lower)} – ${fmtNum(bb.std3.upper)}
          </MValue>
          <MNote>{bbBandPosition(data.currentPrice, bb.std3.lower, bb.std3.upper)}</MNote>
        </MetricLine>
      </MetricsGrid>

      <Conclusion>
        <span>{spread}</span>
        <span>
          BW {bb.bandwidth.toFixed(1)}% {bbWidthLabel(bb.bandwidth)} · %B {bb.percentB.toFixed(2)}{' '}
          {bbPositionLabel(bb.percentB)}
        </span>
      </Conclusion>
    </Wrap>
  );
}
