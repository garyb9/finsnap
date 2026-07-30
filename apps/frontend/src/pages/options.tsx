import { useState } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { OptionsTabCard } from '../components/OptionsTabCard';
import { LoadingStateContent } from '../components/LoadingState';
import { useFinSnapData } from '../lib/dataContext';
import type { WallKind } from '../lib/options';

const Empty = styled.div`
  width: 100%;
  padding: 48px 22px;
  text-align: center;
  font-size: 0.82rem;
  color: ${theme.colors.label};
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: ${theme.radius.lg};
  background: ${theme.colors.slateOverlay};
`;

/**
 * The page's own header, aligned to the card under it.
 *
 * This was a bare paragraph in a centring container with a `ch` cap, which at
 * this type size resolved to about 480px — so it floated in the middle of a
 * 1400px page, attached to nothing. Full width, left edge shared with the card,
 * and the sentence split off the title it was doing double duty as.
 */
const Head = styled.header`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 2px 6px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 600;
  color: ${theme.colors.label};
`;

const Note = styled.p`
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.7;
  color: ${theme.colors.textMuted};
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
  padding: 14px 2px 20px;

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
  const { snap, loading } = useFinSnapData();
  const assets = snap ? Object.values(snap.assets).filter((a) => a.options) : [];
  // Shared with the wall charts below: hovering a glossary term highlights
  // every matching arrow on both charts, and hovering an arrow highlights the
  // term back — one flag, read in three places.
  const [hoveredKind, setHoveredKind] = useState<WallKind | null>(null);

  if (loading && !snap) {
    return (
      <Page>
        <LoadingStateContent />
      </Page>
    );
  }

  return (
    <Page>
      <MainContainer>
        <Head>
          <Title>Options positioning</Title>
          <Note>
            Open interest and volume by expiry for the liquid tickers, with the walls each chain is
            building and the dates they sit on. Read it as context rather than as a signal — none of
            it feeds the strategies, and a wall of puts is a statement about positioning, not about
            direction.
          </Note>
        </Head>

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

        {assets.length > 0 ? (
          <OptionsTabCard assets={assets} hoveredKind={hoveredKind} onHoverKind={setHoveredKind} />
        ) : (
          <Empty>
            No option chains in the latest snapshot. Only the symbols in `OPTIONS_SYMBOLS` are
            pulled — paging every expiry for the whole universe is slow.
          </Empty>
        )}
      </MainContainer>
    </Page>
  );
}
