import type { ReactNode } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';

const Box = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  transform: translate(-50%, calc(-100% - 10px));
  pointer-events: none;
  z-index: 100;
  background: ${theme.colors.codeBackgroundSlate};
  border: 1px solid ${theme.colors.borderSlateStrong};
  border-radius: ${theme.radius.sm};
  box-shadow: ${theme.colors.shadowSoft};
  padding: 7px 10px;
  font-size: 0.72rem;
  line-height: 1.5;
  color: ${theme.colors.textSlate};
  white-space: nowrap;
  backdrop-filter: blur(6px);
`;

/** Cursor-anchored readout shared by the correlation heatmap and network view. */
export function ChartTooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <Box $x={x} $y={y}>
      {children}
    </Box>
  );
}
