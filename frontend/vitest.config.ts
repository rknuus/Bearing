import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      // Disable vitePreprocess for tests to avoid CSS preprocessing issues.
      // HMR is automatically off in VITEST runs; the old `hot` option was
      // removed in @sveltejs/vite-plugin-svelte v7 and is no longer valid.
      configFile: false
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['src/lib/wails/**', 'node_modules/**'],
    passWithNoTests: true
  },
  resolve: {
    conditions: ['browser']
  }
});
