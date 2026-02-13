import { mockAppBindings } from '../wails-mock';

/**
 * Get Wails app bindings, falling back to mock bindings for browser testing.
 */
export function getBindings() {
  return window.go?.main?.App ?? mockAppBindings;
}
