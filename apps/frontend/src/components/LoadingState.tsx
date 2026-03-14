import styled from 'styled-components';
import { pulse } from '../styles/keyframes';
import { theme } from '../styles/theme';

export const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: 80px 24px;
  color: ${theme.colors.label};
  text-align: center;

  h2 {
    font-size: 1.1rem;
    color: ${theme.colors.textMuted};
  }

  p {
    font-size: 0.85rem;
    max-width: 340px;
    line-height: 1.6;
  }
`;

export const LoadingDots = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

export const Dot = styled.span<{ $delay: number }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${theme.colors.accent};
  animation: ${pulse} 1.4s ease-in-out ${({ $delay }) => $delay}s infinite;
`;

export function LoadingStateContent() {
  return (
    <LoadingState>
      <LoadingDots>
        <Dot $delay={0} />
        <Dot $delay={0.2} />
        <Dot $delay={0.4} />
      </LoadingDots>
      <h2>Collecting &amp; analyzing data…</h2>
      <p>
        The engine is building the first snapshot — polling Ethereum blocks and options chains. This
        usually takes under a minute.
      </p>
    </LoadingState>
  );
}
