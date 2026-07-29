import { describe, it, expect } from 'vitest';
import { SyncTracker } from '../sync/tracker';
import { SyncPhase, SyncStage, SyncState } from '../sync/types';
import { BarInterval } from '../collectors/types';
import { AssetCategory, AssetClass } from '../constants/enums';
import type { AssetSpec } from '../config';

function spec(symbol: string): AssetSpec {
  return {
    symbol,
    label: symbol,
    name: symbol,
    shortName: symbol,
    assetClass: AssetClass.Equity,
    category: AssetCategory.EquityIndex,
    periodsPerYear: 252,
    hasOptions: false,
  };
}

const SPECS = [spec('SPY'), spec('QQQ')];

describe('SyncTracker', () => {
  it('reports nothing before the first run', () => {
    const tracker = new SyncTracker();

    expect(tracker.current).toBeNull();
    expect(tracker.isRunning).toBe(false);
  });

  it('queues one step per asset when a run begins', () => {
    const tracker = new SyncTracker();
    const job = tracker.begin(SPECS);

    expect(tracker.isRunning).toBe(true);
    expect(job.state).toBe(SyncState.Running);
    expect(job.phase).toBe(SyncPhase.Fetching);
    expect(job.total).toBe(2);
    expect(job.completed).toBe(0);
    expect(job.steps.map((s) => s.stage)).toEqual([SyncStage.Queued, SyncStage.Queued]);
  });

  it('tracks the symbol in flight and clears it on completion', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);

    tracker.beginSymbol('SPY');
    expect(tracker.current?.current).toBe('SPY');

    tracker.endSymbol('SPY', SyncStage.Done);
    expect(tracker.current?.current).toBeNull();
    expect(tracker.current?.completed).toBe(1);
  });

  it('accumulates fetch records against the right symbol', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);
    tracker.beginSymbol('SPY');

    tracker.recordFetch({
      symbol: 'SPY',
      interval: BarInterval.Daily,
      cached: false,
      bars: 8430,
      ms: 412,
      ok: true,
    });
    tracker.recordFetch({
      symbol: 'QQQ',
      interval: BarInterval.Daily,
      cached: true,
      bars: 6700,
      ms: 3,
      ok: true,
    });

    const [spy, qqq] = tracker.current!.steps;
    expect(spy.fetches).toHaveLength(1);
    expect(spy.fetches[0].bars).toBe(8430);
    expect(qqq.fetches[0].cached).toBe(true);
  });

  it('ignores events for a symbol that is not part of the run', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);

    // A stale listener from a previous job must not create phantom steps.
    tracker.beginSymbol('GLD');
    tracker.endSymbol('GLD', SyncStage.Done);

    expect(tracker.current!.steps).toHaveLength(2);
    expect(tracker.current!.completed).toBe(0);
  });

  it('records a per-symbol failure without ending the run', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);

    tracker.beginSymbol('SPY');
    tracker.endSymbol('SPY', SyncStage.Failed, 'rate limited');

    expect(tracker.isRunning).toBe(true);
    expect(tracker.current!.steps[0].stage).toBe(SyncStage.Failed);
    expect(tracker.current!.steps[0].error).toBe('rate limited');
  });

  it('times each symbol from its own start', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);

    tracker.beginSymbol('SPY');
    tracker.endSymbol('SPY', SyncStage.Done);

    expect(tracker.current!.steps[0].ms).toBeGreaterThanOrEqual(0);
    // Never started, so never timed.
    expect(tracker.current!.steps[1].ms).toBeNull();
  });

  it('finishes clean, and stops reporting as running', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);
    tracker.end();

    const job = tracker.current!;
    expect(tracker.isRunning).toBe(false);
    expect(job.state).toBe(SyncState.Done);
    expect(job.phase).toBe(SyncPhase.Done);
    expect(job.finishedAt).not.toBeNull();
    expect(job.error).toBeUndefined();
  });

  it('finishes failed when given an error', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);
    tracker.end('report build failed');

    expect(tracker.current!.state).toBe(SyncState.Failed);
    expect(tracker.current!.error).toBe('report build failed');
  });

  it('freezes elapsed time once the run is over', async () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);
    tracker.end();

    const first = tracker.current!.elapsedMs;
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(tracker.current!.elapsedMs).toBe(first);
  });

  it('starts a second run from a clean slate', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);
    tracker.beginSymbol('SPY');
    tracker.endSymbol('SPY', SyncStage.Done);
    tracker.end();

    const job = tracker.begin([spec('GLD')]);

    expect(job.total).toBe(1);
    expect(job.completed).toBe(0);
    expect(job.steps[0].symbol).toBe('GLD');
  });

  it('hands out copies, so a caller cannot mutate the live job', () => {
    const tracker = new SyncTracker();
    tracker.begin(SPECS);

    const snapshot = tracker.current!;
    snapshot.steps[0].stage = SyncStage.Failed;
    snapshot.steps[0].fetches.push({
      interval: BarInterval.Daily,
      cached: false,
      bars: 1,
      ms: 1,
      ok: true,
    });

    expect(tracker.current!.steps[0].stage).toBe(SyncStage.Queued);
    expect(tracker.current!.steps[0].fetches).toHaveLength(0);
  });
});
