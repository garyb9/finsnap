import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { ChartTooltip } from './ChartTooltip';
import { theme } from '../styles/theme';
import { fmtNum } from '../lib/format';
import { daysToExpiry, shortDate, wallOf, type Wall } from '../lib/options';
import { OptionsSide } from '../types/enums';
import type { OptionsExpiration } from '../types/finsnap';

/**
 * The same walls the list above shows, plotted on a real time axis instead of
 * read row by row.
 *
 * "Walls by date" answers one expiry at a time: distance from spot, sorted by
 * date but spaced evenly regardless of how far apart the dates actually are.
 * This is the same data on two real axes — actual expiry date on x, actual
 * strike on y — so a wall three weeks out and one three months out sit exactly
 * as far apart as the calendar puts them, and a reader can see the whole term
 * structure of where the chain expects price to run into resistance.
 *
 * Sized to slot into the gap the stat tiles leave in the strip above, so
 * `compact` trims the chrome (no legend, fewer ticks, smaller marks) rather
 * than just scaling the same chart down — a shrunk version of the full chart
 * turns to noise at that size.
 */

const FULL = {
  w: 620,
  h: 200,
  pad: { top: 14, right: 18, bottom: 24, left: 54 },
  xTicks: 5,
  yTicks: 4,
};
const COMPACT = {
  w: 320,
  h: 195,
  pad: { top: 10, right: 10, bottom: 20, left: 42 },
  xTicks: 3,
  yTicks: 4,
};

function sideColor(side: OptionsSide): string {
  return side === OptionsSide.Calls ? theme.colors.success : theme.colors.danger;
}

const sideGlyph = (side: OptionsSide) => (side === OptionsSide.Calls ? '▲' : '▼');
const sideWord = (side: OptionsSide) => (side === OptionsSide.Calls ? 'call' : 'put');

function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

const Wrap = styled.div<{ $compact: boolean }>`
  width: 100%;
  ${({ $compact }) => ($compact ? '' : 'padding: 6px 22px 14px;')}
`;

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`;

const Title = styled.span<{ $compact: boolean }>`
  font-size: ${({ $compact }) => ($compact ? '0.6rem' : '0.65rem')};
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
    content: attr(data-glyph);
    color: ${({ $color }) => $color};
    font-size: 0.6rem;
  }
`;

const Svg = styled.svg<{ $h: number }>`
  width: 100%;
  height: ${({ $h }) => $h}px;
  display: block;
`;

const AxisText = styled.text<{ $compact: boolean }>`
  font-size: ${({ $compact }) => ($compact ? '8px' : '10px')};
  fill: ${theme.colors.label};
`;

const Point = styled.text<{ $color: string; $soft: boolean; $compact: boolean }>`
  font-size: ${({ $compact }) => ($compact ? '9px' : '13px')};
  fill: ${({ $color }) => $color};
  opacity: ${({ $soft }) => ($soft ? 0.55 : 1)};
  cursor: pointer;
  text-anchor: middle;
  dominant-baseline: central;
