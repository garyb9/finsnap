import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { spin } from '../styles/keyframes';
import { theme } from '../styles/theme';
import { searchTicker } from '../lib/api';
import { useFinSnapData } from '../lib/dataContext';

const ERROR_DISMISS_MS = 5_000;
const SUCCESS_DISMISS_MS = 4_000;

/**
 * Docked in the header, next to the live-status readout.
 *
 * Adding a ticker here is the same "join the universe" path as one set at
 * boot — see `UniverseRegistry.search` on the backend — so the confirmation
 * says what actually happens: it stays tracked for 24 hours, with a live
 * snap, options context, and every backtest strategy the rest of the
 * dashboard gets.
 */

const Wrap = styled.div`
  position: relative;
  margin-left: auto;
  flex: none;

  @media (max-width: ${theme.breakpoints.md}) {
    display: none;
  }
`;

const Form = styled.form<{ $tone: 'idle' | 'error' | 'success' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: ${theme.radius.pill};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'error'
        ? theme.colors.danger
        : $tone === 'success'
          ? theme.colors.success
          : theme.colors.borderSlate};
  transition: border-color 0.15s ease;

  &:focus-within {
    border-color: ${theme.colors.accent};
  }
`;

const Glyph = styled.svg`
  width: 11px;
  height: 11px;
  flex: none;
  color: ${theme.colors.label};
`;

const Spinner = styled.svg`
  width: 11px;
  height: 11px;
  flex: none;
  color: ${theme.colors.accent};
  animation: ${spin} 0.8s linear infinite;
`;

const Input = styled.input`
  all: unset;
  width: 74px;
  font-family: inherit;
  font-size: 0.71rem;
  letter-spacing: 0.02em;
  color: ${theme.colors.text};
  transition: width 0.15s ease;

  &:focus {
    width: 104px;
  }

  &::placeholder {
    color: ${theme.colors.label};
  }
`;

const Popover = styled.div<{ $tone: 'error' | 'success' }>`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: ${theme.radius.sm};
  font-size: 0.68rem;
  line-height: 1.45;
  color: ${({ $tone }) => ($tone === 'error' ? theme.colors.danger : theme.colors.success)};
  background: ${theme.colors.codeBackgroundSlate};
  border: 1px solid
    ${({ $tone }) => ($tone === 'error' ? theme.colors.danger : theme.colors.success)};
  box-shadow: ${theme.colors.shadowSoft};
  backdrop-filter: blur(8px);
  z-index: 41;
`;

function SearchGlyph() {
  return (
    <Glyph viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-4.8-4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Glyph>
  );
}

function SpinnerGlyph() {
  return (
    <Spinner viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 11A8 8 0 1 0 18.6 16"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </Spinner>
  );
}

type Status = { tone: 'error' | 'success'; message: string } | null;

export function TickerSearch() {
  const { refresh } = useFinSnapData();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    []
  );

  const flash = useCallback((next: Status, ms: number) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setStatus(next);
    if (next) dismissTimer.current = setTimeout(() => setStatus(null), ms);
  }, []);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const symbol = value.trim();
      if (!symbol || loading) return;

      setLoading(true);
      const result = await searchTicker(symbol);
      setLoading(false);

      if (!result.ok) {
        flash({ tone: 'error', message: result.error }, ERROR_DISMISS_MS);
        return;
      }

      setValue('');
      flash(
        { tone: 'success', message: `${result.label} added — tracking for 24h` },
        SUCCESS_DISMISS_MS
      );
      void refresh();
    },
    [value, loading, refresh, flash]
  );

  return (
    <Wrap>
      <Form $tone={status?.tone ?? 'idle'} onSubmit={(e) => void onSubmit(e)}>
        {loading ? <SpinnerGlyph /> : <SearchGlyph />}
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onFocus={() => setStatus(null)}
          placeholder="Ticker…"
          maxLength={15}
          spellCheck={false}
          autoComplete="off"
          aria-label="Search a ticker to track"
        />
      </Form>
      {status && (
        <Popover $tone={status.tone} role={status.tone === 'error' ? 'alert' : 'status'}>
          {status.message}
        </Popover>
      )}
    </Wrap>
  );
}
