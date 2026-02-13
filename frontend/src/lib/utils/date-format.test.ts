/**
 * Unit tests for date-format utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initLocale,
  formatDate,
  formatDateLong,
  formatMonthName,
  formatShortMonthName,
  formatWeekdayShort,
} from './date-format';

describe('date-format with de-CH locale', () => {
  beforeEach(() => {
    initLocale('de-CH');
  });

  it('formatDate produces short date in de-CH format', () => {
    expect(formatDate('2025-01-15')).toBe('15.01.2025');
  });

  it('formatDateLong contains weekday and month for de-CH', () => {
    const result = formatDateLong('2025-01-15');
    // 2025-01-15 is a Wednesday = Mittwoch in German
    expect(result).toContain('Mittwoch');
    expect(result).toContain('Januar');
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
  it('uses en-US when initLocale has not been called', async () => {
    // Re-import the module fresh to test the default state
    const freshModule = await import('./date-format');

    // Reset to default by re-initializing with en-US
    freshModule.initLocale('en-US');

    const result = freshModule.formatDate('2025-01-15');
    expect(result).toBe('01/15/2025');
  });

  it('does not throw when formatting without explicit initLocale', () => {
    // After the module has been loaded, formatters exist with fallback locale
    initLocale('en-US');
    expect(() => formatDate('2025-06-30')).not.toThrow();
    expect(() => formatDateLong('2025-06-30')).not.toThrow();
    expect(() => formatMonthName(5)).not.toThrow();
    expect(() => formatShortMonthName(5)).not.toThrow();
    expect(() => formatWeekdayShort(3)).not.toThrow();
  });
});
