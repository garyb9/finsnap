import { useEffect, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { LoadingStateContent } from '../components/LoadingState';
import { SectionRail, type RailItem } from '../components/SectionRail';
import { StrategyExampleCard } from '../components/StrategyExampleCard';
import { StrategyKindTag } from '../components/StrategyKindTag';
import { fetchGuide } from '../lib/api';
import { StrategyKind } from '../types/enums';
import {
  assetAnchor,
  metricAnchor,
  strategyAnchor,
  type Guide,
  type GuideAsset,
  type GuideFamily,
  type GuideMetric,
  type GuideStrategy,
} from '../types/guide';

const SECTIONS = [
  { id: 'method', label: 'How it works' },
  { id: 'assets', label: 'What we track' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'math', label: 'Math' },
];

// ---------- Styled ----------

/**
 * Narrower than the dashboard on purpose.
 *
 * Uncapping the paragraphs let them run to ~110 characters a line, which is
 * roughly twice a comfortable measure — the eye loses its place returning to
 * the next line. Constraining the column instead of the paragraphs keeps every
 * element aligned to one edge while still reading well.
 */
const Column = styled.div`
  width: 100%;
  max-width: 760px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 40px;
`;

/**
 * Prose column plus the sticky table of contents beside it.
 *
 * The column keeps its own measure rather than stretching to fill what the rail
 * leaves over — the rail is chrome, and letting it widen the paragraphs would
 * undo the reason the column is capped in the first place.
 */
const Layout = styled.div`
  width: 100%;
  max-width: 1026px;
  display: flex;
  align-items: flex-start;
  /* Below the rail's breakpoint it drops out of the flow entirely, and without
     this the column would sit against the left edge of the space it left. */
  justify-content: center;
  gap: 48px;
`;

const Back = styled(Link)`
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  text-decoration: none;

  &:hover {
    color: ${theme.colors.accent};
  }
`;

const Title = styled.h1`
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin: 0 0 8px;
`;

const Lede = styled.p`
  font-size: 0.92rem;
  line-height: 1.65;
  color: ${theme.colors.textMuted};
  margin: 0;
`;

const Nav = styled.nav`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 10px 0;
  background: linear-gradient(${theme.colors.backgroundGradientMid} 65%, rgba(2, 18, 15, 0) 100%);

  /* Below md, the mobile top bar is also sticky above this. */
  @media (max-width: ${theme.breakpoints.md}) {
    top: ${theme.headerHeight};
  }

  /* Redundant once the rail is on screen, and it says less: the pills cannot
     show you where you currently are. Same threshold the rail appears at. */
  @media (min-width: ${theme.breakpoints.lg}) {
    display: none;
  }
`;

const NavLink = styled.a`
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.textMuted};
  text-decoration: none;
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: ${theme.radius.pill};
  padding: 5px 12px;

  &:hover {
    color: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
  }
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-margin-top: 56px;

  @media (max-width: ${theme.breakpoints.md}) {
    scroll-margin-top: calc(${theme.headerHeight} + 56px);
  }
`;

/**
 * The rule under a section heading belongs to the row, not to the text: the
 * metrics section hangs an expand-all control off the same line.
 */
const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const SectionTitle = styled.h2`
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin: 0;
`;

const ToggleAll = styled.button`
  all: unset;
  cursor: pointer;
  flex: none;
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.textMuted};

  &:hover {
    color: ${theme.colors.accent};
  }

  &:focus-visible {
    outline: 1px solid ${theme.colors.accent};
    outline-offset: 3px;
  }
`;

const GroupTitle = styled.h3`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.accent};
  margin: 26px 0 2px;
`;

/**
 * Method notes as a numbered list rather than six identical boxes.
 *
 * Stacked cards of near-equal size read as a wall — nothing signals where one
 * idea ends and the next begins except a border. A number and a rule do that
 * job with far less ink.
 */
const Steps = styled.ol`
  list-style: none;
  counter-reset: step;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 22px;
`;

const Step = styled.li`
  counter-increment: step;
  position: relative;
  padding-left: 38px;

  &::before {
    content: counter(step, decimal-leading-zero);
    position: absolute;
    left: 0;
    top: 1px;
    font-size: 0.72rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: ${theme.colors.accent};
  }
`;

const StepTitle = styled.h3`
  font-size: 0.92rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  margin: 0 0 6px;
`;

const GroupTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const GroupTab = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  letter-spacing: 0.04em;
  padding: 6px 13px;
  border-radius: ${theme.radius.pill};
  border: 1px solid ${({ $active }) => ($active ? theme.colors.accent : theme.colors.borderSlate)};
  background: ${({ $active }) => ($active ? theme.colors.accentSoft : 'transparent')};
  color: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.textMuted)};
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
  }
