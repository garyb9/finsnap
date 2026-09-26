export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff delay for retry attempt `attempt` (0-indexed). */
export function backoffMs(baseMs: number, attempt: number): number {
  return baseMs * 2 ** attempt;
}
