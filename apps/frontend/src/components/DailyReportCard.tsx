import { useMemo, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { CardTitle } from './Card';
import { ScoreBadge, VerdictBadge } from './Badges';
import { EdgeStrip } from './EdgeStrip';
import {
  ACTION_COLOR,
  ACTION_LABEL,
  changeColor,
  compoundValue,
  fmtMoney,
  fmtMoneyShort,
  fmtPct,
  fmtPrice,
  scoreColor,
} from '../lib/format';
import { BarInterval, MetricId, SignalAction, SizeKind } from '../types/enums';
import { nextSort, sortAssets, SortDir, SortKey } from '../lib/sortAssets';
import { GuideLinkIcon } from './icons';
import { StrategyKindTag } from './StrategyKindTag';

type SortState = { key: SortKey; dir: SortDir };
import { assetAnchor, strategyAnchor, type Guide, type GuideAsset } from '../types/guide';
import type { CompactAsset, CompactReport, CompactStrategy, Opportunity } from '../types/report';

/**
 * Shown on every edge badge. The score is the single most load-bearing number
 * in the report and the least self-explanatory, so it explains itself in place
 * rather than only on the guide page.
 */
/** Matches the engine's own starting capital, so the column agrees with the backtest. */
const DEFAULT_CAPITAL = 10_000;

const EDGE_HINT =
  'Edge score (0-100): how much evidence there is that this rule beats simply holding ' +
  'the asset. Blends excess return, risk-adjusted return and drawdown across every ' +
  'window, then discounts inconsistency and small trade counts. 50 = matched holding; ' +
  'above 65 is a strong record; below 45 it has been worse than holding.';

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
  border: 1px solid rgba(46, 194, 174, 0.28);
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

/**
 * Search and class filters.
 *
 * Twenty-three rows is past the point where scanning beats filtering, and it
 * only grows from here. Both narrow the same list the sort applies to, so the
 * three controls compose rather than fight.
 */
const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 22px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const Search = styled.input`
  font-family: inherit;
  font-size: 0.74rem;
  color: ${theme.colors.textSlate};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: ${theme.radius.pill};
  padding: 6px 13px;
  width: 190px;
  outline: none;

  &::placeholder {
    color: ${theme.colors.label};
  }

  &:focus {
    border-color: ${theme.colors.accent};
  }
`;

const Chip = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  padding: 5px 11px;
  border-radius: ${theme.radius.pill};
  border: 1px solid ${({ $active }) => ($active ? theme.colors.accent : theme.colors.borderSlate)};
  background: ${({ $active }) => ($active ? theme.colors.accentSoft : 'transparent')};
  color: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.textMuted)};

  &:hover {
    color: ${theme.colors.accent};
  }
`;

const CapitalWrap = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: ${theme.colors.label};
`;

const CapitalInput = styled.input`
  font-family: inherit;
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textSlate};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: ${theme.radius.pill};
  padding: 6px 11px;
  width: 100px;
  outline: none;

  &:focus {
    border-color: ${theme.colors.accent};
  }
`;

/**
 * What the capital would have become under the best rule, versus holding.
 *
 * Coloured against holding, not against zero. Every other number on this page
 * is judged relative to buy & hold, and a rule that turned $10,000 into $18,836
 * while holding produced $19,254 lost — painting that green because it beat
 * zero would contradict the entire premise of the report.
 */
const ReturnCell = styled.div`
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
`;

/**
 * The two outcomes at the same size, side by side, with the winner carrying the
 * colour.
 *
 * They used to be stacked, the held figure set in 0.58rem underneath — small
 * enough that the comparison the column exists to make was the hardest thing on
 * the row to read. Two numbers of equal weight beside each other *are* the
 * comparison; the green says which one won without anything having to be
 * subtracted by eye.
 */
