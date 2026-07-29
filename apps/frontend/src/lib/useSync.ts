import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSyncStatus, startSync } from './api';
import { SyncState, type SyncJob } from '../types/sync';

/** Fast enough to feel live while a sync runs, without hammering the API. */
const ACTIVE_POLL_MS = 900;
/** A sync can be started from another tab, so keep checking even when idle. */
const IDLE_POLL_MS = 15_000;

/**
 * Tracks the server's sync job.
 *
 * The poll interval follows the job's own state rather than a fixed timer: a
 * run that takes minutes needs sub-second updates to be worth watching, and an
 * idle server does not need to be asked twice a second whether anything has
 * changed. Triggering a sync re-enters the loop immediately so the panel
 * switches to the fast cadence without waiting out the idle delay.
 */
export function useSync() {
  const [job, setJob] = useState<SyncJob | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poll = useRef<() => Promise<void>>(async () => {});

  const running = job?.state === SyncState.Running;

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      const next = await fetchSyncStatus();
      if (stopped) return;
      if (next) setJob(next);

      if (timer.current) clearTimeout(timer.current);
      const delay = next?.state === SyncState.Running ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      timer.current = setTimeout(() => void tick(), delay);
    };

    poll.current = tick;
    void tick();

    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const trigger = useCallback(async () => {
    if (running || starting) return;

    setStarting(true);
    try {
      const started = await startSync();
      if (started) setJob(started);
    } finally {
      setStarting(false);
    }

    await poll.current();
  }, [running, starting]);

  return { job, running, starting, trigger };
}
