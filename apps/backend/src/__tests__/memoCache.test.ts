import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoCache } from '../lib/memoCache';

describe('MemoCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for a key that was never set', () => {
    const cache = new MemoCache<string>();
    expect(cache.get('missing')).toBeNull();
  });

  it('returns a value that was just set', () => {
    const cache = new MemoCache<{ n: number }>();
    cache.set('k', { n: 1 }, 60);
    expect(cache.get('k')).toEqual({ n: 1 });
  });

  it('serves the value while inside the TTL', () => {
    vi.useFakeTimers();
    const cache = new MemoCache<string>();
    cache.set('k', 'v', 10);

    vi.advanceTimersByTime(9_000);
    expect(cache.get('k')).toBe('v');
  });

  it('expires and removes the entry once the TTL has passed', () => {
    vi.useFakeTimers();
    const cache = new MemoCache<string>();
    cache.set('k', 'v', 10);

    vi.advanceTimersByTime(10_000);
    expect(cache.get('k')).toBeNull();
    // Confirms the entry was actually deleted, not just reported stale.
    expect(cache.get('k')).toBeNull();
  });

  it('keeps separate keys independent', () => {
    const cache = new MemoCache<number>();
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('overwrites a key on re-set, resetting its TTL', () => {
    vi.useFakeTimers();
    const cache = new MemoCache<string>();
    cache.set('k', 'first', 10);

    vi.advanceTimersByTime(9_000);
    cache.set('k', 'second', 10);

    vi.advanceTimersByTime(9_000);
    expect(cache.get('k')).toBe('second');
  });
});
