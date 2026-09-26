import katex from 'katex';
import { useMemo } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';

/**
 * No `overflow-x` on this element itself: setting only one overflow axis
 * forces the other to `auto` too (the CSS overflow-pairing rule), and a
 * fraction's true height is a hair taller than a flex row sized off its
 * baseline expects — just enough for the browser to decide it needs a
 * vertical scrollbar and draw its spinner arrows over the equation. The
 * horizontal scroll a wide formula needs on a narrow screen lives on
 * `.katex-display` instead, whose own height is never constrained by a
 * sibling, so there is nothing for it to clip.
 */
const Wrap = styled.span<{ $block: boolean }>`
  display: ${({ $block }) => ($block ? 'block' : 'inline-block')};
  color: ${theme.colors.textSlate};
  font-size: ${({ $block }) => ($block ? '1.25rem' : '1.08rem')};
  max-width: 100%;

  .katex {
    font-size: 1em;
  }

  .katex-display {
    margin: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 3px 0 8px;

    /* A native scrollbar on a one-line equation reads as a stray control —
       this only ever fires on a formula too wide for a narrow screen, where a
       thin unobtrusive track beats the browser's default arrows-and-thumb. */
    scrollbar-width: thin;
    scrollbar-color: ${theme.colors.borderSlateMuted} transparent;

    &::-webkit-scrollbar {
      height: 4px;
    }

    &::-webkit-scrollbar-button {
      display: none;
    }

    &::-webkit-scrollbar-thumb {
      background: ${theme.colors.borderSlateMuted};
      border-radius: ${theme.radius.pill};
    }
  }
`;

/**
 * One rendered LaTeX expression.
 *
 * `katex.renderToString` rather than a React binding: the guide's formulas are
 * static strings built once on the backend, so there is nothing dynamic enough
 * to need a component library on top of the renderer itself, and one fewer
 * dependency to keep in step with KaTeX's own releases.
 */
export function Formula({ tex, block = false }: { tex: string; block?: boolean }) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        throwOnError: false,
        displayMode: block,
        output: 'html',
      }),
    [tex, block]
  );

  return <Wrap $block={block} dangerouslySetInnerHTML={{ __html: html }} />;
}
