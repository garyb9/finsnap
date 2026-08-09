import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { OptionsTabCard } from '../components/OptionsTabCard';
import { OptionsTickerRail } from '../components/OptionsTickerRail';
import { LoadingStateContent } from '../components/LoadingState';
import { useFinSnapData } from '../lib/dataContext';
import { ALL_TICKERS, assetsWithChains, type WallKind } from '../lib/options';

/**
 * The whole page as one card — the rail, the wall glossary and the chain
 * detail used to be three separately bordered pieces stacked and side by
 * side, which read as unrelated widgets rather than one tool. One boundary,
 * one background, a single internal divider between the ticker list and
 * everything it drives. Fills the page's own width, same as every other page.
 */
const PanelWrap = styled.section`
  width: 100%;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
  padding: 20px 22px;
  display: flex;
`;

const Layout = styled.div`
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
`;

const RailCol = styled.div`
  flex: none;
  display: flex;
  min-height: 0;
  padding-right: 20px;
  border-right: 1px solid ${theme.colors.borderSlate};
`;

const ContentCol = styled.div`
  flex: 1;
  min-width: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
`;

const Empty = styled.div`
  width: 100%;
  padding: 48px 22px;
  text-align: center;
  font-size: 0.82rem;
  color: ${theme.colors.label};
`;

/**
 * What "wall" means before the reader hits it in the table — four short
 * cases rather than one dense paragraph, since above-spot and below-spot mean
 * different things for each side and are easy to conflate on first read.
 */
const Glossary = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 0 0 20px;

  @media (max-width: ${theme.breakpoints.lg}) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: ${theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
  }
`;

const GlossaryTile = styled.div<{ $active: boolean }>`
  padding: 10px 12px;
  border-radius: ${theme.radius.md};
  background: ${({ $active }) => ($active ? theme.colors.accentHover : theme.colors.slateOverlay)};
  border: 1px solid ${({ $active }) => ($active ? theme.colors.accent : theme.colors.borderSlate)};
  cursor: default;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
`;

const GlossaryTerm = styled.div<{ $color: string }>`
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.71rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  margin-bottom: 4px;

  &::before {
    content: attr(data-glyph);
    color: ${({ $color }) => $color};
    font-size: 0.64rem;
  }
`;

const GlossaryText = styled.p`
  margin: 0;
  font-size: 0.71rem;
  line-height: 1.55;
  color: ${theme.colors.textMuted};
`;

const WALL_GLOSSARY: {
  kind: WallKind;
  glyph: string;
  color: string;
  term: string;
  text: string;
}[] = [
  {
    kind: 'callAbove',
    glyph: '▲',
    color: theme.colors.success,
    term: 'Call wall, above spot',
    text: 'The classic case: heaviest call interest sits above the price. Dealers hedging those calls tend to sell into a rally, which can slow it down.',
  },
  {
    kind: 'callBelow',
    glyph: '▲',
    color: theme.colors.success,
    term: 'Call wall, below spot',
    text: 'Heaviest call interest sits below the price, already in the money. Not the classic setup — usually just marks where buyers piled in earlier.',
  },
  {
    kind: 'putBelow',
    glyph: '▼',
    color: theme.colors.danger,
    term: 'Put wall, below spot',
    text: 'The classic case: heaviest put interest sits below the price. Dealers hedging those puts tend to buy the dip, which can slow a decline.',
  },
  {
    kind: 'putAbove',
    glyph: '▼',
    color: theme.colors.danger,
    term: 'Put wall, above spot',
    text: 'Heaviest put interest sits above the price, already in the money for the buyer. Not the classic setup — usually just marks where protection was bought earlier.',
  },
];

/**
 * Options positioning, on its own tab.
 *
 * Given a page of its own because it answers a different question from the
 * report: not "should I be in this" but "where is everyone else positioned".
 * It is context, never a signal — nothing here feeds the backtests.
 */
export default function OptionsPage() {
  const { snap, guide, loading } = useFinSnapData();
  const withChains = useMemo(
    () => assetsWithChains(snap ? Object.values(snap.assets).filter((a) => a.options) : []),
    [snap]
  );
  // Shared with the wall charts below: hovering a glossary term highlights
  // every matching arrow on both charts, and hovering an arrow highlights the
  // term back — one flag, read in three places.
  const [hoveredKind, setHoveredKind] = useState<WallKind | null>(null);
  // The aggregate view leads the rail, but a single ticker is still the
  // default landing view — "All" is there to be reached for, not opened onto.
  // `null` means "no explicit choice yet", which falls back to the first
  // ticker once the universe has loaded rather than needing an effect to
  // catch up once `withChains` goes from empty to populated.
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const effectiveTicker = activeTicker ?? withChains[0]?.symbol ?? ALL_TICKERS;

  if (loading && !snap) {
    return (
      <Page>
        <LoadingStateContent />
      </Page>
    );
  }

  return (
    <Page>
      <PanelWrap>
        <Layout>
          {withChains.length > 0 && (
            <RailCol>
              <OptionsTickerRail
                assets={withChains}
                guide={guide}
                active={effectiveTicker}
                onSelect={setActiveTicker}
              />
            </RailCol>
          )}

          <ContentCol>
            <Glossary>
              {WALL_GLOSSARY.map(({ kind, glyph, color, term, text }) => (
                <GlossaryTile
                  key={term}
                  $active={hoveredKind === kind}
                  onMouseEnter={() => setHoveredKind(kind)}
                  onMouseLeave={() => setHoveredKind(null)}
                >
                  <GlossaryTerm data-glyph={glyph} $color={color}>
                    {term}
                  </GlossaryTerm>
                  <GlossaryText>{text}</GlossaryText>
                </GlossaryTile>
              ))}
            </Glossary>

            {withChains.length > 0 ? (
              <OptionsTabCard
                assets={withChains}
                active={effectiveTicker}
                hoveredKind={hoveredKind}
                onHoverKind={setHoveredKind}
              />
            ) : (
              <Empty>
                No option chains in the latest snapshot. Only the symbols in `OPTIONS_SYMBOLS` are
                pulled — paging every expiry for the whole universe is slow.
              </Empty>
            )}
          </ContentCol>
        </Layout>
      </PanelWrap>
    </Page>
  );
}
