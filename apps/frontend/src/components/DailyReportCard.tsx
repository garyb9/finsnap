import { useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { CardTitle } from './Card';
import { ScoreBadge, VerdictBadge } from './Badges';
import { EdgeStrip } from './EdgeStrip';
import { ACTION_COLOR, ACTION_LABEL, changeColor, fmtPct, fmtPrice } from '../lib/format';
import { BarInterval, MetricId, SignalAction } from '../types/enums';
import { assetAnchor, strategyAnchor, type Guide, type GuideAsset } from '../types/guide';
import type { CompactAsset, CompactReport, CompactStrategy, Opportunity } from '../types/report';

/** One-line metric definitions, keyed by id, for the header stat tooltips. */
type MetricHints = Partial<Record<MetricId, string>>;

function hintsFrom(guide: Guide | null): MetricHints {
  if (!guide) return {};
  return Object.fromEntries(guide.metrics.map((m) => [m.id, m.short])) as MetricHints;
}

// ---------- Styled ----------

const Wrap = styled.section`
  width: 100%;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  flex-wrap: wrap;
`;

const Meta = styled.span`
  font-size: 0.72rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
`;

const Spacer = styled.div`
  flex: 1;
`;

const Summary = styled.div`
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const StatLabel = styled.span<{ $explained?: boolean }>`
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  /* A dotted underline is the conventional "there is a definition here" cue,
     and unlike an icon it costs no space in an already dense header. */
  border-bottom: ${({ $explained }) =>
    $explained ? `1px dotted ${theme.colors.borderSlateTable}` : 'none'};
  cursor: ${({ $explained }) => ($explained ? 'help' : 'inherit')};
`;

const GuideLink = styled(Link)`
  font-size: 0.66rem;
  color: ${theme.colors.label};
  text-decoration: none;
  border-bottom: 1px solid transparent;
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.accent};
    border-bottom-color: ${theme.colors.accent};
  }
`;

const StatValue = styled.span<{ $color?: string }>`
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${({ $color }) => $color ?? theme.colors.textSlate};
`;

const SectionLabel = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 22px;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  background: ${theme.colors.slateOverlay};
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const OrderRow = styled.div`
  display: grid;
  grid-template-columns: 26px 1fr auto;
  gap: 14px;
  align-items: start;
  padding: 12px 22px;
  border-bottom: 1px solid ${theme.colors.slateOverlayDark};

  &:last-child {
    border-bottom: none;
  }
`;

const Rank = styled.span`
  font-size: 0.78rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
  padding-top: 1px;
`;

const OrderBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

const OrderHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
`;

const Verb = styled.span<{ $action: SignalAction }>`
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $action }) => ACTION_COLOR[$action]};
`;

const Ticker = styled.span`
  font-size: 0.92rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
`;

const StrategyName = styled.span`
  font-size: 0.78rem;
  color: ${theme.colors.textSlateLight};
`;

const IntervalTag = styled.span`
  font-size: 0.6rem;
  padding: 0 4px;
  border-radius: 4px;
  color: ${theme.colors.accent};
  border: 1px solid rgba(56, 189, 248, 0.25);
`;

const Rationale = styled.span`
  font-size: 0.7rem;
  color: ${theme.colors.textMuted};
  line-height: 1.5;
`;

const OrderSide = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
`;

const Price = styled.span`
  font-size: 0.82rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  font-variant-numeric: tabular-nums;
`;

const Empty = styled.div`
  padding: 22px;
  font-size: 0.78rem;
  color: ${theme.colors.label};
  text-align: center;
`;

const AssetRow = styled.div`
  padding: 12px 22px;
  border-bottom: 1px solid ${theme.colors.slateOverlayDark};

  &:last-child {
    border-bottom: none;
  }
`;

const AssetHead = styled.button`
  all: unset;
  cursor: pointer;
  width: 100%;
  display: grid;
  /* The vote bar is a gauge, not a progress bar — a fixed width keeps it
     readable instead of stretching across the row on a wide screen. */
  grid-template-columns: 130px 130px 160px 1fr;
  gap: 14px;
  align-items: center;

  @media (max-width: ${theme.breakpoints.md}) {
    grid-template-columns: 1fr auto;
    row-gap: 6px;
  }
`;

const VerdictSlot = styled.div`
  display: flex;
  justify-content: flex-end;
`;

/** Ticker over plain name — 'XLB' means nothing without 'Materials' under it. */
const AssetIdent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const AssetLabel = styled.span`
  font-size: 0.88rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
