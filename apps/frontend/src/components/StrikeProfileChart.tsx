import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { ChartTooltip } from './ChartTooltip';
import { theme } from '../styles/theme';
import { fmtK, fmtNum } from '../lib/format';
import type { StrikeProfileRow } from '../types/finsnap';

/**
 * Open interest by strike, summed across every expiry — the per-strike view the
 * expiry table can't give.
 *
 * The table answers "how skewed is each date"; this answers the orthogonal
 * question, "where along the price axis is the chain actually positioned". A
 * horizontal ladder with calls and puts mirrored around a shared strike axis is
 * how an options desk reads it: the strikes with the longest bars are the walls,
 * and seeing calls and puts at the *same* strike side by side is the thing a
 * per-expiry aggregate throws away.
 *
 * Kept to the strikes near spot by default — a chain can span strikes far into
 * the wings where a single contract's OI dwarfs everything near the money and
 * flattens the middle of the distribution into an unreadable line.
 */

const FULL = {
  w: 640,
  h: 260,
  pad: { top: 10, right: 14, bottom: 26, left: 58 },
  yTicks: 5,
};

const Wrap = styled.div`
  width: 100%;
  padding: 4px 0 6px;
`;

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`;

const Title = styled.span`
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const LegendRow = styled.div`
  display: flex;
  gap: 12px;
  font-size: 0.66rem;
  color: ${theme.colors.textMuted};
`;

const LegendItem = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &::before {
    content: '';
    width: 9px;
    height: 9px;
    border-radius: 2px;
    background: ${({ $color }) => $color};
  }
`;

const Svg = styled.svg`
  width: 100%;
  height: ${FULL.h}px;
  display: block;
`;

const AxisText = styled.text`
  font-size: 9px;
  fill: ${theme.colors.label};
`;

const Bar = styled.rect<{ $highlighted: boolean }>`
  transition: opacity 0.12s ease;
  opacity: ${({ $highlighted }) => ($highlighted ? 1 : 0.82)};
  cursor: pointer;
`;

const SpotLabel = styled.text`
  font-size: 9px;
  fill: ${theme.colors.accent};
  font-weight: 700;
