import { ulid } from 'ulid';
import type { AssetSpec } from '../config';
import type { BarFetchEvent } from '../collectors/bars';
import { SyncPhase, SyncStage, SyncState, type SyncJob, type SyncStep } from './types';

/**
 * Live progress for a manual sync.
 *
 * Deliberately in-memory and single-slot: it exists so a person watching the
 * dashboard can see which symbol is being fetched and how long it took. It is
 * not a job queue, it does not survive a restart, and nothing downstream reads
 * it — the report is built the same way whether anyone is watching or not.
 *
 * The tracker never throws. A progress reporter that can break the thing it is
 * reporting on is worse than no progress reporter.
 */
export class SyncTracker {
  private job: SyncJob | null = null;
  private stepsBySymbol = new Map<string, SyncStep>();
  private symbolStartedAt = new Map<string, number>();

  get isRunning(): boolean {
    return this.job?.state === SyncState.Running;
  }

  /** The current run, or the last finished one. Null before the first sync. */
  get current(): SyncJob | null {
    if (!this.job) return null;
    return {
      ...this.job,
      elapsedMs: this.elapsed(),
      steps: this.job.steps.map((s) => ({ ...s, fetches: [...s.fetches] })),
    };
  }

  begin(specs: AssetSpec[]): SyncJob {
    this.stepsBySymbol.clear();
    this.symbolStartedAt.clear();

    const steps: SyncStep[] = specs.map((spec) => ({
      symbol: spec.symbol,
      label: spec.label,
      stage: SyncStage.Queued,
      fetches: [],
      startedAt: null,
      ms: null,
    }));
    for (const step of steps) this.stepsBySymbol.set(step.symbol, step);

    this.job = {
      id: ulid(),
      state: SyncState.Running,
      phase: SyncPhase.Fetching,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      elapsedMs: 0,
      current: null,
      completed: 0,
      total: steps.length,
      steps,
    };

    return this.current!;
  }

  beginSymbol(symbol: string): void {
    const step = this.stepsBySymbol.get(symbol);
    if (!step || !this.job) return;
    step.stage = SyncStage.Bars;
    step.startedAt = new Date().toISOString();
    this.job.current = symbol;
    this.symbolStartedAt.set(symbol, Date.now());
  }

  stage(symbol: string, stage: SyncStage): void {
    const step = this.stepsBySymbol.get(symbol);
    if (step) step.stage = stage;
  }

  /** Called by the bar collector for every interval it resolves. */
  recordFetch(event: BarFetchEvent): void {
    const step = this.stepsBySymbol.get(event.symbol);
    if (!step) return;
    step.fetches.push({
      interval: event.interval,
      cached: event.cached,
      bars: event.bars,
      ms: event.ms,
      ok: event.ok,
    });
  }

  endSymbol(symbol: string, stage: SyncStage, error?: string): void {
    const step = this.stepsBySymbol.get(symbol);
    if (!step || !this.job) return;

    const startedAt = this.symbolStartedAt.get(symbol);
    step.ms = startedAt ? Date.now() - startedAt : null;
    step.stage = stage;
    if (error) step.error = error;

    this.job.completed += 1;
    if (this.job.current === symbol) this.job.current = null;
  }

  phase(phase: SyncPhase): void {
    if (this.job) this.job.phase = phase;
  }

  end(error?: string): void {
    if (!this.job) return;
    this.job.state = error ? SyncState.Failed : SyncState.Done;
    this.job.phase = SyncPhase.Done;
    this.job.finishedAt = new Date().toISOString();
    this.job.elapsedMs = this.elapsed();
    this.job.current = null;
    if (error) this.job.error = error;
  }

  private elapsed(): number {
    if (!this.job) return 0;
    const end = this.job.finishedAt ? new Date(this.job.finishedAt).getTime() : Date.now();
    return end - new Date(this.job.startedAt).getTime();
  }
}
