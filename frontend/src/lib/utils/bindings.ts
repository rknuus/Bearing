import { mockAppBindings, mockRuntimeBindings } from '../wails-mock';

/**
 * Get Wails app bindings, falling back to mock bindings for browser testing.
 */
export function getBindings() {
  return window.go?.main?.App ?? mockAppBindings;
}

/**
 * Extract error message from a caught value.
 * Wails rejects with a plain string; mock/JS throws Error objects.
 */
export function extractError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}

/**
 * Open a URL in the user's default browser.
 * Uses Wails BrowserOpenURL in native mode, falls back to window.open in browser dev mode.
 */
export function openExternalLink(url: string): void {
  const rt = window.runtime ?? mockRuntimeBindings;
  rt.BrowserOpenURL(url);
}
