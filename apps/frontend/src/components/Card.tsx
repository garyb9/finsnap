import styled from 'styled-components';
import { scoreColor } from '../lib/format';
import { theme } from '../styles/theme';

const CardBase = styled.section`
  border-radius: ${theme.radius.lg};
  padding: 20px 22px;
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
`;

export const Card = CardBase;

export const OptionsCard = styled(CardBase)`
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

export const ExpTableScroll = styled.div`
  overflow: auto;
  max-height: min(75vh, 620px);
  margin: 0 -6px 0 0;
`;

export const CardTitle = styled.h2`
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin-bottom: 14px;
  font-weight: 600;
`;

export const MetricRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const MetricLabel = styled.span`
  font-size: 0.8rem;
  color: ${theme.colors.textMuted};
`;

export const MetricValue = styled.span`
  font-size: 0.88rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textSlate};
`;

export const ScoreBadge = styled.span<{ $score: number }>`
  font-size: 0.75rem;
  font-weight: 700;
  color: ${({ $score }) => scoreColor($score)};
  padding: 1px 6px;
  border: 1px solid ${({ $score }) => scoreColor($score)}44;
  border-radius: 6px;
`;

export const BigScore = styled.div<{ $score: number }>`
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  color: ${({ $score }) => scoreColor($score)};
  margin-bottom: 4px;
`;

export const SignalGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
`;

export const SignalItem = styled.div`
  background: ${theme.colors.slateOverlayStrong};
  border-radius: ${theme.radius.md};
  padding: 10px 12px;
`;

export const SignalLabel = styled.div`
  font-size: 0.7rem;
  color: ${theme.colors.label};
  margin-bottom: 4px;
`;

export const SignalValue = styled.div<{ $score: number }>`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${({ $score }) => scoreColor($score)};
`;

export const DotColor = styled.span<{ $score: number }>`
  color: ${({ $score }) => scoreColor($score)};
`;

export const ExpTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.76rem;

  thead th {
    text-align: left;
    font-weight: 500;
    padding: 6px 12px;
    color: ${theme.colors.label};
    border-bottom: 1px solid ${theme.colors.borderSlateStrong};
    white-space: nowrap;
  }

  tbody td {
    padding: 8px 12px;
    color: ${theme.colors.textSlateLight};
    border-bottom: 1px solid ${theme.colors.slateOverlayDark};
    font-variant-numeric: tabular-nums;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:nth-child(odd) {
    background: ${theme.colors.slateOverlay};
  }
`;

export const TickerPrice = styled.div`
  font-size: 1.6rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  margin-bottom: 6px;
  span {
    font-size: 0.9rem;
    color: ${theme.colors.label};
    margin-left: 6px;
  }
`;
