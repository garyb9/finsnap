import styled from 'styled-components';
import { pulse } from '../styles/keyframes';
import { theme } from '../styles/theme';

export const StatusBar = styled.div<{ $stale?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-size: 0.78rem;
  color: ${({ $stale }) => ($stale ? theme.colors.danger : theme.colors.success)};
  background: ${theme.colors.slateOverlayMuted};
  border: 1px solid ${theme.colors.borderSlateStrong};
  border-radius: ${theme.radius.pill};
  padding: ${theme.spacing.xs} ${theme.spacing.md};
`;

export const PulseDot = styled.span`
  display: inline-block;
  width: ${theme.spacing.sm};
  height: ${theme.spacing.sm};
  border-radius: 50%;
  background: ${theme.colors.accent};
  animation: ${pulse} 1.6s ease-in-out infinite;
`;
