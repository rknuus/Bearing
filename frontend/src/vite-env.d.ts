/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '*.css';

// Minimal ambient stubs for the Node built-ins used by the
// `styles.reduced-motion` Vitest test (Vitest runs in Node, but the frontend
// package intentionally does not depend on `@types/node`). Vite's `?raw`
// query returns an empty string for `.css` files in this project, so the
// reduced-motion source-level test reads `styles.css` from disk via `fs`.
declare module 'fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'url' {
  export function fileURLToPath(url: string | URL): string;
}
