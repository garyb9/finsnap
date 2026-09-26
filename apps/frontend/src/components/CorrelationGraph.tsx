import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { ChartTooltip } from './ChartTooltip';
import { correlationColor } from '../lib/format';
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  circleLayout,
  edgesAboveThreshold,
  fmtR,
  pairCount,
} from '../lib/correlation';
import { theme } from '../styles/theme';
import type { CorrelationEdge, CorrelationMatrix } from '../types/correlation';

const SIZE = 620;
const CENTER = SIZE / 2;
const NODE_RADIUS = CENTER - 70;
const LABEL_RADIUS = NODE_RADIUS + 14;
const DEFAULT_THRESHOLD = 0.5;

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ControlRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: ${theme.colors.textMuted};
`;

const Slider = styled.input`
  width: 160px;
  accent-color: ${theme.colors.accent};
`;

const Count = styled.span`
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
`;

const SvgWrap = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
`;

const Svg = styled.svg`
  width: 100%;
  max-width: ${SIZE}px;
  height: auto;
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.68rem;
  color: ${theme.colors.textMuted};
`;

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const Swatch = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex: none;
`;

const TableToggle = styled.details`
  font-size: 0.72rem;
  color: ${theme.colors.textMuted};

  summary {
    cursor: pointer;
    color: ${theme.colors.accent};
    width: fit-content;
  }
`;

const PairTable = styled.table`
  margin-top: 8px;
  width: 100%;
  max-width: 420px;
  border-collapse: collapse;
  font-size: 0.72rem;

  th,
  td {
    text-align: left;
    padding: 3px 10px 3px 0;
  }

  th {
    color: ${theme.colors.label};
    font-weight: 500;
  }

  td:last-child,
  th:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`;

type HoverTip = { x: number; y: number; content: React.ReactNode };

interface Props {
  matrix: CorrelationMatrix;
}

export function CorrelationGraph({ matrix }: Props) {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [tip, setTip] = useState<HoverTip | null>(null);

  const positions = useMemo(() => circleLayout(matrix.nodes, NODE_RADIUS), [matrix.nodes]);
  const posByLabel = useMemo(() => new Map(positions.map((p) => [p.label, p])), [positions]);

  const shown = useMemo(
    () => edgesAboveThreshold(matrix.edges, threshold),
    [matrix.edges, threshold]
  );

  const categoriesPresent = useMemo(
    () => [...new Set(matrix.nodes.map((n) => n.category))],
    [matrix.nodes]
  );

  const total = pairCount(matrix.nodes.length);

  function edgeStyle(edge: CorrelationEdge) {
    const abs = Math.abs(edge.r);
    const touchesHover =
      hoveredLabel !== null && (edge.a === hoveredLabel || edge.b === hoveredLabel);
    const dimmed = hoveredLabel !== null && !touchesHover;
    return {
      stroke: correlationColor(edge.r),
      strokeWidth: 1 + abs * 3.5,
      opacity: dimmed ? 0.06 : 0.3 + abs * 0.55,
    };
  }

  return (
    <Wrap>
      <ControlRow>
        <label htmlFor="corr-threshold">Show pairs with |r| ≥ {threshold.toFixed(2)}</label>
        <Slider
          id="corr-threshold"
          type="range"
          min={0}
          max={0.9}
          step={0.05}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
        <Count>
          {shown.length} of {total} pairs
        </Count>
      </ControlRow>

      <SvgWrap>
        <Svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Correlation network">
          <g transform={`translate(${CENTER}, ${CENTER})`}>
            {shown.map((edge) => {
              const a = posByLabel.get(edge.a);
              const b = posByLabel.get(edge.b);
              if (!a || !b) return null;
              const style = edgeStyle(edge);
              return (
                <line
                  key={`${edge.a}-${edge.b}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeOpacity={style.opacity}
                  style={{ cursor: 'pointer', transition: 'stroke-opacity 0.15s ease' }}
                  onMouseEnter={(e) =>
                    setTip({
                      x: e.clientX,
                      y: e.clientY,
                      content: (
                        <>
                          <strong style={{ color: correlationColor(edge.r), fontSize: '0.85rem' }}>
                            {fmtR(edge.r)}
                          </strong>
                          <br />
                          {edge.a} · {edge.b}
                          <br />
                          <span style={{ color: theme.colors.label }}>
                            {matrix.window.label.toLowerCase()} · {edge.sample} obs
                          </span>
                        </>
                      ),
                    })
                  }
                  onMouseMove={(e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}

            {positions.map((p) => {
              const dimmed = hoveredLabel !== null && hoveredLabel !== p.label;
              const nx = p.x / NODE_RADIUS;
              const ny = p.y / NODE_RADIUS;
              const lx = nx * LABEL_RADIUS;
              const ly = ny * LABEL_RADIUS;
              const anchor = nx > 0.3 ? 'start' : nx < -0.3 ? 'end' : 'middle';
              const dy = ny < -0.7 ? -6 : ny > 0.7 ? 12 : 4;

              return (
                <g
                  key={p.label}
                  onMouseEnter={() => setHoveredLabel(p.label)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={dimmed ? 4 : 5.5}
                    fill={CATEGORY_COLOR[p.category]}
                    stroke={theme.colors.background}
                    strokeWidth={2}
                    opacity={dimmed ? 0.4 : 1}
                    style={{ transition: 'r 0.1s ease, opacity 0.15s ease' }}
                  />
                  <text
                    x={lx}
                    y={ly}
                    dy={dy}
                    textAnchor={anchor}
                    fontSize={10.5}
                    fontWeight={hoveredLabel === p.label ? 700 : 500}
                    fill={dimmed ? theme.colors.label : theme.colors.textSlate}
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}
          </g>
        </Svg>
      </SvgWrap>

      <Legend>
        {categoriesPresent.map((cat) => (
          <LegendItem key={cat}>
            <Swatch $color={CATEGORY_COLOR[cat]} />
            {CATEGORY_LABEL[cat]}
          </LegendItem>
        ))}
      </Legend>

      <TableToggle>
        <summary>View {shown.length} pairs as a table</summary>
        <PairTable>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Asset</th>
              <th>r</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((edge) => (
              <tr key={`${edge.a}-${edge.b}`}>
                <td>{edge.a}</td>
                <td>{edge.b}</td>
                <td style={{ color: correlationColor(edge.r) }}>{fmtR(edge.r)}</td>
              </tr>
            ))}
          </tbody>
        </PairTable>
      </TableToggle>

      {tip && (
        <ChartTooltip x={tip.x} y={tip.y}>
          {tip.content}
        </ChartTooltip>
      )}
    </Wrap>
  );
}
