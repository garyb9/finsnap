import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';

/**
 * A generic picker: a pill trigger showing the current selection, opening a
 * scrollable panel of rows. Each row can carry a secondary line — a ticker's
 * full name, a strategy's one-line premise — so the picker itself answers
 * "what is this" without a separate lookup.
 *
 * Shared by the chart page's ticker, strategy and compare pickers rather than
 * one-off per use, so the open/close/outside-click/Escape behaviour is
 * written and tested once.
 */

export interface DropdownOption<T extends string> {
  value: T;
  primary: string;
  secondary?: string;
  /** Right-aligned column — a price, a market cap, whatever ranks the list. */
  meta?: string;
}

const Wrap = styled.div`
  position: relative;
`;

const Trigger = styled.button<{ $open: boolean }>`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 6px 8px 6px 12px;
  border-radius: ${theme.radius.pill};
  color: ${theme.colors.textSlate};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid ${({ $open }) => ($open ? theme.colors.accent : theme.colors.borderSlate)};
  white-space: nowrap;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${theme.colors.accent};
  }
`;

const Chevron = styled.span<{ $open: boolean }>`
  font-size: 0.55rem;
  color: ${theme.colors.label};
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
  transition: transform 0.15s ease;
`;

const Panel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  max-width: 380px;
  max-height: 340px;
  overflow-y: auto;
  /* Extra right padding — a scrollable panel's own scrollbar sits inside this
     box and eats into row width without shrinking the box, so a row's right
     edge (the meta column, usually) would otherwise render half under it. */
  padding: 6px 14px 6px 6px;
  border-radius: ${theme.radius.md};
  background: ${theme.colors.codeBackgroundSlate};
  border: 1px solid ${theme.colors.borderSlate};
  box-shadow: ${theme.colors.shadowSoft};
  backdrop-filter: blur(10px);
  z-index: 41;
`;

const Row = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border-radius: ${theme.radius.sm};
  background: ${({ $active }) => ($active ? theme.colors.accentSoft : 'transparent')};

  &:hover {
    background: ${theme.colors.slateOverlay};
  }
`;

const RowText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const RowPrimary = styled.span<{ $active: boolean }>`
  font-size: 0.76rem;
  font-weight: 700;
  color: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.textSlate)};
`;

const RowSecondary = styled.span`
  font-size: 0.65rem;
  color: ${theme.colors.label};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RowMeta = styled.span`
  flex: none;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textMuted};
  white-space: nowrap;
`;

interface Props<T extends string> {
  /** Shown on the trigger when nothing is selected. */
  placeholder: string;
  options: DropdownOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

export function Dropdown<T extends string>({ placeholder, options, value, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <Wrap ref={ref}>
      <Trigger
        type="button"
        $open={open}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? selected.primary : placeholder}
        <Chevron $open={open} aria-hidden>
          ▼
        </Chevron>
      </Trigger>
      {open && (
        <Panel role="listbox">
          {options.map((o) => (
            <Row
              key={o.value}
              type="button"
              $active={o.value === value}
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <RowText>
                <RowPrimary $active={o.value === value}>{o.primary}</RowPrimary>
                {o.secondary && <RowSecondary>{o.secondary}</RowSecondary>}
              </RowText>
              {o.meta && <RowMeta>{o.meta}</RowMeta>}
            </Row>
          ))}
        </Panel>
      )}
    </Wrap>
  );
}