const Money = styled.span<{ $winner: boolean }>`
  font-size: 0.74rem;
  font-weight: ${({ $winner }) => ($winner ? 700 : 500)};
  font-variant-numeric: tabular-nums;
  color: ${({ $winner }) => ($winner ? theme.colors.success : theme.colors.textMuted)};
`;

const Versus = styled.span`
  font-size: 0.58rem;
  color: ${theme.colors.label};
`;

const ResultCount = styled.span`
  margin-left: auto;
  font-size: 0.66rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
`;

const TableScroll = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const TableBody = styled.div`
  min-width: 1180px;
`;

const AssetRow = styled.div<{ $open: boolean }>`
  padding: 12px 22px 12px 12px;
  border-bottom: 1px solid ${theme.colors.slateOverlayDark};
  /* A left rule that lights up on hover and stays lit while open — the row is
     a button, and nothing else about a table row says so. */
  border-left: 2px solid ${({ $open }) => ($open ? theme.colors.accent : 'transparent')};
  background: ${({ $open }) => ($open ? theme.colors.accentHover : 'transparent')};
  transition:
    background 0.12s ease,
    border-color 0.12s ease;

  &:hover {
    background: ${theme.colors.slateOverlay};
    border-left-color: ${({ $open }) =>
      $open ? theme.colors.accent : theme.colors.borderSlateMuted};
  }

  &:last-child {
    border-bottom: none;
  }
`;

/**
 * Shared by the header row and every asset row so the columns line up.
 *
 * The vote bar is a gauge, not a progress bar — a fixed width keeps it
 * readable instead of stretching across the row on a wide screen.
 */
/* The return column is wider than the rest because it holds two figures side
   by side rather than one over the other. */
const COLUMNS = '14px 108px 100px 72px 88px 46px 48px 116px minmax(150px, 1fr) 158px 58px 104px';

const Chevron = styled.span<{ $open: boolean }>`
  font-size: 0.6rem;
  line-height: 1;
  color: ${({ $open }) => ($open ? theme.colors.accent : theme.colors.label)};
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
  transition: transform 0.15s ease;
`;

const AssetHead = styled.button`
  all: unset;
  cursor: pointer;
  width: 100%;
  display: grid;
  grid-template-columns: ${COLUMNS};
  gap: 14px;
  align-items: center;

  @media (max-width: ${theme.breakpoints.lg}) {
    grid-template-columns: 1fr auto;
    row-gap: 6px;
  }
`;

/** Column labels. Without them the numbers are just numbers. */
const ColumnHead = styled.div`
  display: grid;
  grid-template-columns: ${COLUMNS};
  gap: 14px;
  align-items: center;
  padding: 7px 22px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.label};

  @media (max-width: ${theme.breakpoints.lg}) {
    display: none;
  }
`;

const HeadButton = styled.button<{ $active: boolean; $end?: boolean }>`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: ${({ $end }) => ($end ? 'flex-end' : 'flex-start')};
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: ${({ $active }) => ($active ? theme.colors.accent : 'inherit')};
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.accent};
  }
`;

/** Reserves its width always, so headers do not shift when sorting changes. */
const Caret = styled.span<{ $visible: boolean }>`
  font-size: 0.6rem;
  line-height: 1;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
`;

/**
 * Cells that only earn their space on a wide screen. Below the breakpoint the
 * row falls back to ticker plus verdict, which is the irreducible summary.
 */
const WideOnly = styled.div`
  min-width: 0;

  @media (max-width: ${theme.breakpoints.lg}) {
    display: none;
  }
`;

const VerdictSlot = styled.div`
  display: flex;
  justify-content: flex-end;
`;

/**
 * Market cap and fund AUM are not the same measure, so the tooltip says which
 * one the number is rather than letting "size" imply they are interchangeable.
 */
const SIZE_HINT: Record<SizeKind, string> = {
  [SizeKind.MarketCap]: 'Market capitalisation',
  [SizeKind.NetAssets]: 'Assets under management — a fund has no market cap',
};

