import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/router';
import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import styled from 'styled-components';
import { Loader2, Search } from 'lucide-react';
import { theme } from '../styles/theme';
import { spin } from '../styles/keyframes';
import { searchTicker } from '../lib/api';
import { useFinSnapData } from '../lib/dataContext';
import { buildCommandItems, searchCommandItems, type CommandItem } from '../lib/commandItems';

const MAX_TRACK_SYMBOL_LEN = 10;

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: ${theme.zIndex.overlay};
  background: rgba(0, 0, 0, 0.6);
`;

const Content = styled(Dialog.Content)`
  position: fixed;
  top: 14vh;
  left: 50%;
  transform: translateX(-50%);
  z-index: ${theme.zIndex.overlay};
  width: min(560px, calc(100vw - 32px));
  max-height: min(60vh, 480px);
  display: flex;
  flex-direction: column;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlateStrong};
  background: ${theme.colors.codeBackgroundSlate};
  box-shadow: ${theme.colors.shadowSoft};
  backdrop-filter: blur(10px);
  outline: none;
  overflow: hidden;
`;

const InputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  flex: none;
`;

const Glyph = styled(Search)`
  width: 16px;
  height: 16px;
  flex: none;
  color: ${theme.colors.label};
`;

const SpinnerGlyph = styled(Loader2)`
  width: 16px;
  height: 16px;
  flex: none;
  color: ${theme.colors.accent};
  animation: ${spin} 0.8s linear infinite;
`;

const Input = styled.input`
  all: unset;
  flex: 1;
  font-size: 0.9rem;
  color: ${theme.colors.text};

  &::placeholder {
    color: ${theme.colors.label};
  }
`;

const Kbd = styled.kbd`
  font-size: 0.62rem;
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.label};
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: 4px;
  padding: 2px 5px;
`;

const List = styled.div`
  overflow-y: auto;
  padding: 6px;
`;

const GroupLabel = styled.div`
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  padding: 8px 10px 4px;
`;

const Row = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: ${theme.radius.sm};
  background: ${({ $active }) => ($active ? theme.colors.accentSoft : 'transparent')};

  svg {
    width: 16px;
    height: 16px;
    flex: none;
    color: ${theme.colors.label};
  }
`;

const TrackRow = styled(Row)`
  svg {
    color: ${theme.colors.accent};
  }
`;

const RowText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const RowTitle = styled.span`
  font-size: 0.82rem;
  font-weight: 600;
  color: ${theme.colors.textSlate};
`;

const RowSubtitle = styled.span`
  font-size: 0.68rem;
  color: ${theme.colors.label};
`;

const EmptyState = styled.div`
  padding: 24px 16px;
  text-align: center;
  font-size: 0.78rem;
  color: ${theme.colors.label};
`;

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { snap, refresh } = useFinSnapData();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => buildCommandItems(snap?.assets), [snap]);
  const results = useMemo(() => searchCommandItems(query, items), [query, items]);

  const trimmed = query.trim().toUpperCase();
  const exactTickerMatch = items.some(
    (i) => i.kind === 'ticker' && i.subtitle?.toUpperCase() === trimmed
  );
  const showTrackAction =
    trimmed.length > 0 && trimmed.length <= MAX_TRACK_SYMBOL_LEN && !exactTickerMatch;
  const flatCount = results.length + (showTrackAction ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setTrackError(null);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = (item: CommandItem) => {
    onOpenChange(false);
    void router.push(item.href);
  };

  const track = async () => {
    if (tracking) return;
    setTracking(true);
    setTrackError(null);
    const result = await searchTicker(trimmed);
    setTracking(false);

    if (!result.ok) {
      setTrackError(result.error);
      return;
    }

    onOpenChange(false);
    void refresh();
    void router.push(`/chart?ticker=${encodeURIComponent(result.symbol)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex < results.length) {
        const item = results[activeIndex];
        if (item) go(item);
      } else if (showTrackAction) {
        void track();
      }
    }
  };

  const indexed = results.map((item, index) => ({ item, index }));
  const routeResults = indexed.filter(({ item }) => item.kind === 'route');
  const tickerResults = indexed.filter(({ item }) => item.kind === 'ticker');
  const trackIndex = results.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Overlay />
        <Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>Command palette</Dialog.Title>
          </VisuallyHidden.Root>
          <InputRow>
            <Glyph aria-hidden />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Jump to a page or ticker…"
              spellCheck={false}
              autoComplete="off"
              aria-label="Search pages and tickers"
            />
            <Kbd>Esc</Kbd>
          </InputRow>

          <List role="listbox">
            {routeResults.length > 0 && (
              <>
                <GroupLabel>Pages</GroupLabel>
                {routeResults.map(({ item, index }) => {
                  const Icon = item.icon;
                  return (
                    <Row
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      $active={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(item)}
                    >
                      {Icon && <Icon aria-hidden />}
                      <RowText>
                        <RowTitle>{item.title}</RowTitle>
                      </RowText>
                    </Row>
                  );
                })}
              </>
            )}

            {tickerResults.length > 0 && (
              <>
                <GroupLabel>Tickers</GroupLabel>
                {tickerResults.map(({ item, index }) => (
                  <Row
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    $active={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(item)}
                  >
                    <RowText>
                      <RowTitle>{item.subtitle}</RowTitle>
                      <RowSubtitle>{item.title}</RowSubtitle>
                    </RowText>
                  </Row>
                ))}
              </>
            )}

            {showTrackAction && (
              <>
                <GroupLabel>Track</GroupLabel>
                <TrackRow
                  type="button"
                  role="option"
                  aria-selected={trackIndex === activeIndex}
                  $active={trackIndex === activeIndex}
                  onMouseEnter={() => setActiveIndex(trackIndex)}
                  onClick={() => void track()}
                >
                  {tracking ? <SpinnerGlyph aria-hidden /> : <Search aria-hidden />}
                  <RowText>
                    <RowTitle>Track {trimmed}</RowTitle>
                    <RowSubtitle>{trackError ?? 'Add to the tracked universe for 24h'}</RowSubtitle>
                  </RowText>
                </TrackRow>
              </>
            )}

            {results.length === 0 && !showTrackAction && <EmptyState>No matches</EmptyState>}
          </List>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
