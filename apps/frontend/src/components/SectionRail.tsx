import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';

export type RailItem = {
  /** Element id this entry points at — must exist in the document. */
  id: string;
  label: string;
  children?: RailItem[];
};

/**
 * The reading line: how far below the sticky header an element has to reach
 * before it counts as "the thing you are currently looking at". Anything in the
 * bottom two thirds of the viewport is still ahead of you, not being read.
 *
 * The top edge sits just below where a deep link parks its target, so the tail
 * of the entry above cannot claim the highlight from the one you jumped to.
 */
const SPY_TOP = 110;
const SPY_BOTTOM_IGNORED = '70%';

/**
 * Which of `ids` is currently being read.
 *
 * The naive version — nearest heading above the fold — has to run on every
 * scroll event and read layout each time. An observer with a clipped root does
 * the same job from a band near the top of the viewport, and only fires when
 * something crosses it. When nothing is in the band (long section, or scrolled
 * past the end) the last answer stands, which is what a reader expects.
 *
 * `preferred` holds the entries nested inside another one. A section element
 * wraps its own entries, so it is in the band the entire time you are reading
 * it and would win every comparison against them — the narrower answer is
 * always the more useful one.
 */
function useActiveId(ids: string[], preferred: string[]): string {
  const [active, setActive] = useState('');
  const key = ids.join('|');
  const nestedKey = preferred.join('|');

  useEffect(() => {
    const ordered = key ? key.split('|') : [];
    if (ordered.length === 0) return;
    const nested = new Set(nestedKey ? nestedKey.split('|') : []);

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first =
          ordered.find((id) => visible.has(id) && nested.has(id)) ??
          ordered.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: `-${SPY_TOP}px 0px -${SPY_BOTTOM_IGNORED} 0px` }
    );

    for (const id of ordered) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key, nestedKey]);

  return active;
}

const Rail = styled.nav`
  /* The prose column is the page; the rail is an aid. Below this width there is
     no room for it and the pill nav above the content takes over — the two are
     keyed to the same min-width so exactly one of them is ever showing. */
  display: none;

  @media (min-width: ${theme.breakpoints.lg}) {
    display: block;
  }

  position: sticky;
  top: calc(${theme.headerHeight} + 24px);
  flex: none;
  width: 208px;
  max-height: calc(100vh - ${theme.headerHeight} - 48px);
  overflow-y: auto;
  padding-left: 18px;
  border-left: 1px solid ${theme.colors.borderSlate};

  /* A scrollbar on a nav this thin is more noise than the nav itself. */
  scrollbar-width: thin;
  scrollbar-color: ${theme.colors.borderSlateMuted} transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${theme.colors.borderSlateMuted};
    border-radius: ${theme.radius.pill};
  }
`;

const RailTitle = styled.div`
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin-bottom: 10px;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SubList = styled(List)`
  margin: 2px 0 8px;
`;

const RailLink = styled.a<{ $active: boolean; $sub: boolean }>`
  display: block;
  position: relative;
  text-decoration: none;
  line-height: 1.4;
  padding: ${({ $sub }) => ($sub ? '3px 0 3px 12px' : '5px 0')};
  font-size: ${({ $sub }) => ($sub ? '0.72rem' : '0.76rem')};
  font-weight: ${({ $active, $sub }) => ($active || !$sub ? 600 : 400)};
  color: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.textMuted)};
  letter-spacing: ${({ $sub }) => ($sub ? '0' : '0.04em')};

  /* The marker sits on the rail's own border, so the active entry reads as
     attached to the line rather than as another indent level. */
  &::before {
    content: '';
    position: absolute;
    left: -19px;
    top: 4px;
    bottom: 4px;
    width: 2px;
    background: ${({ $active }) => ($active ? theme.colors.accent : 'transparent')};
  }

  &:hover {
    color: ${theme.colors.accent};
  }
`;

/**
 * The table of contents pinned beside the guide.
 *
 * Long-form pages lose you: fifteen metrics look identical while scrolling and
 * there is nothing to tell you how much is left. The rail answers both — where
 * you are, and what else there is — without costing a click.
 *
 * `onSelect` fires before the scroll so the page can open whatever the target
 * lives inside; the jump then happens on the next frame, once it is rendered.
 */
export function SectionRail({
  items,
  onSelect,
}: {
  items: RailItem[];
  onSelect?: (id: string) => void;
}) {
  const railRef = useRef<HTMLElement>(null);

  const ids = useMemo(
    () => items.flatMap((item) => [item.id, ...(item.children ?? []).map((child) => child.id)]),
    [items]
  );
  const childIds = useMemo(
    () => items.flatMap((item) => (item.children ?? []).map((child) => child.id)),
    [items]
  );
  const active = useActiveId(ids, childIds);

  // A child three sections down should still light its parent, otherwise the
  // rail claims you have left a section you are in the middle of.
  const activeParent =
    items.find((item) => item.id === active)?.id ??
    items.find((item) => item.children?.some((child) => child.id === active))?.id ??
    '';

  // Keep the active entry inside the rail's own scroll box. `scrollIntoView`
  // would drag the page with it, so nudge the container directly instead.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !active) return;

    const link = rail.querySelector<HTMLElement>(`[data-rail-id="${CSS.escape(active)}"]`);
    if (!link) return;

    // Measured, not `offsetTop`: the rail is sticky and therefore positioned,
    // so what a link's offsetTop is relative to depends on the layout above it.
    const top =
      link.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop;
    const bottom = top + link.offsetHeight;
    if (top < rail.scrollTop + 12) rail.scrollTop = top - 12;
    else if (bottom > rail.scrollTop + rail.clientHeight - 12)
      rail.scrollTop = bottom - rail.clientHeight + 12;
  }, [active]);

  const jump = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    onSelect?.(id);
    window.history.replaceState(null, '', `#${id}`);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <Rail ref={railRef} aria-label="On this page">
      <RailTitle>On this page</RailTitle>
      <List>
        {items.map((item) => (
          <li key={item.id}>
            <RailLink
              href={`#${item.id}`}
              data-rail-id={item.id}
              $active={activeParent === item.id}
              $sub={false}
              onClick={(event) => jump(event, item.id)}
            >
              {item.label}
            </RailLink>

            {item.children && item.children.length > 0 && (
              <SubList>
                {item.children.map((child) => (
                  <li key={child.id}>
                    <RailLink
                      href={`#${child.id}`}
                      data-rail-id={child.id}
                      $active={active === child.id}
                      $sub
                      onClick={(event) => jump(event, child.id)}
                    >
                      {child.label}
                    </RailLink>
                  </li>
                ))}
              </SubList>
            )}
          </li>
        ))}
      </List>
    </Rail>
  );
}
