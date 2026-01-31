/**
 * Mock Wails Runtime for Browser-Based Testing
 *
 * This mock provides browser-compatible implementations of Wails bindings
 * for development and Playwright E2E tests running against Vite dev server.
 *
 * Wails v2 bindings are ONLY available in native WebView via IPC,
 * NOT via HTTP. This mock enables browser-based testing.
 */

// Type declarations for extended Window properties
interface MockConfig {
  // Add mock configuration options as needed
}

interface WailsGoBindings {
  main?: {
    App?: typeof mockAppBindings;
  };
}

declare global {
  interface Window {
    __E2E_MOCK_CONFIG__?: MockConfig;
    go?: WailsGoBindings;
    runtime?: typeof mockRuntimeBindings;
  }
}

// Check if we're running in Wails (has window.go)
export const isWailsRuntime = (): boolean => {
  return typeof window !== 'undefined' &&
         !!window.go &&
         !!window.go.main &&
         !!window.go.main.App;
};

// Mock App bindings
export const mockAppBindings = {
  Greet: async (name: string): Promise<string> => {
    return `Hello ${name}, Welcome to Bearing!`;
  },
};

// Mock runtime bindings
export const mockRuntimeBindings = {
  WindowSetTitle: async (title: string): Promise<void> => {
    if (typeof document !== 'undefined') {
      document.title = title;
    }
  },

  Quit: (): void => {
    if (typeof window !== 'undefined') {
      window.close();
    }
  },
};

/**
 * Initialize mock bindings if not in Wails runtime
 * Call this early in your app initialization
 */
export const initMockBindings = (): boolean => {
  if (isWailsRuntime()) {
    // Already in Wails, no mocking needed
    return false;
  }

  // Create mock window.go structure
  if (typeof window !== 'undefined') {
    window.go = window.go || {};
    window.go.main = window.go.main || {};
    window.go.main.App = mockAppBindings;

    // Create mock window.runtime
    window.runtime = mockRuntimeBindings;

    console.warn('[Wails Mock] Running in browser mode with mock bindings');
    return true;
  }

  return false;
};

/**
 * Helper to configure mock responses (for E2E tests)
 */
export const configureMock = (config: MockConfig): void => {
  if (typeof window !== 'undefined') {
    window.__E2E_MOCK_CONFIG__ = config;
  }
};