`;

const AssetName = styled.span`
  font-size: 0.63rem;
  color: ${theme.colors.label};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AssetBlurb = styled.p`
  font-size: 0.72rem;
  line-height: 1.6;
  color: ${theme.colors.textMuted};
  margin: 0;
  max-width: 82ch;
`;

const AssetCaveat = styled.p`
  font-size: 0.7rem;
  line-height: 1.55;
  color: ${theme.colors.warning};
  margin: 0;
  padding-left: 9px;
  border-left: 2px solid ${theme.colors.warning}55;
  max-width: 82ch;
`;

const AssetPrice = styled.span<{ $pct: number }>`
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textSlateLight};

  span {
    color: ${({ $pct }) => changeColor($pct)};
    margin-left: 6px;
  }
`;

/** Edge-weighted share of strategies currently long. */
const VoteTrack = styled.div<{ $pct: number }>`
  height: 4px;
  border-radius: 2px;
  background: ${theme.colors.slateOverlayDark};
  position: relative;
  overflow: hidden;
  min-width: 60px;

  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: ${({ $pct }) => $pct}%;
    background: ${theme.colors.success};
    opacity: 0.7;
  }
`;

const AssetDetail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0 2px;
`;

const StrategyLine = styled.div`
  display: grid;
  grid-template-columns: 1fr 130px auto;
  gap: 12px;
  align-items: center;

  @media (max-width: ${theme.breakpoints.md}) {
    grid-template-columns: 1fr auto;
  }
`;

const StrategyMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StrategyTitle = styled(Link)`
  font-size: 0.74rem;
  color: ${theme.colors.textSlateLight};
  text-decoration: none;
  border-bottom: 1px solid transparent;
  width: fit-content;

  &:hover {
    color: ${theme.colors.accent};
    border-bottom-color: ${theme.colors.accent};
  }
`;

const StrategyStat = styled.span`
  font-size: 0.64rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
`;

const ActionTag = styled.span<{ $action: SignalAction }>`
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $action }) => ACTION_COLOR[$action]};
  white-space: nowrap;
`;

const Notes = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const Note = styled.li`
  font-size: 0.66rem;
  color: ${theme.colors.label};
  line-height: 1.5;

  &::before {
    content: '· ';
  }
`;

// ---------- Sub-components ----------

function OrderEntry({ op, rank }: { op: Opportunity; rank: number }) {
  return (
    <OrderRow>
      <Rank>{String(rank).padStart(2, '0')}</Rank>

      <OrderBody>
        <OrderHead>
          <Verb $action={op.action}>{ACTION_LABEL[op.action]}</Verb>
          <Ticker>{op.label}</Ticker>
          <StrategyName>{op.strategyName}</StrategyName>
          {op.interval === BarInterval.Hourly && <IntervalTag>1H</IntervalTag>}
        </OrderHead>
        <Rationale>{op.rationale}</Rationale>
      </OrderBody>

      <OrderSide>
        <Price>${fmtPrice(op.entryPrice)}</Price>
        <ScoreBadge label="edge" score={op.edgeScore} />
      </OrderSide>
    </OrderRow>
  );
}

function StrategyEntry({ strategy }: { strategy: CompactStrategy }) {
  const h = strategy.headline;

  return (
    <StrategyLine>
      <StrategyMeta>
        <StrategyTitle
          href={`/guide#${strategyAnchor(strategy.id)}`}
          title={`${strategy.rationale} — click for how this rule works`}
        >
          {strategy.name}
        </StrategyTitle>
        {h && (
          // Spelled out rather than abbreviated: "DD −57% vs −77%" is only
          // readable if you already know what the report is telling you.
          <StrategyStat>
            {h.label}: {fmtPct(h.cagrPct)}/yr vs {fmtPct(h.benchmarkCagrPct)} holding · worst drop{' '}
            {h.maxDrawdownPct.toFixed(0)}% vs {h.benchmarkMaxDrawdownPct.toFixed(0)}% ·{' '}
            {h.numTrades} trades
          </StrategyStat>
        )}
      </StrategyMeta>

      <EdgeStrip marks={strategy.marks} />

      <OrderSide>
        <ActionTag $action={strategy.action}>{ACTION_LABEL[strategy.action]}</ActionTag>
        <ScoreBadge label="edge" score={strategy.edgeScore} />
      </OrderSide>
    </StrategyLine>
  );
}