`;

const TabCount = styled.span`
  font-size: 0.6rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
`;

/**
 * A second, smaller row of tabs for picking a specific rule inside a family —
 * only rendered once a family actually has more than one worked example, so a
 * family with just one never shows a pointless single-item selector.
 */
const SubTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: -8px;
`;

const SubTab = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  font-size: 0.66rem;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  letter-spacing: 0.02em;
  padding: 4px 11px;
  border-radius: ${theme.radius.pill};
  border: 1px solid
    ${({ $active }) => ($active ? theme.colors.accent : theme.colors.borderSlateMuted)};
  color: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.label)};

  &:hover {
    color: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
  }
`;

const GroupPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 4px;
`;

const Entry = styled.article`
  border-radius: ${theme.radius.md};
  border: 1px solid transparent;
  border-left: 2px solid ${theme.colors.borderSlate};
  background: transparent;
  padding: 2px 0 2px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scroll-margin-top: 60px;

  @media (max-width: ${theme.breakpoints.md}) {
    scroll-margin-top: calc(${theme.headerHeight} + 60px);
  }

  /* A deep link should make it obvious which entry you landed on — at this
     contrast a border tint alone is invisible, so the ring does the work. */
  &:target {
    border-left-color: ${theme.colors.accent};
    background: ${theme.colors.accentSoft};
    padding: 10px 12px 10px 14px;
  }
`;

const EntryHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
`;

const EntryName = styled.span`
  font-size: 0.92rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
`;

const EntrySub = styled.span`
  font-size: 0.74rem;
  color: ${theme.colors.label};
`;

const Tag = styled.span`
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.accent};
  border: 1px solid rgba(46, 194, 174, 0.32);
  border-radius: 4px;
  padding: 1px 5px;
`;

const Body = styled.p`
  font-size: 0.88rem;
  line-height: 1.75;
  color: ${theme.colors.textSlateLight};
  margin: 0;
`;

const Caveat = styled.p`
  font-size: 0.76rem;
  line-height: 1.6;
  color: ${theme.colors.warning};
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid ${theme.colors.warning}55;
`;

const Aside = styled.p<{ $tone: 'good' | 'bad' }>`
  font-size: 0.78rem;
  line-height: 1.6;
  margin: 0;
  color: ${theme.colors.textMuted};

  strong {
    color: ${({ $tone }) => ($tone === 'good' ? theme.colors.success : theme.colors.danger)};
    font-weight: 600;
  }
`;

/**
 * Fifteen metrics, each with a definition and a paragraph of caveats, is more
 * than anyone reads in one pass — and the four separately ruled blocks per
 * entry turned the section into a ladder of horizontal lines.
 *
 * Collapsed, a metric is a name and the one-liner that answers "what is this?",
 * which is the whole question most of the time. The paragraph and the how-to-
 * read note are one click away for the times it is not.
 */
const MetricList = styled.div`
  display: flex;
  flex-direction: column;
`;

/**
 * `$linked` rather than `:target`: the guide fetches its content, so by the
 * time this entry exists the browser has long since given up on resolving
 * `#metric-sharpe` and the pseudo-class never matches. Tracking which anchor
 * sent you here is the only version that actually lights up.
 */
const Metric = styled.article<{ $linked: boolean }>`
  /* Bleeds a little past the column so the highlight reads as a band rather
     than as a boxed-in card. */
  margin: 0 -12px;
  padding: 0 12px;
  border-radius: ${theme.radius.sm};
  border-bottom: 1px solid ${theme.colors.borderSlate};
  background: ${({ $linked }) => ($linked ? theme.colors.accentSoft : 'transparent')};
  scroll-margin-top: 60px;

  @media (max-width: ${theme.breakpoints.md}) {
    scroll-margin-top: calc(${theme.headerHeight} + 60px);
  }
`;

