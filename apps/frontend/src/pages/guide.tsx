import { useEffect, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { LoadingStateContent } from '../components/LoadingState';
import { fetchGuide } from '../lib/api';
import { StrategyKind } from '../types/enums';
import {
  assetAnchor,
  metricAnchor,
  strategyAnchor,
  type Guide,
  type GuideAsset,
  type GuideFamily,
  type GuideStrategy,
} from '../types/guide';

const SECTIONS = [
  { id: 'method', label: 'How it works' },
  { id: 'assets', label: 'What we track' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'metrics', label: 'Metrics' },
];

// ---------- Styled ----------

const Column = styled.div`
  width: 100%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 34px;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
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
  max-width: 70ch;
`;

const Nav = styled.nav`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 10px 0;
  background: linear-gradient(${theme.colors.backgroundGradientMid} 65%, rgba(2, 6, 23, 0) 100%);
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
  scroll-margin-top: 60px;
`;

const SectionTitle = styled.h2`
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const GroupTitle = styled.h3`
  font-size: 0.82rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  margin: 10px 0 0;
`;

const Entry = styled.article`
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.borderSlate};
  background: ${theme.colors.slateOverlay};
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  scroll-margin-top: 66px;

  /* A deep link should make it obvious which entry you landed on — at this
     contrast a border tint alone is invisible, so the ring does the work. */
  &:target {
    border-color: ${theme.colors.accent};
    background: ${theme.colors.accentSoft};
    box-shadow: 0 0 0 1px ${theme.colors.accent};
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
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 4px;
  padding: 1px 5px;
`;

const Body = styled.p`
  font-size: 0.82rem;
  line-height: 1.65;
  color: ${theme.colors.textSlateLight};
  margin: 0;
  max-width: 78ch;
`;

const Caveat = styled.p`
  font-size: 0.76rem;
  line-height: 1.6;
  color: ${theme.colors.warning};
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid ${theme.colors.warning}55;
  max-width: 78ch;
`;

const Aside = styled.p<{ $tone: 'good' | 'bad' }>`
  font-size: 0.78rem;
  line-height: 1.6;
  margin: 0;
  color: ${theme.colors.textMuted};
  max-width: 78ch;

  strong {
    color: ${({ $tone }) => ($tone === 'good' ? theme.colors.success : theme.colors.danger)};
    font-weight: 600;
  }
`;

const Reading = styled.p`
  font-size: 0.78rem;
  line-height: 1.6;
  margin: 0;
  color: ${theme.colors.textMuted};
  padding-left: 10px;
  border-left: 2px solid ${theme.colors.borderSlateMuted};
  max-width: 78ch;
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

function StrategyEntry({ strategy, family }: { strategy: GuideStrategy; family?: GuideFamily }) {
  return (
    <Entry id={strategyAnchor(strategy.id)}>
      <EntryHead>
        <EntryName>{strategy.name}</EntryName>
        {/* Named on every entry, not just the group heading above it: arriving
            by deep link skips the heading entirely. */}
        {family && <Tag>{family.label}</Tag>}
        <EntrySub>needs {strategy.warmup} bars of history</EntrySub>
      </EntryHead>
      <Body>{strategy.description}</Body>
    </Entry>
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
          <StrategyEntry strategy={s} family={family} />
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
    const id = window.location.hash.slice(1);
    if (!id) return;

    const target = document.getElementById(id);
    target?.scrollIntoView({ block: 'start' });
  }, [guide]);

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
  // Buy & hold is listed on its own at the end: it is the yardstick, and
  // grouping it with the rules it measures would suggest it is one of them.
  const benchmarks = guide.strategies.filter((s) => s.kind === StrategyKind.Benchmark);

  return (
    <Page>
      <Column>
        <TopBar>
          <Back href="/">← Dashboard</Back>
        </TopBar>

        <div>
          <Title>Field Guide</Title>
          <Lede>
            Every number on the dashboard comes from the same exercise: run a trading rule over real
            history, compare it against simply buying and holding the same asset, and ask whether
            the difference is big enough and consistent enough to be worth acting on. This page
            explains what is being tracked, what each rule does, and what each number means —
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
          <SectionTitle>How the backtest works</SectionTitle>
          {guide.method.map((note) => (
            <Entry key={note.title}>
              <EntryName>{note.title}</EntryName>
              <Body>{note.body}</Body>
            </Entry>
          ))}
          <Footnote>
            Every run starts with ${guide.execution.initialCapital.toLocaleString()}, pays{' '}
            {guide.execution.feeBps} basis points in fees per fill and gives up{' '}
            {guide.execution.slippageBps} basis points to slippage. Results are measured over{' '}
            {guide.windows.daily.length} lookback windows on daily bars, from{' '}
            {guide.windows.daily.at(-1)?.label.toLowerCase()} to all available history.
          </Footnote>
        </Section>

        <Section id="assets">
          <SectionTitle>What we track</SectionTitle>
          <Body>
            The universe spans the broad market, all eleven sectors of it, and the macro instruments
            that usually explain why the sectors are moving — oil, gas, gold, silver, the dollar and
            long bonds. Watching them together is what makes a breadth reading mean something.
          </Body>

          {guide.assetGroups.map((group) => (
            <div key={group.category}>
              <GroupTitle>{group.label}</GroupTitle>
              {group.symbols.map((symbol) => {
                const asset = bySymbol.get(symbol);
                return asset ? (
                  <div key={symbol} style={{ marginTop: 10 }}>
                    <AssetEntry asset={asset} />
                  </div>
                ) : null;
              })}
            </div>
          ))}
        </Section>

        <Section id="strategies">
          <SectionTitle>Strategies</SectionTitle>
          <Body>
            {guide.strategies.length} rules, grouped by the kind of edge they try to capture. All of
            them are long-or-flat: they can only add value by being out of the market at the right
            moments. Parameters are the conventional textbook values, deliberately not tuned to this
            history.
          </Body>

          {guide.families.map((family) => (
            <FamilySection
              key={family.kind}
              family={family}
              strategies={guide.strategies.filter(
                (s) => s.kind === family.kind && s.kind !== StrategyKind.Benchmark
              )}
            />
          ))}

          {benchmarks.length > 0 && (
            <div>
              <GroupTitle>Benchmark</GroupTitle>
              {benchmarks.map((s) => (
                <div key={s.id} style={{ marginTop: 10 }}>
                  <StrategyEntry strategy={s} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section id="metrics">
          <SectionTitle>Metrics</SectionTitle>
          {guide.metrics.map((metric) => (
            <Entry key={metric.id} id={metricAnchor(metric.id)}>
              <EntryHead>
                <EntryName>{metric.label}</EntryName>
                <EntrySub>{metric.short}</EntrySub>
              </EntryHead>
              <Body>{metric.detail}</Body>
              <Reading>{metric.reading}</Reading>
            </Entry>
          ))}
        </Section>

        <Footnote>
          None of this is investment advice. A backtest describes what a rule would have done on
          data that has already happened, which is a weaker claim than it looks.
        </Footnote>
      </Column>
    </Page>
  );
}
