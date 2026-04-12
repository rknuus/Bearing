/**
 * Demo Video Helpers
 *
 * Utilities for the automated demo video: caption overlays, natural typing,
 * timed pauses, and screenshot capture.
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';

// Project root is passed via DEMO_PROJECT_ROOT env var, or defaults to ../../ relative to this file
const PROJECT_ROOT = process.env.DEMO_PROJECT_ROOT || new URL('../../', import.meta.url).pathname;

export const DEMO_CONFIG = {
  VIEWPORT: { width: 1280, height: 800 },
  URL: 'http://localhost:5173',
  SCREENSHOT_DIR: `${PROJECT_ROOT}demo/screenshots`,
  VIDEO_DIR: `${PROJECT_ROOT}demo/video-raw`,
  // Pacing tiers — use ONLY these three for beat() calls:
  PAUSE_READ: 1500,   // Caption on screen — reading time
  PAUSE_ACTION: 800,  // Between UI actions — let viewer see what happened
  PAUSE_TRANSITION: 300, // Minimal cosmetic pause between steps
  TYPE_DELAY_MS: 50,
  SLOW_MO: 30,
};

/**
 * Type text character-by-character for a natural-looking input effect.
 */
export async function typeNaturally(page, selector, text, delay = DEMO_CONFIG.TYPE_DELAY_MS) {
  await page.type(selector, text, { delay });
}

/**
 * Save a screenshot to the demo/screenshots directory.
 * Creates the directory if it does not exist.
 */
export async function screenshot(page, name) {
  const path = `${DEMO_CONFIG.SCREENSHOT_DIR}/${name}.png`;
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path });
}