const MetricHead = styled.button`
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 14px;
  padding: 15px 0;

  &:focus-visible {
    outline: 1px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

const MetricName = styled.h3<{ $open: boolean }>`
  font-size: 0.98rem;
  font-weight: 700;
  color: ${({ $open }) => ($open ? theme.colors.accent : theme.colors.textSlate)};
  margin: 0 0 4px;
  transition: color 0.15s ease;

  ${MetricHead}:hover & {
    color: ${theme.colors.accent};
  }
`;

const MetricShort = styled.p`
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: ${theme.colors.textMuted};
`;

const Chevron = styled.span<{ $open: boolean }>`
  font-size: 0.55rem;
  line-height: 1;
  color: ${({ $open }) => ($open ? theme.colors.accent : theme.colors.label)};
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
  transition: transform 0.15s ease;
`;

/**
 * One rule down the left for the whole expansion, rather than a border per
 * block: it is all the same aside, so it reads as one.
 */
const MetricDetail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0 0 18px;
  padding-left: 14px;
  border-left: 2px solid ${theme.colors.borderSlateMuted};
`;

const ReadingLabel = styled.span`
  display: block;
  font-size: 0.6rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin-bottom: 3px;
`;

const Reading = styled.div`
  font-size: 0.78rem;
  line-height: 1.6;
  margin: 0;
  color: ${theme.colors.textMuted};
`;

const FamilyCard = styled.div`
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.borderSlateMuted};
  background: ${theme.colors.slateOverlayStrong};
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 14px;
`;

const Footnote = styled.p`
  font-size: 0.72rem;
  color: ${theme.colors.label};
  line-height: 1.6;
  margin: 0;
`;

// ---------- Sub-components ----------

function AssetEntry({ asset }: { asset: GuideAsset }) {
  return (
    <Entry id={assetAnchor(asset.symbol)}>
      <EntryHead>
        <EntryName>{asset.label}</EntryName>
        <EntrySub>
          {asset.shortName} · {asset.name}
        </EntrySub>
        {asset.hasOptions && <Tag>options</Tag>}
      </EntryHead>
      {asset.blurb && <Body>{asset.blurb}</Body>}
      {asset.caveat && <Caveat>{asset.caveat}</Caveat>}
    </Entry>
  );
}

function StrategyEntry({ strategy }: { strategy: GuideStrategy }) {
  return (
    <Entry id={strategyAnchor(strategy.id)}>
      <EntryHead>
        {/* Named on every entry, not just the group heading above it: arriving
            by deep link skips the heading entirely. */}
        <StrategyKindTag kind={strategy.kind} />
        <EntryName>{strategy.name}</EntryName>
        <EntrySub>needs {strategy.warmup} bars of history</EntrySub>
      </EntryHead>
      <Body>{strategy.description}</Body>
    </Entry>
  );
}

function MetricEntry({
  metric,
  open,
  linked,
  onToggle,
}: {
  metric: GuideMetric;
  open: boolean;
  linked: boolean;
  onToggle: () => void;
}) {
  const anchor = metricAnchor(metric.id);
  const panelId = `${anchor}-detail`;

  return (
    <Metric id={anchor} $linked={linked}>
      <MetricHead onClick={onToggle} aria-expanded={open} aria-controls={panelId}>
        <div>
          <MetricName $open={open}>{metric.label}</MetricName>
          <MetricShort>{metric.short}</MetricShort>
        </div>
        <Chevron $open={open} aria-hidden>
          ▶
        </Chevron>
      </MetricHead>

      {open && (
        <MetricDetail id={panelId}>
          <Body>{metric.detail}</Body>
          <Reading>
            <ReadingLabel>How to read it</ReadingLabel>
            {metric.reading}
          </Reading>
        </MetricDetail>
      )}
    </Metric>
  );
}

function FamilySection({
  family,
  strategies,
}: {
  family: GuideFamily;
  strategies: GuideStrategy[];
}) {
  if (strategies.length === 0) return null;

  return (
    <div>
      <GroupTitle>{family.label}</GroupTitle>
      <FamilyCard>
        <Body>{family.premise}</Body>
        <Aside $tone="good">
          <strong>Works when </strong>
          {family.worksWhen}
        </Aside>
        <Aside $tone="bad">
          <strong>Fails when </strong>
          {family.failsWhen}
        </Aside>
      </FamilyCard>

      {strategies.map((s) => (
        <div key={s.id} style={{ marginTop: 10 }}>
          <StrategyEntry strategy={s} />
        </div>
      ))}
    </div>
  );
}

