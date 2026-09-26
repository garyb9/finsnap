import { describe, expect, it } from 'vitest';
import { isDate, isIsoDate, parseIsoDate, toEpochMs } from '../lib/dates';

describe('isIsoDate', () => {
  it('accepts a real ISO calendar date', () => {
    expect(isIsoDate('2025-01-17')).toBe(true);
  });

  it('rejects non-ISO shapes', () => {
    expect(isIsoDate('01/17/2025')).toBe(false);
    expect(isIsoDate('2025-1-7')).toBe(false);
    expect(isIsoDate('not a date')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('rejects an ISO-shaped but impossible date', () => {
    expect(isIsoDate('2025-02-30')).toBe(false);
    expect(isIsoDate('2025-13-01')).toBe(false);
  });
});

describe('parseIsoDate', () => {
  it('parses to UTC midnight', () => {
    expect(parseIsoDate('2025-01-17')).toBe(Date.UTC(2025, 0, 17));
  });

  it('returns null for invalid input', () => {
    expect(parseIsoDate('17/01/2025')).toBeNull();
    expect(parseIsoDate('2025-02-30')).toBeNull();
  });
});

describe('toEpochMs', () => {
  it('reads ISO dates', () => {
    expect(toEpochMs('2025-01-17')).toBe(Date.UTC(2025, 0, 17));
  });

  it('reads US month-first slash dates', () => {
    expect(toEpochMs('1/17/2025')).toBe(Date.UTC(2025, 0, 17));
    expect(toEpochMs('01/17/2025')).toBe(Date.UTC(2025, 0, 17));
  });

  it('reads dashed numeric dates', () => {
    expect(toEpochMs('01-17-2025')).toBe(Date.UTC(2025, 0, 17));
  });

  it('reads long-form text dates', () => {
    expect(toEpochMs('January 17, 2025')).toBe(Date.UTC(2025, 0, 17));
  });

  it('rejects impossible month or day components', () => {
    expect(toEpochMs('13/17/2025')).toBeNull();
    expect(toEpochMs('01/32/2025')).toBeNull();
  });

  it('returns null for empty or junk input', () => {
    expect(toEpochMs('')).toBeNull();
    expect(toEpochMs('   ')).toBeNull();
    expect(toEpochMs('definitely not a date')).toBeNull();
  });
});

describe('isDate', () => {
  it('is true for anything the lenient parser accepts', () => {
    expect(isDate('2025-01-17')).toBe(true);
    expect(isDate('01/17/2025')).toBe(true);
    expect(isDate('January 17, 2025')).toBe(true);
  });

  it('is false for non-dates', () => {
    expect(isDate('not a date')).toBe(false);
    expect(isDate('')).toBe(false);
  });
});
