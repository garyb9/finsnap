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

const Cells = styled.div`
  display: flex;
  gap: 2px;
`;

const Cell = styled.span<{ $beats: boolean }>`
  flex: 1;
  min-width: 5px;
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
  gap: 2px;
  font-size: 0.55rem;
  color: ${theme.colors.label};
`;

const AxisLabel = styled.span`
  flex: 1;
  min-width: 5px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
`;

interface Props {
  marks: WindowMark[];
  showAxis?: boolean;
}

export function EdgeStrip({ marks, showAxis = false }: Props) {
  if (marks.length === 0) return null;

  return (
    <Wrap>
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
