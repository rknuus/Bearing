/**
 * Unit tests for date-format utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initLocale,
  formatDate,
  formatMonthName,
  formatShortMonthName,
  formatWeekdayShort,
} from './date-format';

describe('date-format canonical formatter — locale matrix', () => {
  // 2026-05-01 is a Friday.
  // Canonical options: { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }
  // Intl punctuation/spacing varies slightly across Node ICU versions; assert
  // language-rendered tokens with `toContain` rather than pinning the exact string.

  it('renders Fri / May / 01 / 2026 tokens for en-CH', () => {
    initLocale('en-CH');
    const result = formatDate('2026-05-01');
    expect(result).toContain('Fri');
    expect(result).toContain('May');
    expect(result).toContain('01');
    expect(result).toContain('2026');
  });

  it('renders Fr. / Mai / 01 / 2026 tokens for de-CH', () => {
    initLocale('de-CH');
    const result = formatDate('2026-05-01');
    // de-CH abbreviates Friday as "Fr." and May as "Mai"
    expect(result).toMatch(/Fr\.?/);
    expect(result).toContain('Mai');
    expect(result).toContain('01');
    expect(result).toContain('2026');
  });

  it('renders Fri / May / 01 / 2026 tokens for en-US', () => {
    initLocale('en-US');
    const result = formatDate('2026-05-01');
    expect(result).toContain('Fri');
    expect(result).toContain('May');
    expect(result).toContain('01');
    expect(result).toContain('2026');
  });
});

describe('date-format with de-CH locale', () => {
  beforeEach(() => {
    initLocale('de-CH');
  });

  it('formatDate renders weekday + month tokens for de-CH', () => {
    // 2025-01-15 is a Wednesday = Mittwoch (abbreviated "Mi.") in German
    const result = formatDate('2025-01-15');
    expect(result).toMatch(/Mi\.?/);
    // Canonical formatter uses month: 'short' → "Jan." or similar in de-CH
    expect(result).toMatch(/Jan/);
    expect(result).toContain('2025');
  });

  it('formatMonthName returns full German month name', () => {
    expect(formatMonthName(0)).toBe('Januar');
  });

  it('formatShortMonthName returns abbreviated German month name', () => {
    const result = formatShortMonthName(0);
    // de-CH abbreviation for January: "Jan." or "Jan"
    expect(result).toMatch(/^Jan/);
  });

  it('formatWeekdayShort returns Monday abbreviation for dayIndex 0', () => {
    const result = formatWeekdayShort(0);
    // de-CH abbreviation for Monday: "Mo" or "Mo."
    expect(result).toMatch(/^Mo/);
  });

  it('formatWeekdayShort returns Sunday abbreviation for dayIndex 6', () => {
    const result = formatWeekdayShort(6);
    // de-CH abbreviation for Sunday: "So" or "So."
    expect(result).toMatch(/^So/);
  });
});

describe('date-format fallback to en-US', () => {
  it('does not throw when formatting after re-init with en-US', () => {
    initLocale('en-US');
    expect(() => formatDate('2025-06-30')).not.toThrow();
    expect(() => formatMonthName(5)).not.toThrow();
    expect(() => formatShortMonthName(5)).not.toThrow();
    expect(() => formatWeekdayShort(3)).not.toThrow();
  });

  it('produces output containing all canonical tokens for en-US', () => {
    initLocale('en-US');
    const result = formatDate('2025-01-15');
    // 2025-01-15 is a Wednesday
    expect(result).toContain('Wed');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });
});
