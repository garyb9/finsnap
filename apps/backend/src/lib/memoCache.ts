/** In-process TTL cache — the backend is one persistent process, so no need for Redis here. */
export class MemoCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlSeconds: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}
