/**
 * Branded Date Types and Conversion Utilities
 *
 * Provides branded types (CalendarDate, Timestamp) that enforce type-safe date
 * handling at compile time. All conversions between Date objects and string
 * representations go through these functions, ensuring timezone-safe behavior.
 *
 * CalendarDate represents a date without time (YYYY-MM-DD), always in local timezone.
 * Timestamp represents a precise moment in time (ISO 8601 / RFC 3339).
 */

import { getNow } from './clock';

// Branded types — the internal representation
export type CalendarDate = string & { readonly __brand: 'CalendarDate' };
export type Timestamp = string & { readonly __brand: 'Timestamp' };

// Regex for YYYY-MM-DD validation
const CALENDAR_DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/; // loose — accepts with or without Z/offset

/**
 * Converts a Date to a CalendarDate using local date methods.
 * Timezone-safe: uses getFullYear/getMonth/getDate, NOT toISOString().
 */
export function toCalendarDate(date: Date): CalendarDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` as CalendarDate;
}

/**
 * Parses a YYYY-MM-DD string into a CalendarDate.
 * Throws if the format is invalid.
 */
export function parseCalendarDate(s: string): CalendarDate {
  if (!CALENDAR_DATE_RE.test(s)) throw new Error(`Invalid CalendarDate: "${s}"`);
  return s as CalendarDate;
}

/**
 * Returns today's date as a CalendarDate, using the injectable clock.
 */
export function today(): CalendarDate {
  return toCalendarDate(getNow());
}

/**
 * Converts a Date to a Timestamp (ISO 8601 string).
 */
export function toTimestamp(date: Date): Timestamp {
  return date.toISOString() as Timestamp;
}

/**
 * Parses an ISO 8601 / RFC 3339 string into a Timestamp.
 * Throws if the format is invalid.
 */
export function parseTimestamp(s: string): Timestamp {
  if (!TIMESTAMP_RE.test(s)) throw new Error(`Invalid Timestamp: "${s}"`);
  return s as Timestamp;
}

/**
 * Converts a CalendarDate back to a Date at local midnight.
 * Uses the Date(year, month, day) constructor to avoid UTC offset issues.
 */
export function calendarDateToDate(d: CalendarDate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

/**
 * Converts a Timestamp back to a Date.
 */
export function timestampToDate(ts: Timestamp): Date {
  return new Date(ts);
}
