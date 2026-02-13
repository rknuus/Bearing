/**
 * Locale-Aware Date Formatting
 *
 * Provides date formatting functions using cached Intl.DateTimeFormat instances.
 * Call initLocale() once to set the locale; functions fall back to 'en-US' if not called.
 */

const FALLBACK_LOCALE = 'en-US';

let currentLocale: string = FALLBACK_LOCALE;
let shortDateFmt: Intl.DateTimeFormat;
let longDateFmt: Intl.DateTimeFormat;
let monthLongFmt: Intl.DateTimeFormat;
let monthShortFmt: Intl.DateTimeFormat;
let weekdayShortFmt: Intl.DateTimeFormat;

function createFormatters(locale: string): void {
  shortDateFmt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  longDateFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  monthLongFmt = new Intl.DateTimeFormat(locale, { month: 'long' });
  monthShortFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  weekdayShortFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
}

// Initialize with fallback locale
createFormatters(FALLBACK_LOCALE);

/**
 * Sets the locale and creates cached Intl.DateTimeFormat instances.
 */
export function initLocale(locale: string): void {
  currentLocale = locale;
  createFormatters(currentLocale);
}

/**
 * Parses an ISO date string (e.g. "2025-01-15") into a local Date,
 * avoiding UTC-midnight timezone shifts.
 */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Formats an ISO date string as a short date (e.g. "15.01.2025" for de-CH).
 */
export function formatDate(iso: string): string {
  return shortDateFmt.format(parseIsoDate(iso));
}

/**
 * Formats an ISO date string as a long date with weekday
 * (e.g. "Mittwoch, 15. Januar 2025" for de-CH).
 */
export function formatDateLong(iso: string): string {
  return longDateFmt.format(parseIsoDate(iso));
}

/**
 * Returns the full locale month name for a 0-based month index (0=January).
 */
export function formatMonthName(monthIndex: number): string {
  return monthLongFmt.format(new Date(2000, monthIndex, 1));
}

/**
 * Returns the abbreviated locale month name for a 0-based month index (0=Jan).
 */
export function formatShortMonthName(monthIndex: number): string {
  return monthShortFmt.format(new Date(2000, monthIndex, 1));
}

/**
 * Returns the abbreviated locale weekday name for a 0-based day index
 * (0=Monday, matching CalendarView's Mon-Sun convention).
 */
export function formatWeekdayShort(dayIndex: number): string {
  // 2024-01-01 is a Monday; add dayIndex days to get the target weekday
  return weekdayShortFmt.format(new Date(2024, 0, 1 + dayIndex));
}
