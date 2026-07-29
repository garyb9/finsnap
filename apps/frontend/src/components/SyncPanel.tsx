import { useEffect, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import { spin } from '../styles/keyframes';
import { theme } from '../styles/theme';
import { useSync } from '../lib/useSync';
import { SyncPhase, SyncStage, SyncState, type SyncStep } from '../types/sync';

const PHASE_LABEL: Record<SyncPhase, string> = {
  [SyncPhase.Fetching]: 'Fetching market data',
  [SyncPhase.Snapshot]: 'Rebuilding snapshot',
  [SyncPhase.Report]: 'Running backtests',
  [SyncPhase.Done]: 'Done',
};

const STAGE_COLOR: Record<SyncStage, string> = {
  [SyncStage.Queued]: theme.colors.label,
  [SyncStage.Bars]: theme.colors.accent,
  [SyncStage.Options]: theme.colors.accent,
  [SyncStage.Done]: theme.colors.success,
  [SyncStage.Empty]: theme.colors.warning,
  [SyncStage.Failed]: theme.colors.danger,
};

/**
 * How long a finished panel lingers before folding itself away.
 *
 * The panel floats over the report, so leaving it up indefinitely would hide
 * the thing the sync was run to refresh. Long enough to read the summary, short
 * enough to get out of the way on its own.
 */
const AUTO_DISMISS_MS = 6000;

/** Latency bands, so a slow symbol is visible without reading the number. */
function latencyColor(ms: number): string {
  if (ms < 400) return theme.colors.success;
  if (ms < 1500) return theme.colors.warning;
  return theme.colors.danger;
}

// ---------- Styled ----------

const Dock = styled.div`
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: min(360px, calc(100vw - 32px));

  @media (max-width: ${theme.breakpoints.md}) {
    top: 8px;
    right: 8px;
  }
`;

const Button = styled.button<{ $busy: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $busy }) => ($busy ? theme.colors.accent : theme.colors.textSlate)};
  background: ${theme.colors.slateOverlayMuted};
  border: 1px solid ${({ $busy }) => ($busy ? theme.colors.accent : theme.colors.borderSlateMuted)};
  border-radius: ${theme.radius.pill};
  padding: 7px 14px;
  cursor: ${({ $busy }) => ($busy ? 'default' : 'pointer')};
  backdrop-filter: blur(6px);
  transition:
    border-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${theme.colors.accent};
    color: ${theme.colors.accent};
  }
`;

const Spinner = styled.span`
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid ${theme.colors.accentSoft};
  border-top-color: ${theme.colors.accent};
  animation: ${spin} 0.7s linear infinite;
`;

const Dot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex: none;
`;

const Panel = styled.div`
  width: 340px;
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
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px 8px;
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
  max-height: 240px;
  overflow-y: auto;
`;

const StepRow = styled.li<{ $active: boolean; $pending: boolean }>`
  display: grid;
  grid-template-columns: 7px 52px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 4px 12px;
  font-size: 0.68rem;
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

/**
 * `1d 1h 5m · 18,200 bars` — which intervals have landed and what they held.
 *
 * Listing the intervals as they arrive is what makes the row answer "what is it
 * fetching right now" rather than just "it is busy": a symbol showing `1d` has
 * two more requests to go.
 */
function describeFetches(step: SyncStep): string {
  if (step.stage === SyncStage.Options) return 'options chain…';
  if (step.fetches.length === 0) return step.stage === SyncStage.Queued ? 'queued' : 'connecting…';

  const intervals = step.fetches.map((f) => f.interval).join(' ');
  const bars = step.fetches.reduce((sum, f) => sum + f.bars, 0);
  return `${intervals} · ${bars.toLocaleString()} bars`;
}

/** Network time, which is what a slow sync is actually waiting on. */
function fetchMs(step: SyncStep): number | null {
  const live = step.fetches.filter((f) => !f.cached);
  if (live.length === 0) return null;
  return live.reduce((sum, f) => sum + f.ms, 0);
}

function StepEntry({ step, active }: { step: SyncStep; active: boolean }) {
  const ms = fetchMs(step);
  const pending = step.stage === SyncStage.Queued;
  const allCached = step.fetches.length > 0 && ms === null;
  const row = useRef<HTMLLIElement>(null);

  // Twenty-three symbols do not fit in the panel, so the list follows the run
  // rather than making you scroll to find out where it got to.
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <StepRow ref={row} $active={active} $pending={pending}>
      <Dot $color={STAGE_COLOR[step.stage]} />
      <StepLabel>{step.label}</StepLabel>
      <StepDetail title={step.error}>{step.error ?? describeFetches(step)}</StepDetail>
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
 * Collapses to a single button when nothing is happening; while a sync runs it
 * shows which symbol is being pulled, what came back and how long the network
 * took. The panel stays open after a run so the latencies can be read — the
 * whole point of showing them is the moment you notice one symbol is slow.
 */
export function SyncPanel() {
  const { job, running, starting, trigger } = useSync();
  const [dismissed, setDismissed] = useState(false);

  const hasJob = job !== null && job.state !== SyncState.Idle;
  const open = running || (hasJob && !dismissed);
  const failed = job?.state === SyncState.Failed;

  // Fold away on success; a failure stays up, because that is the one outcome
  // worth reading after the fact.
  useEffect(() => {
    if (running || !hasJob || failed) return;
    const timer = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [running, hasJob, failed, job?.id]);

  const pct = job && job.total > 0 ? (job.completed / job.total) * 100 : 0;

  const busy = running || starting;
  const elapsed = job ? (job.elapsedMs / 1000).toFixed(1) : '0.0';

  return (
    <Dock>
      <Button
        $busy={busy}
        disabled={busy}
        onClick={() => {
          setDismissed(false);
          void trigger();
        }}
        title="Refresh every asset, then rebuild the snapshot and the daily report"
      >
        {busy ? <Spinner /> : <Dot $color={theme.colors.success} />}
        {busy ? 'Syncing' : 'Sync'}
      </Button>

      {open && job && (
        <Panel>
          <PanelHead>
            <Phase>{PHASE_LABEL[job.phase]}</Phase>
            <Counter>
              {job.completed}/{job.total}
            </Counter>
          </PanelHead>

          <Track $pct={pct} />

          <StepList>
            {job.steps.map((step) => (
              <StepEntry key={step.symbol} step={step} active={job.current === step.symbol} />
            ))}
          </StepList>

          {job.error && <Failure>{job.error}</Failure>}

          <Footer>
            <span>{elapsed}s elapsed</span>
            {!running && (
              <button
                type="button"
                onClick={() => setDismissed(true)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  color: theme.colors.accent,
                }}
              >
                dismiss
              </button>
            )}
          </Footer>
        </Panel>
      )}
    </Dock>
  );
}
