import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Port can be configured via VITE_PORT env var (default 5173 for wails-dev)
const port = parseInt(process.env.VITE_PORT || '5173', 10)

export default defineConfig({
  plugins: [svelte()],
  server: {
    port,
    strictPort: true
  },
  build: {
    outDir: 'dist'
  }
})