const Size = styled.span`
  font-size: 0.76rem;
  color: ${theme.colors.textSlateLight};
  font-variant-numeric: tabular-nums;
`;

/** Instrument class — lets you scan sectors apart from macro at a glance. */
const ClassTag = styled.span`
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  color: ${theme.colors.label};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Trend = styled.span<{ $score: number }>`
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${({ $score }) => scoreColor($score)};
`;

const Agreement = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const AgreementCount = styled.span`
  font-size: 0.68rem;
  color: ${theme.colors.textMuted};
  font-variant-numeric: tabular-nums;
`;

/** The rule with the strongest record on this asset, not today's loudest one. */
const BestRule = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const BestRuleName = styled.span`
  font-size: 0.74rem;
  color: ${theme.colors.textSlateLight};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const BestRuleMeta = styled.span<{ $score: number }>`
  font-size: 0.62rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;

  b {
    color: ${({ $score }) => scoreColor($score)};
    font-weight: 700;
  }
`;

const Flow = styled.div`
  display: flex;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`;

const FlowIn = styled.span`
  color: ${theme.colors.success};
`;

const FlowOut = styled.span`
  color: ${theme.colors.danger};
`;

const FlowNone = styled.span`
  color: ${theme.colors.label};
  font-weight: 400;
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
`;

const AssetCaveat = styled.p`
  font-size: 0.7rem;
  line-height: 1.55;
  color: ${theme.colors.warning};
  margin: 0;
  padding-left: 9px;
  border-left: 2px solid ${theme.colors.warning}55;
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

/**
 * Indented and rule-marked so the expanded rules read as belonging to the row
 * above them rather than as a new top-level list.
 */
const AssetDetail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 4px 28px;
  padding: 6px 0 6px 18px;
  border-left: 1px solid ${theme.colors.borderSlate};
`;

const StrategyLine = styled.div`
  display: grid;
  /* Wider strip column so ten fixed-width cells fit without wrapping, and
     centred so the squares sit on the same line as the action and edge badge. */
  grid-template-columns: 1fr 118px auto;
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

const StrategyTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
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

const DetailNote = styled.div`
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${theme.colors.label};
`;

/** Indicator readings that give the rules below some volatility context. */
const Readings = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.66rem;
  color: ${theme.colors.textMuted};
`;

const Reading = styled.span`
  b {
    color: ${theme.colors.text};
    font-weight: 600;
  }
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
          <StrategyKindTag kind={op.kind} />
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
        <StrategyTitleRow>
          <StrategyKindTag kind={strategy.kind} />
          <StrategyTitle
            href={`/guide#${strategyAnchor(strategy.id)}`}
            title={`${strategy.rationale} — click for how this rule works`}
          >
            {strategy.name}
          </StrategyTitle>
        </StrategyTitleRow>
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

      <OrderSide title={EDGE_HINT}>
        <ActionTag $action={strategy.action}>{ACTION_LABEL[strategy.action]}</ActionTag>
        <ScoreBadge label="edge" score={strategy.edgeScore} />
      </OrderSide>
    </StrategyLine>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  hint,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (next: SortState) => void;
  hint?: string;
  align?: 'end';
}) {
  const active = sort.key === sortKey;

  return (
    <HeadButton
      $active={active}
      $end={align === 'end'}
      onClick={() => onSort(nextSort(sort, sortKey))}
      title={hint ? `${hint} — click to sort` : 'Click to sort'}
    >
      {label}
      <Caret $visible={active}>{sort.dir === SortDir.Asc ? '▲' : '▼'}</Caret>
    </HeadButton>
  );
}