function AssetEntry({ asset, info }: { asset: CompactAsset; info?: GuideAsset }) {
  const [open, setOpen] = useState(false);
  const { consensus } = asset;

  return (
    <AssetRow>
      <AssetHead onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <AssetIdent>
          <AssetLabel>{asset.label}</AssetLabel>
          {info && <AssetName title={info.name}>{info.shortName}</AssetName>}
        </AssetIdent>
        <AssetPrice $pct={asset.lastChangePct}>
          ${fmtPrice(asset.lastClose)}
          <span>{fmtPct(asset.lastChangePct, 2)}</span>
        </AssetPrice>
        <VoteTrack
          $pct={consensus.score}
          title={
            `${consensus.longCount} of ${consensus.votingCount} strategies with a ` +
            'demonstrated edge are currently long'
          }
        />
        <VerdictSlot>
          <VerdictBadge verdict={consensus.verdict} score={consensus.score} />
        </VerdictSlot>
      </AssetHead>

      {open && (
        <AssetDetail>
          {info?.blurb && (
            <div>
              <AssetBlurb>
                {info.blurb}{' '}
                <GuideLink href={`/guide#${assetAnchor(asset.symbol)}`}>more →</GuideLink>
              </AssetBlurb>
              {info.caveat && <AssetCaveat>{info.caveat}</AssetCaveat>}
            </div>
          )}

          {asset.top.map((strategy) => (
            <StrategyEntry key={strategy.id} strategy={strategy} />
          ))}
          {asset.notes.length > 0 && (
            <Notes>
              {asset.notes.map((note) => (
                <Note key={note}>{note}</Note>
              ))}
            </Notes>
          )}
        </AssetDetail>
      )}
    </AssetRow>
  );
}

// ---------- Component ----------

/**
 * The daily backtest report: what fired today, and where every asset stands
 * once each strategy is weighted by its historical edge.
 *
 * Asset rows collapse by default — the orders list is the part you act on, the
 * per-strategy detail is there when you want to check the reasoning.
 */
export function DailyReportCard({
  report,
  guide = null,
}: {
  report: CompactReport;
  guide?: Guide | null;
}) {
  const { summary, topOpportunities } = report;
  const hints = hintsFrom(guide);
  const infoBySymbol = new Map((guide?.assets ?? []).map((a) => [a.symbol, a]));

  return (
    <Wrap>
      <Header>
        <CardTitle style={{ margin: 0, whiteSpace: 'nowrap' }}>Daily Report</CardTitle>
        <Meta>through {report.date} close</Meta>

        <Spacer />

        <Summary>
          <Stat>
            <StatLabel
              $explained={Boolean(hints[MetricId.Breadth])}
              title={hints[MetricId.Breadth]}
            >
              Breadth
            </StatLabel>
            <StatValue>{summary.avgConsensus}/100</StatValue>
          </Stat>
          <Stat>
            <StatLabel title="Strategies flipping from cash to long at the next open">
              Entries
            </StatLabel>
            <StatValue $color={theme.colors.success}>{summary.freshEntries}</StatValue>
          </Stat>
          <Stat>
            <StatLabel title="Strategies flipping from long to cash at the next open">
              Exits
            </StatLabel>
            <StatValue $color={theme.colors.danger}>{summary.freshExits}</StatValue>
          </Stat>
          <Stat>
            <StatLabel title="Strategy × lookback-window combinations behind this report">
              Backtests
            </StatLabel>
            <StatValue>{summary.backtestsRun.toLocaleString()}</StatValue>
          </Stat>
        </Summary>

        <GuideLink href="/guide">Field guide →</GuideLink>
      </Header>

      <SectionLabel>
        <span>
          Today&rsquo;s orders {topOpportunities.length > 0 && `· ${topOpportunities.length}`}
        </span>
        <GuideLink href="/guide#metrics">what the numbers mean</GuideLink>
      </SectionLabel>

      {topOpportunities.length === 0 ? (
        <Empty>No strategy with a demonstrated edge is entering or exiting today.</Empty>
      ) : (
        topOpportunities.map((op, i) => (
          <OrderEntry key={`${op.symbol}-${op.strategyId}-${op.interval}`} op={op} rank={i + 1} />
        ))
      )}

      <SectionLabel>
        <span>Verdicts · tap an asset for its strategies</span>
        <GuideLink href="/guide#assets">what these tickers are</GuideLink>
      </SectionLabel>

      {report.assets.map((asset) => (
        <AssetEntry key={asset.symbol} asset={asset} info={infoBySymbol.get(asset.symbol)} />
      ))}
    </Wrap>
  );
}
