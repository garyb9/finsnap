import styled from 'styled-components';
import { theme } from '../styles/theme';
import { fmtPct } from '../lib/format';
import type { GuideExample } from '../types/guide';
import { StrategyKind } from '../types/enums';
import { Formula } from './Formula';

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const Meta = styled.p`
  margin: 0;
  font-size: 0.76rem;
  color: ${theme.colors.label};

  code {
    font-family: ${theme.fonts.mono};
    color: ${theme.colors.textMuted};
  }
`;

const RuleBlock = styled.div`
  padding: 20px 18px;
  border-radius: ${theme.radius.md};
  background: ${theme.colors.slateOverlayStrong};
  border: 1px solid ${theme.colors.borderSlateMuted};
`;

const RuleLabel = styled.div`
  font-size: 0.6rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin-bottom: 8px;
`;

const StepList = styled.ol`
  list-style: none;
  counter-reset: walkstep;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Step = styled.li`
  counter-increment: walkstep;
  position: relative;
  padding-left: 26px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &::before {
    content: counter(walkstep);
    position: absolute;
    left: 0;
    top: 1px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    color: ${theme.colors.accent};
    background: ${theme.colors.accentSoft};
  }
`;

const StepLabel = styled.div`
  font-size: 0.78rem;
  color: ${theme.colors.textMuted};
  line-height: 1.5;
`;

const StepFormulaRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
`;

const StepResult = styled.span`
  font-size: 0.92rem;
  font-weight: 700;
  color: ${theme.colors.accent};
  white-space: nowrap;
`;

const Explanation = styled.p`
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.7;
  color: ${theme.colors.textSlateLight};
`;

const CompareGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
`;

const CompareTile = styled.div<{ $accent: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: ${theme.radius.md};
  background: ${({ $accent }) => ($accent ? theme.colors.accentSoft : theme.colors.slateOverlay)};
  border: 1px solid
    ${({ $accent }) => ($accent ? 'rgba(46, 194, 174, 0.32)' : theme.colors.borderSlate)};
`;

const CompareTitle = styled.div`
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const CompareRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textSlateLight};
`;

const CompareValue = styled.span<{ $color?: string }>`
  font-weight: 700;
  color: ${({ $color }) => $color ?? theme.colors.textSlate};
`;

function changeTone(n: number): string {
  if (n > 0) return theme.colors.success;
  if (n < 0) return theme.colors.danger;
  return theme.colors.textMuted;
}

/**
 * One full worked calculation: the rule, a specific historical bar it fires
 * on, the arithmetic step by step, and how it did against buy-and-hold over
 * the same real data. Every number here comes from the backend running the
 * actual strategy and backtest engine over a frozen slice of real history —
 * nothing is hand-typed, so it can never drift from what the engine reports.
 */
export function StrategyExampleCard({ example }: { example: GuideExample }) {
  const { comparison } = example;
  const isBenchmark = example.kind === StrategyKind.Benchmark;
  const strategyAhead = comparison.strategyTotalReturnPct > comparison.buyHoldTotalReturnPct;

  return (
    <Card>
      <Meta>
        Worked on real <code>{example.dataset.symbol}</code> daily bars, {example.dataset.startDate}{' '}
        → {example.dataset.endDate} ({example.dataset.bars} sessions) — illustrated on{' '}
        <code>{example.exampleDate}</code>.
      </Meta>

      <RuleBlock>
        <RuleLabel>The rule</RuleLabel>
        <Formula tex={example.ruleFormula} block />
      </RuleBlock>

      <StepList>
        {example.steps.map((step, i) => (
          <Step key={i}>
            <StepLabel>{step.label}</StepLabel>
            <StepFormulaRow>
              <Formula tex={step.formula} />
              <StepResult>= {step.result}</StepResult>
            </StepFormulaRow>
          </Step>
        ))}
      </StepList>

      <Explanation>{example.explanation}</Explanation>

      <CompareGrid>
        <CompareTile $accent={!isBenchmark && strategyAhead}>
          <CompareTitle>{isBenchmark ? 'Buy & hold' : example.name}</CompareTitle>
          <CompareRow>
            <span>Total return</span>
            <CompareValue $color={changeTone(comparison.strategyTotalReturnPct)}>
              {fmtPct(comparison.strategyTotalReturnPct)}
            </CompareValue>
          </CompareRow>
          <CompareRow>
            <span>CAGR</span>
            <CompareValue $color={changeTone(comparison.strategyCagrPct)}>
              {fmtPct(comparison.strategyCagrPct)}
            </CompareValue>
          </CompareRow>
          <CompareRow>
            <span>Max drawdown</span>
            <CompareValue $color={theme.colors.danger}>
              {fmtPct(comparison.strategyMaxDrawdownPct)}
            </CompareValue>
          </CompareRow>
          <CompareRow>
            <span>Exposure</span>
            <CompareValue>{comparison.strategyExposurePct.toFixed(0)}%</CompareValue>
          </CompareRow>
          <CompareRow>
            <span>Trades</span>
            <CompareValue>{comparison.strategyNumTrades}</CompareValue>
          </CompareRow>
        </CompareTile>

        {!isBenchmark && (
          <CompareTile $accent={!strategyAhead}>
            <CompareTitle>Buy &amp; hold</CompareTitle>
            <CompareRow>
              <span>Total return</span>
              <CompareValue $color={changeTone(comparison.buyHoldTotalReturnPct)}>
                {fmtPct(comparison.buyHoldTotalReturnPct)}
              </CompareValue>
            </CompareRow>
            <CompareRow>
              <span>CAGR</span>
              <CompareValue $color={changeTone(comparison.buyHoldCagrPct)}>
                {fmtPct(comparison.buyHoldCagrPct)}
              </CompareValue>
            </CompareRow>
            <CompareRow>
              <span>Max drawdown</span>
              <CompareValue $color={theme.colors.danger}>
                {fmtPct(comparison.buyHoldMaxDrawdownPct)}
              </CompareValue>
            </CompareRow>
            <CompareRow>
              <span>Exposure</span>
              <CompareValue>100%</CompareValue>
            </CompareRow>
            <CompareRow>
              <span>Trades</span>
              <CompareValue>1</CompareValue>
            </CompareRow>
          </CompareTile>
        )}
      </CompareGrid>
    </Card>
  );
}
