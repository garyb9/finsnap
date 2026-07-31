import { useEffect, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import { spin } from '../styles/keyframes';
import { theme } from '../styles/theme';
import { useSync } from '../lib/useSync';
import { BarInterval } from '../types/enums';
import { SyncPhase, SyncStage, SyncState, type SyncStep } from '../types/sync';

const PHASE_LABEL: Record<SyncPhase, string> = {
  [SyncPhase.Fetching]: 'Fetching market data',
  [SyncPhase.Snapshot]: 'Rebuilding snapshot',
  [SyncPhase.Report]: 'Running backtests',
  [SyncPhase.Done]: 'Done',
};

/** Fetch order matches the backend's `BarCollector` exactly — daily first, then hourly, then 5-minute. */
const INTERVAL_ORDER = [BarInterval.Daily, BarInterval.Hourly, BarInterval.FiveMinute];

const INTERVAL_LABEL: Record<BarInterval, string> = {
  [BarInterval.Daily]: 'daily',
  [BarInterval.Hourly]: 'hourly',
  [BarInterval.FiveMinute]: '5-minute',
};

const STAGE_COLOR: Record<SyncStage, string> = {
  [SyncStage.Queued]: theme.colors.label,
  [SyncStage.Bars]: theme.colors.accent,
  [SyncStage.Options]: theme.colors.accent,
  [SyncStage.Done]: theme.colors.success,
  [SyncStage.Empty]: theme.colors.warning,
  [SyncStage.Failed]: theme.colors.danger,
};

const PHASE_HINT: Record<SyncPhase, string> = {
  [SyncPhase.Fetching]: 'Pulling bars and option chains',
  [SyncPhase.Snapshot]: 'Recomputing the live view',
  [SyncPhase.Report]: 'Re-running every backtest',
  [SyncPhase.Done]: 'Refresh every asset, then rebuild the snapshot and the daily report.',
};

/** Latency bands, so a slow symbol is visible without reading the number. */
function latencyColor(ms: number): string {
  if (ms < 400) return theme.colors.success;
  if (ms < 1500) return theme.colors.warning;
  return theme.colors.danger;
}

// ---------- Styled ----------

/**
 * Docked into the header row rather than floating above it.
 *
 * The control belongs visually to the header, so its button is centred on the
 * same baseline as the wordmark and tabs: half the header height, less half the
 * button's own height.
 */
const TOGGLE_HEIGHT = 34;

const Dock = styled.div`
  position: fixed;
  top: calc((${theme.headerHeight} - ${TOGGLE_HEIGHT}px) / 2);
  /*
   * Aligned to the header's centred container, not to the viewport edge.
   * The header is capped at ${theme.maxWidth.dashboard} and centred, so pinning
   * this to the window left a growing gap between the live-status readout and
   * this button on any screen wider than that cap.
   */
  right: max(22px, calc((100vw - ${theme.maxWidth.dashboard}) / 2 + 22px));
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  max-width: min(400px, calc(100vw - 32px));

  @media (max-width: ${theme.breakpoints.md}) {
    right: 10px;
  }
`;

/**
 * The docked control. Opens the panel — it does not start a sync.
 *
 * Firing a multi-minute job straight off the toolbar button was too easy to do
 * by accident; the trigger now lives inside the panel where it can be labelled
 * with what it actually does.
 */
const Toggle = styled.button<{ $busy: boolean; $open: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $busy, $open }) => ($busy || $open ? theme.colors.accent : theme.colors.textSlate)};
  background: ${theme.colors.slateOverlayMuted};
  border: 1px solid
    ${({ $busy, $open }) => ($busy || $open ? theme.colors.accent : theme.colors.borderSlateMuted)};
  border-radius: ${theme.radius.pill};
  height: ${TOGGLE_HEIGHT}px;
  padding: 0 14px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition:
    border-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    border-color: ${theme.colors.accent};
    color: ${theme.colors.accent};
  }
`;

/**
 * Rotating arrows while a sync runs, static otherwise.
 *
 * A spinning ring reads as "the page is loading"; a rotating refresh glyph
 * reads as "the thing you asked for is happening", which is the distinction
 * that matters when the job takes minutes.
 */
const RefreshIcon = styled.svg<{ $busy: boolean }>`
  width: 12px;
  height: 12px;
  flex: none;
  color: ${({ $busy }) => ($busy ? theme.colors.accent : 'currentColor')};
  animation: ${({ $busy }) =>
    $busy
      ? css`
          ${spin} 1.1s linear infinite
        `
      : 'none'};