`;

type Plotted = { exp: OptionsExpiration; wall: Wall; x: number; y: number };
type Tip = { x: number; y: number; plotted: Plotted };

interface Props {
  expirations: OptionsExpiration[];
  spot: number;
  /** Small variant for the empty slot beside the stat tiles — no legend, fewer ticks. */
  compact?: boolean;
  /**
   * Cap to the same nearest-N expiries the list beside it shows.
   *
   * Left unset, this plots every expiry the chain has, which spans a much
   * wider date range than the capped list — a LEAPS wall a year out stretches
   * the axis until the near-term walls the list is actually showing bunch up
   * in a sliver on the left, and the two views stop describing the same
   * picture even though they share the same data.
   */
  maxPoints?: number;
}

export function WallPriceChart({ expirations, spot, compact = false, maxPoints }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const size = compact ? COMPACT : FULL;

  const points = useMemo(() => {
    // Slice by nearest *expiry* first, same as the list beside it — filtering
    // to walls before slicing would backfill the quota from further out
    // whenever a near expiry has no wall, and the two views would drift apart.
    const sortedExpirations = [...expirations].sort((a, b) => a.date.localeCompare(b.date));
    const windowed = maxPoints ? sortedExpirations.slice(0, maxPoints) : sortedExpirations;
    return windowed
      .map((exp) => ({ exp, wall: wallOf(exp) }))
      .filter((p): p is { exp: OptionsExpiration; wall: Wall } => p.wall !== null);
  }, [expirations, maxPoints]);

  if (points.length === 0) return null;

  const { w: VIEW_W, h: VIEW_H, pad: PAD, xTicks: X_TICKS, yTicks: Y_TICKS } = size;
  const innerW = VIEW_W - PAD.left - PAD.right;
  const innerH = VIEW_H - PAD.top - PAD.bottom;

  const times = points.map((p) => new Date(`${p.exp.date}T00:00:00Z`).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  const xOf = (t: number) =>
    maxT === minT ? PAD.left + innerW / 2 : PAD.left + ((t - minT) / (maxT - minT)) * innerW;

  const strikes = points.map((p) => p.wall.strike);
  const rawMin = Math.min(...strikes, spot);
  const rawMax = Math.max(...strikes, spot);
  const padPrice = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.01, 0.5);
  const minP = rawMin - padPrice;
  const maxP = rawMax + padPrice;

  const yOf = (price: number) =>
    maxP === minP
      ? PAD.top + innerH / 2
      : PAD.top + innerH - ((price - minP) / (maxP - minP)) * innerH;

  const plotted: Plotted[] = points.map((p) => ({
    exp: p.exp,
    wall: p.wall,
    x: xOf(new Date(`${p.exp.date}T00:00:00Z`).getTime()),
    y: yOf(p.wall.strike),
  }));

  const xTickTimes = Array.from({ length: X_TICKS }, (_, i) =>
    maxT === minT ? minT : minT + (i / (X_TICKS - 1)) * (maxT - minT)
  );
  const yTickPrices = Array.from(
    { length: Y_TICKS },
    (_, i) => minP + (i / (Y_TICKS - 1)) * (maxP - minP)
  );

  const spotY = yOf(spot);

  return (
    <Wrap $compact={compact}>
      <Head>
        <Title $compact={compact}>Wall price by expiry</Title>
        {!compact && (
          <LegendRow>
            <LegendItem data-glyph="▲" $color={theme.colors.success}>
              call wall
            </LegendItem>
            <LegendItem data-glyph="▼" $color={theme.colors.danger}>
              put wall
            </LegendItem>
            <LegendItem data-glyph="┄" $color={theme.colors.borderSlateTable}>
              spot ${fmtNum(spot, 2)}
            </LegendItem>
          </LegendRow>
        )}
      </Head>

      <Svg
        $h={VIEW_H}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Option wall strike by expiry date, spot $${fmtNum(spot, 2)}`}
      >
        {yTickPrices.map((price, i) => {
          const y = yOf(price);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={y}
                y2={y}
                stroke={theme.colors.borderSlate}
                strokeWidth={1}
              />
              <AxisText
                $compact={compact}
                x={PAD.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
              >
                ${fmtNum(price, price < 10 ? 2 : 0)}
              </AxisText>
            </g>
          );
        })}

        {xTickTimes.map((t, i) => (
          <AxisText
            $compact={compact}
            key={i}
            x={xOf(t)}
            y={VIEW_H - PAD.bottom + (compact ? 12 : 16)}
            textAnchor="middle"
          >
            {shortDate(isoDate(t))}
          </AxisText>
        ))}

        <line
          x1={PAD.left}
          x2={VIEW_W - PAD.right}
          y1={spotY}
          y2={spotY}
          stroke={theme.colors.borderSlateTable}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        {plotted.map(({ exp, wall, x, y }) => (
          <Point
            key={exp.date}
            x={x}
            y={y}
            $color={sideColor(wall.side)}
            $soft={wall.soft}
            $compact={compact}
            onMouseEnter={(e) =>
              setTip({ x: e.clientX, y: e.clientY, plotted: { exp, wall, x, y } })
            }
            onMouseMove={(e) =>
              setTip((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur))
            }
            onMouseLeave={() => setTip(null)}
          >
            {sideGlyph(wall.side)}
          </Point>
        ))}
      </Svg>

      {tip && (
        <ChartTooltip x={tip.x} y={tip.y}>
          <strong style={{ color: sideColor(tip.plotted.wall.side), fontSize: '0.85rem' }}>
            ${fmtNum(tip.plotted.wall.strike, 2)}
          </strong>
          <br />
          {sideWord(tip.plotted.wall.side)} wall · {shortDate(tip.plotted.exp.date)}
          <br />
          <span style={{ color: theme.colors.label }}>
            {daysToExpiry(tip.plotted.exp.date)}d out ·{' '}
            {tip.plotted.wall.distancePct >= 0 ? '+' : ''}
            {tip.plotted.wall.distancePct.toFixed(1)}% from spot
            {tip.plotted.wall.soft ? ' · soft lean' : ''}
            {tip.plotted.wall.nearSpot ? ' · clustered on spot' : ''}
          </span>
        </ChartTooltip>
      )}
    </Wrap>
  );
}
