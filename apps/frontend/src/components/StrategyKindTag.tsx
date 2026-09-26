import styled from 'styled-components';
import { theme } from '../styles/theme';
import { STRATEGY_KIND_COLOR, STRATEGY_KIND_LABEL } from '../lib/format';
import type { StrategyKind } from '../types/enums';

/**
 * Colored pill for a strategy's family (trend, momentum, breakout, mean
 * reversion, benchmark). Placed before the strategy name everywhere a
 * strategy appears, so the family is legible at a glance without having to
 * open the guide.
 */
const Pill = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 1px 6px;
  border-radius: ${theme.radius.pill};
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: 1.5;
  white-space: nowrap;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}22`};
  border: 1px solid ${({ $color }) => `${$color}55`};
`;

export function StrategyKindTag({ kind, className }: { kind: StrategyKind; className?: string }) {
  return (
    <Pill
      $color={STRATEGY_KIND_COLOR[kind]}
      className={className}
      title={STRATEGY_KIND_LABEL[kind]}
    >
      {STRATEGY_KIND_LABEL[kind]}
    </Pill>
  );
}
