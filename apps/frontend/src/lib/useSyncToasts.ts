import { useEffect, useRef } from 'react';
import { useFinSnapData } from './dataContext';
import { useToast } from '../components/Toast';
import { SyncState } from '../types/sync';

/** Fires a toast when a background sync finishes, so the sync panel doesn't have to stay open to find out. */
export function useSyncToasts() {
  const { syncJob } = useFinSnapData();
  const { show } = useToast();
  const wasRunning = useRef(false);

  useEffect(() => {
    const running = syncJob?.state === SyncState.Running;
    if (wasRunning.current && !running && syncJob) {
      if (syncJob.state === SyncState.Failed) {
        show('error', 'Sync failed', syncJob.error);
      } else {
        show('success', 'Sync complete', `${syncJob.completed}/${syncJob.total} symbols refreshed`);
      }
    }
    wasRunning.current = running;
  }, [syncJob, show]);
}