function AssetEntry({
  asset,
  info,
  categoryLabel,
  capital,
}: {
  asset: CompactAsset;
  info?: GuideAsset;
  categoryLabel?: string;
  capital: number;
}) {
  const [open, setOpen] = useState(false);
  const { consensus } = asset;
  // `top` is ranked by edge, so the first entry is the best-evidenced rule for
  // this asset rather than whichever one happens to be shouting today.
  const best = asset.top[0];

  // Reports are kept for 90 days, so one built before `years` existed can still
  // be served. Without this the return cell would throw on the missing field
  // and take the whole dashboard down with it.
  const horizon = best?.headline?.years;
  const modelled =
    best?.headline && typeof horizon === 'number' && horizon > 0
      ? {
          strategy: compoundValue(capital, best.headline.cagrPct, horizon),
          holding: compoundValue(capital, best.headline.benchmarkCagrPct, horizon),
          years: horizon,
        }
      : null;

  return (
    <AssetRow $open={open}>
      <AssetHead onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Chevron $open={open} aria-hidden>
          ▶
        </Chevron>

        <AssetIdent>
          <AssetLabel>{asset.label}</AssetLabel>
          {info && <AssetName title={info.name}>{info.shortName}</AssetName>}
        </AssetIdent>

        <AssetPrice $pct={asset.lastChangePct}>
          ${fmtPrice(asset.lastClose)}
          <span>{fmtPct(asset.lastChangePct, 2)}</span>
        </AssetPrice>

        <WideOnly>
          {asset.size ? (
            <Size title={SIZE_HINT[asset.size.kind]}>{fmtMoneyShort(asset.size.value)}</Size>
          ) : (
            <FlowNone>—</FlowNone>
          )}
        </WideOnly>

        <WideOnly>
          <ClassTag title={info?.name}>{categoryLabel ?? '—'}</ClassTag>
        </WideOnly>

        <WideOnly>
          {asset.tsmom ? (
            <Trend $score={asset.tsmom.score} title={`Trend strength — ${asset.tsmom.label}`}>
              {asset.tsmom.score}
            </Trend>
          ) : (
            <FlowNone>—</FlowNone>
          )}
        </WideOnly>

        <WideOnly>
          {typeof asset.momentum === 'number' ? (
            <Trend
              $score={asset.momentum}
              title="Share of timeframes with bullish EMA structure, 0-100"
            >
              {asset.momentum}
            </Trend>
          ) : (
            <FlowNone>—</FlowNone>
          )}
        </WideOnly>

        <WideOnly>
          <Agreement>
            <AgreementCount>
              {consensus.longCount}/{consensus.votingCount} long
            </AgreementCount>
            <VoteTrack
              $pct={consensus.score}
              title={
                `${consensus.longCount} of ${consensus.votingCount} strategies are long. ` +
                `The bar is edge-weighted, so only the ${consensus.qualifiedCount} with a ` +
                'demonstrated edge move it — which is why the count and the score can disagree.'
              }
            />
          </Agreement>
        </WideOnly>

        <WideOnly>
          {best ? (
            <BestRule>
              <BestRuleName title={best.rationale}>{best.name}</BestRuleName>
              {/* Trade count sits next to the edge score because the two are only
                  meaningful together — a 47 off four trades and a 47 off four
                  hundred are not the same claim, and the score alone hides which
                  one you are looking at. */}
              <BestRuleMeta $score={best.edgeScore}>
                edge <b>{best.edgeScore}</b>
                {best.headline && ` · ${best.headline.numTrades} trades`}
                {best.headline && ` · ${best.headline.label} ${fmtPct(best.headline.cagrPct)}/yr`}
              </BestRuleMeta>
            </BestRule>
          ) : (
            <FlowNone>no rule with an edge</FlowNone>
          )}
        </WideOnly>

        <WideOnly>
          {modelled && best?.headline ? (
            <ReturnCell
              title={
                `${fmtMoney(capital)} under ${best.name} over ${best.headline.label} ` +
                `(${modelled.years.toFixed(1)}y at ${fmtPct(best.headline.cagrPct)}/yr) ` +
                `becomes ${fmtMoney(modelled.strategy)}, versus ` +
                `${fmtMoney(modelled.holding)} simply holding. Hypothetical: past ` +
                `results, no costs beyond those already modelled, no tax.`
              }
            >
              <Money $winner={modelled.strategy >= modelled.holding}>
                {fmtMoney(modelled.strategy)}
              </Money>
              <Versus>vs</Versus>
              <Money $winner={modelled.holding > modelled.strategy}>
                {fmtMoney(modelled.holding)}
              </Money>
            </ReturnCell>
          ) : (
            <FlowNone>—</FlowNone>
          )}
        </WideOnly>

        <WideOnly>
          <Flow>
            {consensus.freshEntries === 0 && consensus.freshExits === 0 ? (
              <FlowNone>—</FlowNone>
            ) : (
              <>
                {consensus.freshEntries > 0 && (
                  <FlowIn title={`${consensus.freshEntries} strategies entering`}>
                    ↑{consensus.freshEntries}
                  </FlowIn>
                )}
                {consensus.freshExits > 0 && (
                  <FlowOut title={`${consensus.freshExits} strategies exiting`}>
                    ↓{consensus.freshExits}
                  </FlowOut>
                )}
              </>
            )}
          </Flow>
        </WideOnly>

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
                <GuideLinkIcon
                  href={`/guide#${assetAnchor(asset.symbol)}`}
                  label={`Read more about ${asset.label} in the field guide`}
                />
              </AssetBlurb>
              {info.caveat && <AssetCaveat>{info.caveat}</AssetCaveat>}
            </div>
          )}

          {/* Bollinger sits here rather than in the head row because the head is a
              fixed grid, and because it reads as context for the rules below it:
              four of them are band rules, and whether the envelope is tight or
              wide is what decides if they have anything to say today. */}
          {asset.bollinger && (
            <Readings>
              <Reading title="Band width as a percentage of the 20-day average — a volatility regime proxy">
                Bollinger width <b>{asset.bollinger.bandwidth.toFixed(2)}%</b> (
                {asset.bollinger.widthLabel})
              </Reading>
              <Reading title="Where the last close sits inside the envelope: 0 = lower band, 1 = upper band">
                %B <b>{asset.bollinger.percentB.toFixed(2)}</b> ({asset.bollinger.positionLabel})
              </Reading>
            </Readings>
          )}

          {/* Says what this list is. Without it the "n long" tally above a list of
              ten rules reads as a contradiction rather than a truncation. */}
          <DetailNote>
            Top {asset.top.length} of {consensus.votingCount} rules by edge ·{' '}
            {consensus.qualifiedCount} clear the bar to carry weight in the score
          </DetailNote>

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
  // The backend already orders and names the categories; reuse that rather
  // than restating the labels here and letting the two drift apart.
  const categoryLabels = new Map(
    (guide?.assetGroups ?? []).map((g) => [g.category as string, g.label])
  );

  const [sort, setSort] = useState<SortState>({ key: SortKey.Default, dir: SortDir.Desc });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [capital, setCapital] = useState(DEFAULT_CAPITAL);

  const categoryOf = (asset: CompactAsset) =>
    categoryLabels.get(infoBySymbol.get(asset.symbol)?.category ?? '') ?? '';

  // Filter first, then sort — ordering rows that are about to be discarded is
  // wasted work, and the result is identical either way.
  const visibleAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = report.assets.filter((asset) => {
      if (category && categoryOf(asset) !== category) return false;
      if (!needle) return true;

      // Ticker, plain name and full instrument name all match, so "gold",
      // "materials" and "XLB" each find something.
      const info = infoBySymbol.get(asset.symbol);
      return [asset.label, asset.symbol, info?.shortName, info?.name]
        .filter((field): field is string => Boolean(field))
        .some((field) => field.toLowerCase().includes(needle));
    });

    return sortAssets(filtered, sort.key, sort.dir, categoryOf);
  }, [report.assets, sort, guide, query, category]);

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

        <GuideLinkIcon href="/guide" label="Open the field guide" variant="book" />
      </Header>

      <SectionLabel>
        <span>
          Today&rsquo;s orders {topOpportunities.length > 0 && `· ${topOpportunities.length}`}
        </span>
        <GuideLinkIcon href="/guide#metrics" label="What these numbers mean" />
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
        <GuideLinkIcon href="/guide#assets" label="What these tickers are" />
      </SectionLabel>

      <FilterBar>
        <Search
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker or name…"
          aria-label="Search assets"
        />
        <Chip $active={category === ''} onClick={() => setCategory('')}>
          All
        </Chip>
        {(guide?.assetGroups ?? []).map((group) => (
          <Chip
            key={group.category}
            $active={category === group.label}
            onClick={() => setCategory(category === group.label ? '' : group.label)}
          >
            {group.label}
          </Chip>
        ))}
        <CapitalWrap>
          Capital
          <CapitalInput
            type="number"
            min={0}
            step={1000}
            value={capital}
            onChange={(e) => setCapital(Math.max(0, Number(e.target.value) || 0))}
            aria-label="Capital to model the return on"
          />
        </CapitalWrap>

        <ResultCount>
          {visibleAssets.length} of {report.assets.length}
        </ResultCount>
      </FilterBar>

      <TableScroll>
        <TableBody>
          <ColumnHead>
            <span />
            <SortHeader label="Asset" sortKey={SortKey.Label} sort={sort} onSort={setSort} />
            <SortHeader
              label="Last"
              sortKey={SortKey.Change}
              sort={sort}
              onSort={setSort}
              hint="Close of the last completed session, and its move"
            />
            <SortHeader
              label="Size"
              sortKey={SortKey.Size}
              sort={sort}
              onSort={setSort}
              hint="Market cap for crypto; assets under management for funds"
            />
            <SortHeader
              label="Class"
              sortKey={SortKey.Category}
              sort={sort}
              onSort={setSort}
              hint="What the instrument gives you exposure to"
            />
            <SortHeader
              label="Trend"
              sortKey={SortKey.Trend}
              sort={sort}
              onSort={setSort}
              hint="Live trend-strength score across timeframes"
            />
            <SortHeader
              label="Mom"
              sortKey={SortKey.Momentum}
              sort={sort}
              onSort={setSort}
              hint="Share of timeframes with bullish EMA structure, 0-100"
            />
            <SortHeader
              label="Agreement"
              sortKey={SortKey.Agreement}
              sort={sort}
              onSort={setSort}
              hint="How many strategies are long, and the edge-weighted score"
            />
            <SortHeader
              label="Best rule"
              sortKey={SortKey.Edge}
              sort={sort}
              onSort={setSort}
              hint="The rule with the strongest historical record on this asset"
            />
            <SortHeader
              label="Return vs held"
              sortKey={SortKey.Return}
              sort={sort}
              onSort={setSort}
              hint="What your capital would have become under the best rule, against simply holding, over the rule's headline window"
            />
            <SortHeader
              label="Today"
              sortKey={SortKey.Flow}
              sort={sort}
              onSort={setSort}
              hint="Strategies entering or exiting at the next open"
            />
            <SortHeader
              label="Verdict"
              sortKey={SortKey.Verdict}
              sort={sort}
              onSort={setSort}
              align="end"
            />
          </ColumnHead>

          {visibleAssets.length === 0 && <Empty>No asset matches that search.</Empty>}

          {visibleAssets.map((asset) => (
            <AssetEntry
              key={asset.symbol}
              asset={asset}
              capital={capital}
              info={infoBySymbol.get(asset.symbol)}
              categoryLabel={categoryLabels.get(infoBySymbol.get(asset.symbol)?.category ?? '')}
            />
          ))}
        </TableBody>
      </TableScroll>
    </Wrap>
  );
}
