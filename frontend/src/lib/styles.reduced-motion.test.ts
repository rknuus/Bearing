import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Vitest runs in Node; declare the global so we can locate `styles.css`
// relative to the package working directory without depending on
// `@types/node`.
declare const process: { cwd(): string };

/**
 * Coverage for UX/UI assessment Polish finding P1 (issue #148): a global
 * `@media (prefers-reduced-motion: reduce)` rule in `styles.css` neutralizes
 * animation and transition durations so users who request reduced motion
 * no longer see slide-ins, pulses, rotations, or width transitions.
 *
 * This source-level test guards against accidental removal of the rule.
 * The Playwright UI-component test
 * (`tests/ui-component/reduced-motion.test.js`) verifies the rule actually
 * applies at runtime — Vitest+jsdom cannot evaluate `@media` queries.
 *
 * We read `styles.css` from disk rather than via Vite's `?raw` query
 * because the sibling `focus-ring.test.ts` already documents that `?raw`
 * returns an empty string for `.css` files in this project. Ambient stubs
 * for the `fs` and `url` modules live in `frontend/src/vite-env.d.ts`.
 */
// Resolve `styles.css` relative to the package working directory. Vitest
// runs with `cwd` at the `frontend/` package root, which is where
// `package.json` lives, so the file sits at `src/styles.css`.
function resolveStylesPath(): string {
  const url = new URL('../styles.css', import.meta.url);
  if (url.protocol === 'file:') {
    return fileURLToPath(url);
  }
  // Vitest's transformed module URLs are package-root-relative; join with cwd.
  const rel = url.pathname.replace(/^\/+/, '');
  return `${process.cwd()}/${rel}`;
}
const stylesSource = readFileSync(resolveStylesPath(), 'utf8');

describe('Reduced-motion media query (issue #148) — source', () => {
  it('loads `styles.css` source', () => {
    expect(typeof stylesSource).toBe('string');
    expect(stylesSource.length).toBeGreaterThan(0);
  });

  it('declares an `@media (prefers-reduced-motion: reduce)` block', () => {
    expect(stylesSource).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('neutralizes animation-duration to a near-zero value', () => {
    expect(stylesSource).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  it('caps animation-iteration-count at 1', () => {
    expect(stylesSource).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it('neutralizes transition-duration to a near-zero value', () => {
    expect(stylesSource).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it('targets every element including pseudo-elements (`*, *::before, *::after`)', () => {
    const idx = stylesSource.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(idx).toBeGreaterThan(-1);
    const block = stylesSource.slice(idx);
    expect(block).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after/);
  });
});
