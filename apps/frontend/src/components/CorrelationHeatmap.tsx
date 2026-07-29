import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { ChartTooltip } from './ChartTooltip';
import { correlationColor } from '../lib/format';
import { fmtR } from '../lib/correlation';
import { theme } from '../styles/theme';
import type { CorrelationMatrix } from '../types/correlation';

const CELL = 26;
const ROW_LABEL_W = 54;
const COL_LABEL_H = 68;

const Scroll = styled.div`
  width: 100%;
  overflow: auto;
  max-height: min(72vh, 640px);
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.borderSlate};
`;

/**
 * A real `<table>`, not a CSS grid of divs — every cell's value is reachable
 * by a screen reader through row/column headers with no separate "table view"
 * to build and keep in sync.
 */
const Grid = styled.table`
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
`;

const CornerCell = styled.th`
  position: sticky;
  top: 0;
  left: 0;
  z-index: 3;
  width: ${ROW_LABEL_W}px;
  height: ${COL_LABEL_H}px;
  background: ${theme.colors.cardBgEnd};
  border-bottom: 1px solid ${theme.colors.borderSlateStrong};
  border-right: 1px solid ${theme.colors.borderSlateStrong};
`;

const ColHead = styled.th`
  position: sticky;
  top: 0;
  z-index: 2;
  width: ${CELL}px;
  height: ${COL_LABEL_H}px;
  background: ${theme.colors.cardBgEnd};
  border-bottom: 1px solid ${theme.colors.borderSlateStrong};
  padding: 0 0 6px;
  vertical-align: bottom;
`;

const ColLabelText = styled.span`
  display: inline-block;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.62rem;
  font-weight: 600;
  color: ${theme.colors.textMuted};
  white-space: nowrap;
`;

const RowHead = styled.th`
  position: sticky;
  left: 0;
  z-index: 1;
  width: ${ROW_LABEL_W}px;
  height: ${CELL}px;
  background: ${theme.colors.cardBgEnd};
  border-right: 1px solid ${theme.colors.borderSlateStrong};
  text-align: right;
  padding: 0 8px 0 0;
  font-size: 0.64rem;
  font-weight: 600;
  color: ${theme.colors.textMuted};
  white-space: nowrap;
`;

const Cell = styled.td<{ $bg: string; $diag: boolean }>`
  width: ${CELL}px;
  height: ${CELL}px;
  background: ${({ $bg, $diag }) => ($diag ? theme.colors.slateOverlayDark : $bg)};
  border: 1px solid ${theme.colors.background};
  cursor: ${({ $diag }) => ($diag ? 'default' : 'pointer')};
  transition: outline-color 0.1s ease;
  outline: 1px solid transparent;
  outline-offset: -1px;

  &:hover {
    outline-color: ${({ $diag }) => ($diag ? 'transparent' : theme.colors.text)};
  }

  &:focus-visible {
    outline-color: ${theme.colors.text};
  }
`;

const LegendRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 0.68rem;
  color: ${theme.colors.label};
`;

const LegendBar = styled.div`
  width: 140px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    ${theme.colors.danger} 0%,
    ${theme.colors.label} 50%,
    ${theme.colors.success} 100%
  );
`;

type Hover = { i: number; j: number; x: number; y: number };

interface Props {
  matrix: CorrelationMatrix;
}

export function CorrelationHeatmap({ matrix }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  const { nodes, grid } = matrix;

  // Sample counts aren't in `grid` — they ride along on the flat edge list, so
  // this rebuilds the same square shape for O(1) lookup per hovered cell.
  const sampleGrid = useMemo(() => {
    const n = nodes.length;
    const indexOf = new Map(nodes.map((node, i) => [node.label, i]));
    const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const edge of matrix.edges) {
      const i = indexOf.get(edge.a);
      const j = indexOf.get(edge.b);
      if (i === undefined || j === undefined) continue;
      out[i][j] = edge.sample;
      out[j][i] = edge.sample;
    }
    return out;
  }, [nodes, matrix.edges]);

  const active = hover
    ? {
        r: grid[hover.i][hover.j],
        a: nodes[hover.i],
        b: nodes[hover.j],
        sample: sampleGrid[hover.i][hover.j],
      }
    : null;

  return (
    <div>
      <Scroll>
        <Grid role="table" aria-label="Pairwise price correlation matrix">
          <thead>
            <tr>
              <CornerCell aria-hidden />
              {nodes.map((n) => (
                <ColHead key={n.label} scope="col">
                  <ColLabelText>{n.label}</ColLabelText>
                </ColHead>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((rowNode, i) => (
              <tr key={rowNode.label}>
                <RowHead scope="row">{rowNode.label}</RowHead>
                {nodes.map((colNode, j) => {
                  const r = grid[i][j];
                  const diag = i === j;
                  return (
                    <Cell
                      key={colNode.label}
                      $bg={correlationColor(r)}
                      $diag={diag}
                      tabIndex={diag ? -1 : 0}
                      role="gridcell"
                      aria-label={
                        diag ? undefined : `${rowNode.label} vs ${colNode.label}: ${fmtR(r)}`
                      }
                      onMouseEnter={(e) => !diag && setHover({ i, j, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => !diag && setHover({ i, j, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => {
                        if (diag) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHover({ i, j, x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onBlur={() => setHover(null)}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Grid>
      </Scroll>

      <LegendRow>
        <span>−1</span>
        <LegendBar />
        <span>+1</span>
        <span style={{ marginLeft: 8 }}>Pearson correlation of daily returns</span>
      </LegendRow>

      {active && (
        <ChartTooltip x={hover!.x} y={hover!.y}>
          <strong style={{ color: correlationColor(active.r), fontSize: '0.85rem' }}>
            {fmtR(active.r)}
          </strong>
          <br />
          {active.a.label} · {active.b.label}
          <br />
          <span style={{ color: theme.colors.label }}>
            {matrix.window.label.toLowerCase()} · {active.sample} obs
          </span>
        </ChartTooltip>
      )}
    </div>
  );
}
