// Vitest setup file
import { beforeEach, afterEach, expect } from 'vitest';

// Polyfill for HTMLDialogElement since jsdom doesn't fully support it
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function(this: HTMLDialogElement): void {
    this.setAttribute('open', '');
    this.open = true;
  };

  HTMLDialogElement.prototype.close = function(this: HTMLDialogElement): void {
    this.removeAttribute('open');
    this.open = false;
  };
}

// ---------------------------------------------------------------------------
// Global error detection: fail any test that produces unexpected errors.
//
// - console.error: wrapper records calls; checked in afterEach
// - console.warn [state-check]: wrapper records matching calls; checked in afterEach
// - window.onerror / window.onunhandledrejection: collector array; checked in afterEach
//
// Opt-out: a test that installs its own spy via vi.spyOn(console, 'error').mockImplementation(...)
// replaces our wrapper, so calls bypass our recording and are not flagged.
// ---------------------------------------------------------------------------

let unexpectedErrors: string[] = [];
let unexpectedStateCheckWarnings: string[] = [];
let uncaughtErrors: string[] = [];

let errorWrapper: ((...args: unknown[]) => void) | undefined;
let warnWrapper: ((...args: unknown[]) => void) | undefined;
let originalConsoleError: typeof console.error;
let originalConsoleWarn: typeof console.warn;
let originalOnError: typeof window.onerror;
let originalOnUnhandledRejection: typeof window.onunhandledrejection;

beforeEach(() => {
  unexpectedErrors = [];
  unexpectedStateCheckWarnings = [];
  uncaughtErrors = [];

  // console.error wrapper: records calls and passes through
  originalConsoleError = console.error;
  errorWrapper = (...args: unknown[]) => {
    unexpectedErrors.push(args.map(String).join(' '));
    originalConsoleError.apply(console, args);
  };
  console.error = errorWrapper;

  // console.warn wrapper: records [state-check] calls and passes through
  originalConsoleWarn = console.warn;
  warnWrapper = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (msg.includes('[state-check]')) {
      unexpectedStateCheckWarnings.push(msg);
    }
    originalConsoleWarn.apply(console, args);
  };
  console.warn = warnWrapper;

  // window.onerror / onunhandledrejection: collect into array
  originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno) => {
    uncaughtErrors.push(`Uncaught exception: ${String(message)} (${source}:${lineno}:${colno})`);
  };
  originalOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    uncaughtErrors.push(`Unhandled rejection: ${String(event.reason)}`);
  };
});

afterEach(() => {
  const errors: string[] = [];

  // Check console.error only if our wrapper is still installed (not replaced by a test spy)
  if (console.error === errorWrapper && unexpectedErrors.length > 0) {
    errors.push(...unexpectedErrors.map(e => `[console.error] ${e}`));
  }
  console.error = originalConsoleError;

  // Check console.warn [state-check] only if our wrapper is still installed
  if (console.warn === warnWrapper && unexpectedStateCheckWarnings.length > 0) {
    errors.push(...unexpectedStateCheckWarnings.map(w => `[state-check warning] ${w}`));
  }
  console.warn = originalConsoleWarn;

  // Check uncaught errors / unhandled rejections
  if (uncaughtErrors.length > 0) {
    errors.push(...uncaughtErrors);
  }
  window.onerror = originalOnError;
  window.onunhandledrejection = originalOnUnhandledRejection;

  // Fail the test if any unexpected errors were detected
  expect(errors, 'Unexpected errors detected during test').toEqual([]);
});
