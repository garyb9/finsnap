import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Timeframe } from '../types/enums';
import type { TimeframeAnalysis } from '../types/finsnap';

const ORDER = [Timeframe.M5, Timeframe.H1, Timeframe.H4, Timeframe.D];
/** Floor for the scale itself — keeps four near-zero bars from all snapping to max height. */
const MIN_SCALE_PCT = 0.15;

const Svg = styled.svg`
  display: block;
  flex: none;
`;

export interface SparklineProps {
  timeframes: TimeframeAnalysis[];
  width?: number;
  height?: number;
}

/**
 * Four bars, one per timeframe (5M/1H/4H/D) — not a price-history line. The
 * snapshot only carries the latest bar per timeframe, not a series.
 */
export function Sparkline({ timeframes, width = 48, height = 22 }: SparklineProps) {
  const pcts = ORDER.map((tf) => timeframes.find((t) => t.timeframe === tf)?.changePct ?? 0);
  const barWidth = width / pcts.length;
  const mid = height / 2;
  // Scaled to this card's own largest move, not a fixed range — 5M/1H changes
  // are usually much smaller than D, and a fixed scale flattens them to floor
  // height, making every bar look the same.
  const scale = Math.max(MIN_SCALE_PCT, ...pcts.map((p) => Math.abs(p)));

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {pcts.map((pct, i) => {
        const barHeight = Math.max(1.5, (Math.abs(pct) / scale) * mid);
        const x = i * barWidth + barWidth * 0.2;
        const w = barWidth * 0.6;
        const y = pct >= 0 ? mid - barHeight : mid;
        const fill =
          pct > 0 ? theme.colors.success : pct < 0 ? theme.colors.danger : theme.colors.label;
        return <rect key={ORDER[i]} x={x} y={y} width={w} height={barHeight} rx={1} fill={fill} />;
      })}
    </Svg>
  );
}
