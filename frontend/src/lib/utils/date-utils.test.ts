/**
 * Unit tests for date-utils branded types and conversion functions
 */

declare const process: { env: Record<string, string | undefined> };

import { describe, it, expect, afterEach } from 'vitest';
import {
  toCalendarDate,
  parseCalendarDate,
  today,
  toTimestamp,
  parseTimestamp,
  calendarDateToDate,
  timestampToDate,
} from './date-utils';
import { setClockForTesting, resetClock } from './clock';

afterEach(() => {
  resetClock();
});

describe('toCalendarDate', () => {
  it('formats a Date as YYYY-MM-DD using local date', () => {
    const date = new Date(2026, 3, 10); // April 10, 2026 local
    expect(toCalendarDate(date)).toBe('2026-04-10');
  });

  it('pads single-digit month and day', () => {
    const date = new Date(2026, 0, 5); // January 5, 2026 local
    expect(toCalendarDate(date)).toBe('2026-01-05');
  });

  it('uses local date methods, not UTC (timezone safety)', () => {
    const origTZ = process.env.TZ;
    try {
      // Force UTC+12: a UTC time of Apr 10 23:00 becomes Apr 11 11:00 locally
      process.env.TZ = 'Pacific/Auckland';
      const d = new Date('2026-04-10T23:00:00Z');
      // Verify the timezone shift took effect
      expect(d.getUTCDate()).toBe(10);
      expect(d.getDate()).toBe(11); // local date is April 11 in Auckland
      // toCalendarDate must return the LOCAL date, not UTC
      expect(toCalendarDate(d)).toBe('2026-04-11');
    } finally {
      process.env.TZ = origTZ;
    }
  });
});

describe('parseCalendarDate', () => {
  it('accepts a valid YYYY-MM-DD string', () => {
    expect(parseCalendarDate('2026-04-10')).toBe('2026-04-10');
  });

  it('accepts boundary month values', () => {
    expect(parseCalendarDate('2026-01-01')).toBe('2026-01-01');
    expect(parseCalendarDate('2026-12-31')).toBe('2026-12-31');
  });

  it('rejects empty string', () => {
    expect(() => parseCalendarDate('')).toThrow('Invalid CalendarDate');
  });

  it('rejects non-date string', () => {
    expect(() => parseCalendarDate('not-a-date')).toThrow('Invalid CalendarDate');
  });

  it('rejects invalid month', () => {
    expect(() => parseCalendarDate('2026-13-01')).toThrow('Invalid CalendarDate');
  });

  it('rejects month zero', () => {
    expect(() => parseCalendarDate('2026-00-01')).toThrow('Invalid CalendarDate');
  });

  it('rejects day zero', () => {
    expect(() => parseCalendarDate('2026-01-00')).toThrow('Invalid CalendarDate');
  });

  it('rejects day 32', () => {
    expect(() => parseCalendarDate('2026-01-32')).toThrow('Invalid CalendarDate');
  });

  it('rejects unpadded month and day', () => {
    expect(() => parseCalendarDate('2026-4-1')).toThrow('Invalid CalendarDate');
  });

  it('rejects a timestamp string', () => {
    expect(() => parseCalendarDate('2026-04-10T12:00:00Z')).toThrow('Invalid CalendarDate');
  });
});

describe('today', () => {
  it('returns the current date via getNow()', () => {
    setClockForTesting(() => new Date(2026, 3, 10, 14, 30, 0));
    expect(today()).toBe('2026-04-10');
  });

  it('reflects changes to the injected clock', () => {
    setClockForTesting(() => new Date(2025, 11, 25));
    expect(today()).toBe('2025-12-25');

    setClockForTesting(() => new Date(2030, 0, 1));
    expect(today()).toBe('2030-01-01');
  });
});

