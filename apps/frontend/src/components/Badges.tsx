import styled from 'styled-components';
import { theme } from '../styles/theme';
import {
  ACTION_COLOR,
  ACTION_LABEL,
  scoreColor,
  VERDICT_COLOR,
  VERDICT_LABEL,
} from '../lib/format';
import { SignalAction, Verdict } from '../types/enums';

/**
 * Tinted status pill — fill, border and text all derived from one colour.
 * Borrowed from the schizo-tracker source cards.
 */
const Badge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}18`};
  border: 1px solid ${({ $color }) => `${$color}55`};
  border-radius: ${theme.radius.sm};
  padding: 2px 8px;
`;

const Dim = styled.span`
  opacity: 0.65;
  font-weight: 400;
`;

export function VerdictBadge({ verdict, score }: { verdict: Verdict; score?: number }) {
  return (
    <Badge $color={VERDICT_COLOR[verdict]}>
      {VERDICT_LABEL[verdict]}
      {score !== undefined && <Dim>{score}</Dim>}
    </Badge>
  );
}

export function ActionBadge({ action }: { action: SignalAction }) {
  return <Badge $color={ACTION_COLOR[action]}>{ACTION_LABEL[action]}</Badge>;
}

export function ScoreBadge({ label, score }: { label: string; score: number }) {
  return (
    <Badge $color={scoreColor(score)}>
      <Dim>{label}</Dim>
      {score}
    </Badge>
  );
}