// ---------- Page ----------

/**
 * The field guide: what every ticker, rule and number on the dashboard means.
 *
 * Content is served whole from `GET /guide` so the wording lives beside the
 * code that produces the numbers. Every entry carries a stable anchor id, which
 * is what lets the report link a strategy name or a ticker straight here.
 */
export default function GuidePage() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<string>('');
  const [openFamily, setOpenFamily] = useState<StrategyKind | ''>('');
  const [openMathFamily, setOpenMathFamily] = useState<StrategyKind | ''>('');
  const [openExample, setOpenExample] = useState<string>('');
  // Keyed by anchor id, which is what both the rail and the URL hash speak.
  const [openMetrics, setOpenMetrics] = useState<ReadonlySet<string>>(new Set());
  // The metric you were sent to, by deep link or by the rail.
  const [linkedMetric, setLinkedMetric] = useState('');
  // Fifteen definitions are reference material, not the reason to visit this
  // page — collapsed until asked for, so the worked examples get the room.
  const [metricsOpen, setMetricsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchGuide()
      .then((next) => {
        if (!cancelled && next) setGuide(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The browser resolves `#strategy-sma_cross_50_200` before this page has
  // fetched anything, so the target does not exist yet and the deep link lands
  // at the top — which defeats the point of linking from the report at all.
  // Re-run the jump once the content is on the page.
  useEffect(() => {
    if (!guide) return;
    // Opens on the first real family, not Benchmark: buy & hold is the yardstick
    // every other rule is measured against, so leading with it would open the
    // section on the one entry that is not a strategy.
    const firstReal = guide.families.find((f) => f.kind !== StrategyKind.Benchmark);
    setOpenFamily((current) => current || firstReal?.kind || guide.families[0]?.kind || '');
    setOpenMathFamily((current) => current || firstReal?.kind || guide.families[0]?.kind || '');
    setOpenExample((current) => current || guide.examples[0]?.strategyId || '');

    const id = window.location.hash.slice(1);
    const symbol = id.startsWith('asset-') ? id.slice('asset-'.length) : null;
    // A deep link to a ticker has to open the tab holding it, or the anchor
    // scrolls to an element that is not rendered.
    const owning = symbol
      ? guide.assetGroups.find((g) => g.symbols.includes(symbol))?.category
      : null;

    setOpenGroup(owning ?? guide.assetGroups[0]?.category ?? '');

    // Same problem for a metric: landing on a collapsed entry would show the
    // one line the linker was trying to expand on — and the section itself
    // has to be open, or the anchor scrolls to a teaser with nothing in it.
    if (id.startsWith('metric-')) {
      setMetricsOpen(true);
      setOpenMetrics(new Set([id]));
      setLinkedMetric(id);
    }
  }, [guide]);

  // Runs after the tab above has rendered, so the target exists to scroll to.
  useEffect(() => {
    if (!guide || !openGroup) return;
    const id = window.location.hash.slice(1);
    if (!id) return;

    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [guide, openGroup]);

  if (loading) {
    return (
      <Page>
        <LoadingStateContent />
      </Page>
    );
  }

  if (!guide) {
    return (
      <Page>
        <Column>
          <Back href="/">← Dashboard</Back>
          <Lede>The guide is served by the API, which is not reachable right now.</Lede>
        </Column>
      </Page>
    );
  }

  const bySymbol = new Map(guide.assets.map((a) => [a.symbol, a]));
  const strategiesOf = (kind: StrategyKind) => guide.strategies.filter((s) => s.kind === kind);
  const examplesOf = (kind: StrategyKind) => guide.examples.filter((e) => e.kind === kind);
  const openFamilyDef = guide.families.find((f) => f.kind === openFamily);
  const openMathFamilyDef = guide.families.find((f) => f.kind === openMathFamily);
  const mathExamples = openMathFamilyDef ? examplesOf(openMathFamilyDef.kind) : [];
  const activeExample = mathExamples.find((e) => e.strategyId === openExample) ?? mathExamples[0];
  const allMetricsOpen = openMetrics.size === guide.metrics.length;

  const toggleMetric = (anchor: string) =>
    setOpenMetrics((current) => {
      const next = new Set(current);
      if (!next.delete(anchor)) next.add(anchor);
      return next;
    });

  // Only the metrics are listed entry by entry, and only while the section is
  // actually expanded — a rail entry pointing at a collapsed definition would
  // scroll to a teaser with nothing under it. The assets, strategies and math
  // sections live behind tabs, so a rail entry for one of those would have the
  // same problem; their sections are a screen each, not fifteen rows.
  const railItems: RailItem[] = SECTIONS.map((section) =>
    section.id === 'metrics' && metricsOpen
      ? {
          ...section,
          children: guide.metrics.map((metric) => ({
            id: metricAnchor(metric.id),
            label: metric.label,
          })),
        }
      : section
  );

  return (
    <Page>
      <Layout>
        <Column>
          <div>
            <Title>Field Guide</Title>
            <Lede>
              Every number on the dashboard comes from the same exercise: run a trading rule over
              real history, compare it against simply buying and holding the same asset, and ask
              whether the difference is big enough and consistent enough to be worth acting on. This
              page explains what is being tracked, what each rule does, and what each number means —
              including where it can mislead you.
            </Lede>
          </div>

          <Nav>
            {SECTIONS.map((section) => (
              <NavLink key={section.id} href={`#${section.id}`}>
                {section.label}
              </NavLink>
            ))}
          </Nav>

          <Section id="method">
            <SectionHead>
              <SectionTitle>How the backtest works</SectionTitle>
            </SectionHead>
            <Steps>
              {guide.method.map((note) => (
                <Step key={note.title}>
                  <StepTitle>{note.title}</StepTitle>
                  <Body>{note.body}</Body>
                </Step>
              ))}
            </Steps>
            <Footnote>
              Every run starts with ${guide.execution.initialCapital.toLocaleString()}, pays{' '}
              {guide.execution.feeBps} basis points in fees per fill and gives up{' '}
              {guide.execution.slippageBps} basis points to slippage. Results are measured over{' '}
              {guide.windows.daily.length} lookback windows on daily bars, from{' '}
              {guide.windows.daily.at(-1)?.label.toLowerCase()} to all available history.
            </Footnote>
          </Section>

          <Section id="assets">
            <SectionHead>
              <SectionTitle>What we track</SectionTitle>
            </SectionHead>
            <Body>
              The universe spans the broad market, all eleven sectors of it, and the macro
              instruments that usually explain why the sectors are moving — oil, gas, gold, silver,
              the dollar and long bonds. Watching them together is what makes a breadth reading mean
              something.
            </Body>

            {/* One category open at a time. Twenty-three descriptions stacked
              flat is a wall of prose nobody reads; picking a class first makes
              the section answer a question instead of reciting a list. */}
            <GroupTabs role="tablist">
              {guide.assetGroups.map((group) => (
                <GroupTab
                  key={group.category}
                  role="tab"
                  aria-selected={openGroup === group.category}
                  $active={openGroup === group.category}
                  onClick={() => setOpenGroup(group.category)}
                >
                  {group.label}
                  <TabCount>{group.symbols.length}</TabCount>
                </GroupTab>
              ))}
            </GroupTabs>

            <GroupPanel role="tabpanel">
              {(guide.assetGroups.find((g) => g.category === openGroup)?.symbols ?? []).map(
                (symbol) => {
                  const asset = bySymbol.get(symbol);
                  return asset ? <AssetEntry key={symbol} asset={asset} /> : null;
                }
              )}
            </GroupPanel>
          </Section>

          <Section id="strategies">
            <SectionHead>
              <SectionTitle>Strategies</SectionTitle>
            </SectionHead>
            <Body>
              {guide.strategies.length} rules, grouped by the kind of edge they try to capture. All
              of them are long-or-flat: they can only add value by being out of the market at the
              right moments. Parameters are the conventional textbook values, deliberately not tuned
              to this history.
            </Body>

            {/* Same tab pattern as the assets: pick a family, then read it.
              Five families of rules stacked flat is the same wall of prose. */}
            <GroupTabs role="tablist">
              {guide.families.map((family) => (
                <GroupTab
                  key={family.kind}
                  role="tab"
                  aria-selected={openFamily === family.kind}
                  $active={openFamily === family.kind}
                  onClick={() => setOpenFamily(family.kind)}
                >
                  {family.label}
                  <TabCount>{strategiesOf(family.kind).length}</TabCount>
                </GroupTab>
              ))}
            </GroupTabs>

            <GroupPanel role="tabpanel">
              {openFamilyDef && (
                <FamilySection
                  family={openFamilyDef}
                  strategies={strategiesOf(openFamilyDef.kind)}
                />
              )}
            </GroupPanel>
          </Section>

          <Section id="metrics">
            <SectionHead>
              <SectionTitle>Metrics</SectionTitle>
              {metricsOpen ? (
                <ToggleAll
                  onClick={() =>
                    setOpenMetrics(
                      allMetricsOpen
                        ? new Set()
                        : new Set(guide.metrics.map((metric) => metricAnchor(metric.id)))
                    )
                  }
                >
                  {allMetricsOpen ? 'Collapse all' : 'Expand all'}
                </ToggleAll>
              ) : (
                <ToggleAll onClick={() => setMetricsOpen(true)}>Show metrics</ToggleAll>
              )}
            </SectionHead>
            <Body>
              Every column in the report, what it measures and what it leaves out.{' '}
              {metricsOpen
                ? 'Open one for the full definition and how to read a value you are looking at.'
                : `${guide.metrics.length} definitions, collapsed by default — the math section below is the more useful read.`}
            </Body>

            {metricsOpen && (
              <MetricList>
                {guide.metrics.map((metric) => {
                  const anchor = metricAnchor(metric.id);
                  return (
                    <MetricEntry
                      key={metric.id}
                      metric={metric}
                      open={openMetrics.has(anchor)}
                      linked={linkedMetric === anchor}
                      onToggle={() => toggleMetric(anchor)}
                    />
                  );
                })}
              </MetricList>
            )}
          </Section>

          <Section id="math">
            <SectionHead>
              <SectionTitle>Math</SectionTitle>
            </SectionHead>
            <Body>
              One worked calculation per rule, on real {guide.examples[0]?.dataset.symbol} history —
              the same bars the backend fetched, not a synthetic series. Every equation is evaluated
              on an actual date, and every backtest compares against buying and holding the
              identical window.
            </Body>

            {/* Family first, then which rule within it: flat, one family had two
              rules competing for the same row and a name each time this list
              grows further would only make that worse. */}
            <GroupTabs role="tablist">
              {guide.families.map((family) => (
                <GroupTab
                  key={family.kind}
                  role="tab"
                  aria-selected={openMathFamily === family.kind}
                  $active={openMathFamily === family.kind}
                  onClick={() => setOpenMathFamily(family.kind)}
                >
                  {family.label}
                  <TabCount>{examplesOf(family.kind).length}</TabCount>
                </GroupTab>
              ))}
            </GroupTabs>

            {mathExamples.length > 1 && (
              <SubTabs role="tablist">
                {mathExamples.map((example) => (
                  <SubTab
                    key={example.strategyId}
                    role="tab"
                    aria-selected={activeExample?.strategyId === example.strategyId}
                    $active={activeExample?.strategyId === example.strategyId}
                    onClick={() => setOpenExample(example.strategyId)}
                  >
                    {example.name}
                  </SubTab>
                ))}
              </SubTabs>
            )}

            <GroupPanel role="tabpanel">
              {activeExample && (
                <StrategyExampleCard key={activeExample.strategyId} example={activeExample} />
              )}
            </GroupPanel>
          </Section>

          <Footnote>
            None of this is investment advice. A backtest describes what a rule would have done on
            data that has already happened, which is a weaker claim than it looks.
          </Footnote>
        </Column>

        <SectionRail
          items={railItems}
          // A collapsed metric would scroll to a name and nothing else, so the
          // rail opens whatever it is sending you to.
          onSelect={(id) => {
            if (!id.startsWith('metric-')) return;
            setMetricsOpen(true);
            setLinkedMetric(id);
            setOpenMetrics((current) => (current.has(id) ? current : new Set(current).add(id)));
          }}
        />
      </Layout>
    </Page>
  );
}