`;

function Refresh({ busy }: { busy: boolean }) {
  return (
    <RefreshIcon $busy={busy} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 11A8 8 0 1 0 18.6 16M20 5v6h-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RefreshIcon>
  );
}

/** The explicit trigger, inside the panel. */
const RunButton = styled.button<{ $busy: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $busy }) => ($busy ? theme.colors.label : theme.colors.background)};
  background: ${({ $busy }) => ($busy ? theme.colors.slateOverlayDark : theme.colors.accent)};
  border: 1px solid ${({ $busy }) => ($busy ? theme.colors.borderSlate : theme.colors.accent)};
  border-radius: ${theme.radius.sm};
  padding: 8px 12px;
  cursor: ${({ $busy }) => ($busy ? 'default' : 'pointer')};

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }
`;

const CloseButton = styled.button`
  all: unset;
  cursor: pointer;
  line-height: 1;
  font-size: 1rem;
  padding: 0 2px;
  color: ${theme.colors.label};

  &:hover {
    color: ${theme.colors.textSlate};
  }
`;

const Dot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex: none;
`;

const Panel = styled.div`
  width: 380px;
  max-width: 100%;
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.borderSlateStrong};
  background: ${theme.colors.codeBackgroundSlate};
  box-shadow: ${theme.colors.shadowSoft};
  backdrop-filter: blur(8px);
  overflow: hidden;
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px 8px 12px;
`;

const Hint = styled.p`
  margin: 0;
  padding: 10px 12px 0;
  font-size: 0.66rem;
  line-height: 1.5;
  color: ${theme.colors.label};
`;

const Actions = styled.div`
  padding: 10px 12px;
`;

const Phase = styled.span`
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.textSlate};
`;

const Counter = styled.span`
  font-size: 0.68rem;
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
`;

const Track = styled.div<{ $pct: number }>`
  height: 2px;
  background: ${theme.colors.slateOverlayDark};
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: ${({ $pct }) => $pct}%;
    background: ${theme.colors.accent};
    transition: width 0.3s ease;
  }
`;

const StepList = styled.ul`
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 280px;
  overflow-y: auto;
`;

const StepRow = styled.li<{ $active: boolean; $pending: boolean }>`
  display: grid;
  grid-template-columns: 7px 54px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 5px 12px;
  font-size: 0.7rem;
  opacity: ${({ $pending }) => ($pending ? 0.4 : 1)};

  ${({ $active }) =>
    $active &&
    css`
      background: ${theme.colors.accentHover};
    `}
`;

const StepLabel = styled.span`
  font-weight: 700;
  color: ${theme.colors.textSlate};
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StepDetail = styled.span`
  color: ${theme.colors.label};
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ElapsedSuffix = styled.span<{ $live: boolean }>`
  color: ${({ $live }) => ($live ? theme.colors.accent : theme.colors.label)};
`;

const Latency = styled.span<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-variant-numeric: tabular-nums;
  font-size: 0.66rem;
`;

const Footer = styled.div`
  padding: 7px 12px;
  border-top: 1px solid ${theme.colors.borderSlate};
  font-size: 0.64rem;
  color: ${theme.colors.label};
  display: flex;
  justify-content: space-between;
  gap: 8px;
`;

const Failure = styled.div`
  padding: 8px 12px;
  font-size: 0.66rem;
  color: ${theme.colors.danger};
  border-top: 1px solid ${theme.colors.borderSlate};
`;

// ---------- Sub-components ----------

/** `1d 1h · 12,004 bars · fetching 5-minute…` */
function describeFetches(step: SyncStep): string {
  if (step.stage === SyncStage.Options) return 'fetching options chain…';
  if (step.stage === SyncStage.Queued) return 'queued';

  if (step.fetches.length === 0) {
    return `fetching ${INTERVAL_LABEL[INTERVAL_ORDER[0]]}…`;
  }

  const intervals = step.fetches.map((f) => f.interval).join(' ');
  const bars = step.fetches.reduce((sum, f) => sum + f.bars, 0);
  const landed = `${intervals} · ${bars.toLocaleString()} bars`;

  if (step.stage !== SyncStage.Bars) return landed; // done/empty/failed — nothing more coming

  const landedSet = new Set(step.fetches.map((f) => f.interval));
  const next = INTERVAL_ORDER.find((i) => !landedSet.has(i));
  return next ? `${landed} · fetching ${INTERVAL_LABEL[next]}…` : landed;
}

/** Network time, which is what a slow sync is actually waiting on. */
function fetchMs(step: SyncStep): number | null {
  const live = step.fetches.filter((f) => !f.cached);
  if (live.length === 0) return null;
  return live.reduce((sum, f) => sum + f.ms, 0);
}

