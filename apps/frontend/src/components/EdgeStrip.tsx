import styled from 'styled-components';
import { theme } from '../styles/theme';
import { fmtPct } from '../lib/format';
import type { WindowMark } from '../types/report';

/**
 * One cell per lookback window, longest on the left, filled where the strategy
 * beat buy-and-hold.
 *
 * This answers what a single backtest number cannot: did the rule work
 * throughout, or only in one regime? A strip that is solid on the left and
 * hollow on the right is a strategy that used to work.
 */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

/**
 * Right-aligned with fixed-width cells.
 *
 * Strategies evaluate different numbers of windows — a 200-day average has no
 * 3-month result — so flexible cells made every row a different width and the
 * strips read as ragged noise. Fixing the cell width and anchoring to the right
 * means the most recent window is always in the same column, which is the
 * comparison the strip exists to support.
 */
const Cells = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 2px;
`;

const CELL_WIDTH = 9;

const Cell = styled.span<{ $beats: boolean }>`
  width: ${CELL_WIDTH}px;
  flex: none;
  height: 12px;
  border-radius: 2px;
  background: ${({ $beats }) => ($beats ? theme.colors.success : 'transparent')};
  border: 1px solid
    ${({ $beats }) => ($beats ? theme.colors.success : theme.colors.borderSlateMuted)};
  opacity: ${({ $beats }) => ($beats ? 0.75 : 0.5)};
  transition: opacity 0.15s ease;
  cursor: default;

  &:hover {
    opacity: 1;
  }
`;

const Axis = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  font-size: 0.55rem;
  color: ${theme.colors.label};
`;

const AxisLabel = styled.span`
  width: ${CELL_WIDTH}px;
  flex: none;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
`;

/** Explains the whole strip, not just one cell — the shape is the message. */
function stripHint(marks: WindowMark[]): string {
  const won = marks.filter((m) => m.beatsBenchmark).length;
  return (
    `Beat buy & hold in ${won} of ${marks.length} lookback windows. ` +
    'One square per window, longest on the left, shortest on the right. ' +
    'Filled means the rule beat holding on both return and drawdown — so a strip ' +
    'that is hollow on the left and solid on the right only started working recently.'
  );
}

interface Props {
  marks: WindowMark[];
  showAxis?: boolean;
}

export function EdgeStrip({ marks, showAxis = false }: Props) {
  if (marks.length === 0) return null;

  return (
    <Wrap title={stripHint(marks)}>
      <Cells>
        {marks.map((mark) => (
          <Cell
            key={mark.window}
            $beats={mark.beatsBenchmark}
            title={`${mark.window}: ${fmtPct(mark.excessCagrPct)} CAGR vs buy & hold`}
          />
        ))}
      </Cells>
      {showAxis && (
        <Axis aria-hidden>
          {marks.map((mark) => (
            <AxisLabel key={mark.window}>{mark.window}</AxisLabel>
          ))}
        </Axis>
      )}
    </Wrap>
  );
}