`;

interface Props {
  rows: StrikeProfileRow[];
  spot: number;
  /** How many strikes either side of spot to keep. The wings are mostly noise. */
  nearCount?: number;
  /** Whichever metric the page wants plotted — open interest or today's volume. */
  metric?: 'oi' | 'volume';
}

type Tip = { x: number; y: number; row: StrikeProfileRow };

export function StrikeProfileChart({ rows, spot, nearCount = 12, metric = 'oi' }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);

  const kept = useMemo(() => {
    if (rows.length === 0) return rows;
    // Nearest `nearCount` strikes to spot, then back into ascending strike order.
    const byDistance = [...rows].sort(
      (a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)
    );
    return byDistance.slice(0, nearCount * 2 + 1).sort((a, b) => a.strike - b.strike);
  }, [rows, spot, nearCount]);

  if (kept.length === 0) return null;

  const callOf = (r: StrikeProfileRow) => (metric === 'oi' ? r.callOI : r.callVolume);
  const putOf = (r: StrikeProfileRow) => (metric === 'oi' ? r.putOI : r.putVolume);

  const maxSide = Math.max(1, ...kept.map((r) => Math.max(callOf(r), putOf(r))));

  const { w: VIEW_W, h: VIEW_H, pad: PAD, yTicks: Y_TICKS } = FULL;
  const innerW = VIEW_W - PAD.left - PAD.right;
  const innerH = VIEW_H - PAD.top - PAD.bottom;

  // One row per strike, laid out top-to-bottom from the highest strike down, so
  // the ladder reads the same way a price chart does — higher prices up.
  const rowH = innerH / kept.length;
  const barH = Math.max(3, Math.min(rowH * 0.34, 12));

  const yOf = (i: number) => PAD.top + i * rowH + rowH / 2;

  // Calls grow left from the centre, puts grow right — the classic mirrored
  // ladder, so the two sides never overlap and share the strike axis.
  const centreX = PAD.left + innerW / 2;
  const callX = (r: StrikeProfileRow) => centreX - (callOf(r) / maxSide) * (innerW / 2 - 2);
  const putX = (r: StrikeProfileRow) => centreX + (putOf(r) / maxSide) * (innerW / 2 - 2);

  const callW = (r: StrikeProfileRow) => centreX - callX(r);
  const putW = (r: StrikeProfileRow) => putX(r) - centreX;

  const spotIdx = kept.reduce(
    (best, r, i) => (Math.abs(r.strike - spot) < Math.abs(kept[best].strike - spot) ? i : best),
    0
  );
  const spotY = yOf(spotIdx);

  const valueTicks = Array.from({ length: Y_TICKS }, (_, i) => (i / (Y_TICKS - 1)) * maxSide);
  const metricWord = metric === 'oi' ? 'open interest' : 'volume';

  return (
    <Wrap>
      <Head>
        <Title>Strike profile — {metricWord} across all expiries</Title>
        <LegendRow>
          <LegendItem $color={theme.colors.success}>calls</LegendItem>
          <LegendItem $color={theme.colors.danger}>puts</LegendItem>
        </LegendRow>
      </Head>

      <Svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Options ${metricWord} by strike, centred on spot $${fmtNum(spot, 2)}`}
      >
        {/* Value gridlines mirrored either side of the centre axis. */}
        {valueTicks.map((v, i) => {
          const offset = (v / maxSide) * (innerW / 2 - 2);
          if (offset === 0) return null;
          return (
            <g key={i}>
              <line
                x1={centreX - offset}
                x2={centreX - offset}
                y1={PAD.top}
                y2={VIEW_H - PAD.bottom}
                stroke={theme.colors.borderSlate}
                strokeWidth={1}
              />
              <line
                x1={centreX + offset}
                x2={centreX + offset}
                y1={PAD.top}
                y2={VIEW_H - PAD.bottom}
                stroke={theme.colors.borderSlate}
                strokeWidth={1}
              />
            </g>
          );
        })}

        <line
          x1={centreX}
          x2={centreX}
          y1={PAD.top}
          y2={VIEW_H - PAD.bottom}
          stroke={theme.colors.borderSlateTable}
          strokeWidth={1}
        />

        {/* Spot marker across the ladder. */}
        <line
          x1={PAD.left}
          x2={VIEW_W - PAD.right}
          y1={spotY}
          y2={spotY}
          stroke={theme.colors.accent}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />
        <SpotLabel x={PAD.left - 4} y={spotY} textAnchor="end" dominantBaseline="middle">
          spot
        </SpotLabel>

        {kept.map((r, i) => {
          const y = yOf(i);
          const highlighted = tip?.row.strike === r.strike;
          return (
            <g key={r.strike}>
              <Bar
                $highlighted={highlighted}
                x={callX(r)}
                y={y - barH / 2}
                width={callW(r)}
                height={barH}
                fill={theme.colors.success}
                onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, row: r })}
                onMouseMove={(e) =>
                  setTip((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur))
                }
                onMouseLeave={() => setTip(null)}
              />
              <Bar
                $highlighted={highlighted}
                x={centreX}
                y={y - barH / 2}
                width={putW(r)}
                height={barH}
                fill={theme.colors.danger}
                onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, row: r })}
                onMouseMove={(e) =>
                  setTip((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur))
                }
                onMouseLeave={() => setTip(null)}
              />

              <AxisText x={PAD.left - 6} y={y} textAnchor="end" dominantBaseline="middle">
                ${fmtNum(r.strike, r.strike < 10 ? 2 : 0)}
              </AxisText>
            </g>
          );
        })}
      </Svg>

      {tip && (
        <ChartTooltip x={tip.x} y={tip.y}>
          <strong style={{ color: theme.colors.textSlate, fontSize: '0.85rem' }}>
            ${fmtNum(tip.row.strike, 2)}
          </strong>
          <br />
          <span style={{ color: theme.colors.success }}>
            ▲ {fmtK(tip.row.callOI)} OI · {fmtK(tip.row.callVolume)} vol
          </span>
          <br />
          <span style={{ color: theme.colors.danger }}>
            ▼ {fmtK(tip.row.putOI)} OI · {fmtK(tip.row.putVolume)} vol
          </span>
          <br />
          <span style={{ color: theme.colors.label }}>
            {tip.row.strike >= spot ? '+' : ''}
            {(((tip.row.strike - spot) / spot) * 100).toFixed(1)}% from spot
          </span>
        </ChartTooltip>
      )}
    </Wrap>
  );
}