describe('calendarDateToDate', () => {
  it('produces a Date at local midnight', () => {
    const cd = parseCalendarDate('2026-04-10');
    const date = calendarDateToDate(cd);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3); // April is 0-indexed month 3
    expect(date.getDate()).toBe(10);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it('round-trips with toCalendarDate', () => {
    const original = parseCalendarDate('2026-12-31');
    const roundTripped = toCalendarDate(calendarDateToDate(original));
    expect(roundTripped).toBe('2026-12-31');
  });

  it('round-trips a leap day', () => {
    const leapDay = parseCalendarDate('2024-02-29');
    const roundTripped = toCalendarDate(calendarDateToDate(leapDay));
    expect(roundTripped).toBe('2024-02-29');
  });
});

describe('toTimestamp', () => {
  it('produces an ISO 8601 string', () => {
    const date = new Date('2026-04-10T14:30:00Z');
    const ts = toTimestamp(date);
    expect(ts).toBe('2026-04-10T14:30:00.000Z');
  });

  it('includes milliseconds', () => {
    const date = new Date('2026-04-10T14:30:00.123Z');
    const ts = toTimestamp(date);
    expect(ts).toContain('.123Z');
  });
});

describe('parseTimestamp', () => {
  it('accepts a full ISO 8601 string with Z', () => {
    expect(parseTimestamp('2026-04-10T14:30:00Z')).toBe('2026-04-10T14:30:00Z');
  });

  it('accepts a timestamp with milliseconds', () => {
    expect(parseTimestamp('2026-04-10T14:30:00.000Z')).toBe('2026-04-10T14:30:00.000Z');
  });

  it('accepts a timestamp with timezone offset', () => {
    expect(parseTimestamp('2026-04-10T14:30:00+02:00')).toBe('2026-04-10T14:30:00+02:00');
  });

  it('accepts a timestamp without Z or offset', () => {
    expect(parseTimestamp('2026-04-10T14:30:00')).toBe('2026-04-10T14:30:00');
  });

  it('rejects empty string', () => {
    expect(() => parseTimestamp('')).toThrow('Invalid Timestamp');
  });

  it('rejects a plain date string', () => {
    expect(() => parseTimestamp('2026-04-10')).toThrow('Invalid Timestamp');
  });

  it('rejects non-date string', () => {
    expect(() => parseTimestamp('not-a-timestamp')).toThrow('Invalid Timestamp');
  });
});

describe('timestampToDate', () => {
  it('parses a UTC timestamp correctly', () => {
    const ts = parseTimestamp('2026-04-10T14:30:00.000Z');
    const date = timestampToDate(ts);
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(3);
    expect(date.getUTCDate()).toBe(10);
    expect(date.getUTCHours()).toBe(14);
    expect(date.getUTCMinutes()).toBe(30);
  });

  it('round-trips with toTimestamp', () => {
    const original = new Date('2026-04-10T14:30:00.000Z');
    const roundTripped = timestampToDate(toTimestamp(original));
    expect(roundTripped.getTime()).toBe(original.getTime());
  });
});

describe('timezone edge case', () => {
  const origTZ = process.env.TZ;
  afterEach(() => { process.env.TZ = origTZ; });

  it('toCalendarDate returns local date, not UTC date, when they differ', () => {
    // Force UTC-11: a UTC time of Apr 11 01:00 is still Apr 10 14:00 locally
    process.env.TZ = 'Pacific/Pago_Pago';
    const d = new Date('2026-04-11T01:00:00Z');
    expect(d.getUTCDate()).toBe(11);
    expect(d.getDate()).toBe(10); // local date is April 10 in Pago Pago
    expect(toCalendarDate(d)).toBe('2026-04-10');
  });

  it('calendarDateToDate produces local midnight, not UTC midnight', () => {
    process.env.TZ = 'Asia/Tokyo'; // UTC+9
    const cd = parseCalendarDate('2026-04-10');
    const date = calendarDateToDate(cd);
    // Local midnight in Tokyo
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    // UTC should be 15:00 on April 9 (midnight JST = 15:00 UTC previous day)
    expect(date.getUTCDate()).toBe(9);
    expect(date.getUTCHours()).toBe(15);
  });

  it('round-trip is stable across timezone with large offset', () => {
    process.env.TZ = 'Pacific/Auckland'; // UTC+12
    const cd = parseCalendarDate('2026-01-15');
    const roundTripped = toCalendarDate(calendarDateToDate(cd));
    expect(roundTripped).toBe('2026-01-15');
  });
});