/** Finished duration once done, or a live clock off `startedAt` while active. */
function elapsedSeconds(step: SyncStep, active: boolean, now: number): string | null {
  if (step.ms !== null) return (step.ms / 1000).toFixed(1);
  if (active && step.startedAt)
    return ((now - new Date(step.startedAt).getTime()) / 1000).toFixed(1);
  return null;
}

function StepEntry({ step, active, now }: { step: SyncStep; active: boolean; now: number }) {
  const ms = fetchMs(step);
  const pending = step.stage === SyncStage.Queued;
  const allCached = step.fetches.length > 0 && ms === null;
  const row = useRef<HTMLLIElement>(null);

  // Twenty-three symbols do not fit in the panel, so the list follows the run
  // rather than making you scroll to find out where it got to.
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const detail = step.error ?? describeFetches(step);
  const elapsed = elapsedSeconds(step, active, now);
  const finished = step.ms !== null;

  return (
    <StepRow ref={row} $active={active} $pending={pending}>
      <Dot $color={STAGE_COLOR[step.stage]} />
      <StepLabel>{step.label}</StepLabel>
      <StepDetail
        title={`${detail}${elapsed ? ` (${elapsed}s${finished ? ' total' : ' so far'})` : ''}`}
      >
        {detail}
        {elapsed && <ElapsedSuffix $live={!finished}> · {elapsed}s</ElapsedSuffix>}
      </StepDetail>
      {ms !== null ? (
        <Latency $color={latencyColor(ms)}>{ms}ms</Latency>
      ) : allCached ? (
        <Latency $color={theme.colors.label}>cached</Latency>
      ) : (
        <span />
      )}
    </StepRow>
  );
}

// ---------- Component ----------

/**
 * Manual refresh, docked to the top-right corner.
 *
 * The toolbar button only opens and closes the panel — starting a sync takes a
 * second, deliberate click on the button inside, because the job runs for
 * minutes and hammers an upstream API that rate-limits. The panel opens by
 * itself when a run starts (including one started from another tab) so the
 * progress is never hidden, and can be closed at any time, mid-run included.
 */
export function SyncPanel() {
  const { job, running, starting, trigger } = useSync();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wasRunning = useRef(false);

  const busy = running || starting;
  const hasJob = job !== null && job.state !== SyncState.Idle;
  const failed = job?.state === SyncState.Failed;

  // Reveal the panel when a run begins that this component did not start.
  useEffect(() => {
    if (running && !wasRunning.current) setOpen(true);
    wasRunning.current = running;
  }, [running]);

  // Ticks the active symbol's elapsed-time readout faster than the ~900ms poll.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);

  const pct = job && job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  const elapsed = job ? (job.elapsedMs / 1000).toFixed(1) : '0.0';
  const phase = job?.phase ?? SyncPhase.Done;

  return (
    <Dock>
      <Toggle
        $busy={busy}
        $open={open}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={busy ? PHASE_HINT[phase] : 'Open sync'}
      >
        <Refresh busy={busy} />
        {busy && job ? `${pct}%` : 'Sync'}
      </Toggle>

      {open && (
        <Panel>
          <PanelHead>
            <Phase>{hasJob ? PHASE_LABEL[phase] : 'Sync'}</Phase>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {hasJob && (
                <Counter>
                  {job!.completed}/{job!.total} · {pct}%
                </Counter>
              )}
              <CloseButton type="button" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </CloseButton>
            </div>
          </PanelHead>

          {hasJob && <Track $pct={pct} />}

          {!hasJob && <Hint>{PHASE_HINT[SyncPhase.Done]}</Hint>}

          {hasJob && (
            <StepList>
              {job!.steps.map((step) => (
                <StepEntry
                  key={step.symbol}
                  step={step}
                  active={job!.current === step.symbol}
                  now={now}
                />
              ))}
            </StepList>
          )}

          {job?.error && <Failure>{job.error}</Failure>}

          <Actions>
            <RunButton
              $busy={busy}
              disabled={busy}
              onClick={() => void trigger()}
              title={PHASE_HINT[SyncPhase.Done]}
            >
              <Refresh busy={busy} />
              {busy ? 'Syncing…' : hasJob ? 'Sync again' : 'Start sync'}
            </RunButton>
          </Actions>

          {hasJob && (
            <Footer>
              <span>{elapsed}s elapsed</span>
              <span>{failed ? 'failed' : running ? 'running' : 'complete'}</span>
            </Footer>
          )}
        </Panel>
      )}
    </Dock>
  );
}
