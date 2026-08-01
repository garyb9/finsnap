import styled from 'styled-components';
import { theme } from '../styles/theme';
import { CardTitle, ScoreBadge } from './Card';
import { ACTION_COLOR, ACTION_LABEL, changeColor, fmtPct } from '../lib/format';
import { StrategyKindTag } from './StrategyKindTag';
import type { SignalAction } from '../types/enums';
import type { AssetReport, StrategyReport } from '../types/assetReport';

/**
 * One strategy's full record against buy & hold, for whichever ticker the
 * chart page has open — every lookback window the backtest ran, not just the
 * single headline window the compact report trims to.
 *
 * Rendered once per selected strategy, so the compare view is just two of
 * these side by side rather than a bespoke diff layout.
 */

const Wrap = styled.section`
  flex: 1;
  min-width: 280px;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 3px;
`;

const Name = styled.h3`
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
`;

const SignalTag = styled.span<{ $action: SignalAction }>`
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ $action }) => ACTION_COLOR[$action]};
  white-space: nowrap;
`;

const Rationale = styled.p`
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.55;
  color: ${theme.colors.textMuted};
`;

const Table = styled.div`
  display: flex;
  flex-direction: column;
`;

const COLUMNS = '54px 1fr 1fr 52px 42px';

const HeadRow = styled.div`
  display: grid;
  grid-template-columns: ${COLUMNS};
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: ${COLUMNS};
  gap: 8px;
  align-items: baseline;
  padding: 6px 0;
  border-bottom: 1px solid ${theme.colors.slateOverlayDark};
  font-size: 0.72rem;

  &:last-child {
    border-bottom: none;
  }
`;

const WindowLabel = styled.span`
  color: ${theme.colors.textSlateLight};
  font-weight: 600;
`;

const Compare = styled.span`
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  b {
    font-weight: 700;
  }

  span {
    color: ${theme.colors.label};
  }
`;

const Beats = styled.span<{ $beats: boolean }>`
  color: ${({ $beats }) => ($beats ? theme.colors.success : theme.colors.danger)};
  font-weight: 700;
`;

const Empty = styled.div`
  font-size: 0.76rem;
  color: ${theme.colors.label};
  padding: 12px 0;
`;

function findStrategy(report: AssetReport, strategyId: string): StrategyReport | undefined {
  return (
    report.daily.find((s) => s.strategyId === strategyId) ??
    report.intraday.find((s) => s.strategyId === strategyId)
  );
}

interface Props {
  /** Full per-asset report; null while it's still loading. */
  report: AssetReport | null;
  strategyId: string;
  loading: boolean;
}

export function StrategyStatsCard({ report, strategyId, loading }: Props) {
  if (loading || !report) {
    return (
      <Wrap>
        <CardTitle style={{ margin: 0 }}>Strategy vs buy &amp; hold</CardTitle>
        <Empty>Loading backtest…</Empty>
      </Wrap>
    );
  }

  const strategy = findStrategy(report, strategyId);
  if (!strategy) {
    return (
      <Wrap>
        <CardTitle style={{ margin: 0 }}>Strategy vs buy &amp; hold</CardTitle>
        <Empty>No backtest for this strategy on {report.label} yet.</Empty>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Head>
        <div>
          <NameRow>
            <StrategyKindTag kind={strategy.kind} />
            <Name>{strategy.name}</Name>
          </NameRow>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SignalTag $action={strategy.signal.action}>
            {ACTION_LABEL[strategy.signal.action]}
          </SignalTag>
          <ScoreBadge $score={strategy.edgeScore} title="Edge score, 0-100">
            {strategy.edgeScore}
          </ScoreBadge>
        </div>
      </Head>

      <Rationale>{strategy.rationale}</Rationale>

      {strategy.windows.length === 0 ? (
        <Empty>Not enough history to backtest this window yet.</Empty>
      ) : (
        <Table>
          <HeadRow>
            <span>Window</span>
            <span>CAGR vs held</span>
            <span>Max DD vs held</span>
            <span>Trades</span>
            <span>Beats</span>
          </HeadRow>
          {strategy.windows.map((w) => (
            <Row key={w.window}>
              <WindowLabel>{w.label}</WindowLabel>
              <Compare
                title={`${fmtPct(w.stats.cagrPct)} strategy vs ${fmtPct(w.benchmark.cagrPct)} holding`}
              >
                <b style={{ color: changeColor(w.excessCagrPct) }}>{fmtPct(w.stats.cagrPct)}</b>{' '}
                <span>vs {fmtPct(w.benchmark.cagrPct)}</span>
              </Compare>
              <Compare
                title={`${w.stats.maxDrawdownPct.toFixed(0)}% strategy vs ${w.benchmark.maxDrawdownPct.toFixed(0)}% holding`}
              >
                {w.stats.maxDrawdownPct.toFixed(0)}%{' '}
                <span>vs {w.benchmark.maxDrawdownPct.toFixed(0)}%</span>
              </Compare>
              <span>{w.stats.numTrades}</span>
              <Beats $beats={w.beatsBenchmark}>{w.beatsBenchmark ? '✓' : '✕'}</Beats>
            </Row>
          ))}
        </Table>
      )}
    </Wrap>
  );
}
