import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      hot: !process.env.VITEST,
      // Disable vitePreprocess for tests to avoid CSS preprocessing issues
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
