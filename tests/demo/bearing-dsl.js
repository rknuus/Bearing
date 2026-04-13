/**
 * Bearing Demo DSL
 *
 * Domain-level scripting DSL for recording Bearing demo videos.
 * Exports async functions for every Bearing demo operation, with
 * built-in visual feedback (cursor, highlights, ripples) via
 * injected CSS/JS. Zero new npm dependencies.
 */

import { chromium } from '@playwright/test';
import {
  DEMO_CONFIG,
  typeNaturally,
  screenshot as screenshotHelper,
} from './demo-helpers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Today's date as YYYY-MM-DD. */
export const TODAY_ISO = new Date().toISOString().slice(0, 10);

const DEFAULT_TIMEOUT = 5000;
const CURSOR_MOVE_MS = 400;
const HIGHLIGHT_MS = 300;
const TRANSITION = DEMO_CONFIG.PAUSE_TRANSITION;

/** Priority short-name to CSS nth-child index in the CreateTaskDialog add-buttons row. */
const PRIORITY_MAP = {
  'iu':   1, // Important & Urgent
  'niu':  2, // Not Important & Urgent
  'inu':  3, // Important & Not Urgent
};

/** Navigation view name to nav-link text and expected wait selector. */
const VIEW_MAP = {
  'long-term':  { label: 'Long-term',  waitSelector: '.vision-section' },
  'mid-term':   { label: 'Mid-term',   waitSelector: '.calendar-view' },
  'short-term': { label: 'Short-term', waitSelector: '.kanban-board' },
};

/** Weekday name to nth-child index for .weekday-toggle (UI order: Mo Tu We Th Fr Sa Su). */
const WEEKDAY_MAP = {
  'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6, 'sun': 7,
};

// ---------------------------------------------------------------------------
// Visual effects layer (internal)
// ---------------------------------------------------------------------------

/**
 * CSS and JS injected into the page once during setup.
 * Creates cursor element, ripple helper, and highlight styles.
 */
const VISUAL_EFFECTS_INIT_SCRIPT = `
(function() {
  if (window.__bearingDslInitialised) return;
  window.__bearingDslInitialised = true;

  // --- Cursor ---
  const cursor = document.createElement('div');
  cursor.id = 'demo-cursor';
  Object.assign(cursor.style, {
    position: 'fixed',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.7)',
    border: '2px solid rgba(239, 68, 68, 0.9)',
    zIndex: '99998',
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
    transition: 'left ${CURSOR_MOVE_MS}ms cubic-bezier(.4,0,.2,1), top ${CURSOR_MOVE_MS}ms cubic-bezier(.4,0,.2,1), opacity 200ms',
    opacity: '0',
    left: '0px',
    top: '0px',
  });
  document.body.appendChild(cursor);

  // --- Ripple helper ---
  window.__demoCursorShow = function(x, y) {
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    cursor.style.opacity = '1';
  };
  window.__demoCursorMoveTo = function(x, y) {
    cursor.style.opacity = '1';
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  };
  window.__demoCursorHide = function() {
    cursor.style.opacity = '0';
  };

  window.__demoRipple = function(x, y) {
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'fixed',
      left: x + 'px',
      top: y + 'px',
      width: '0px',
      height: '0px',
      borderRadius: '50%',
      border: '2px solid rgba(59, 130, 246, 0.6)',
      transform: 'translate(-50%, -50%)',
      zIndex: '99997',
      pointerEvents: 'none',
      transition: 'width 400ms ease-out, height 400ms ease-out, opacity 400ms ease-out',
      opacity: '1',
    });
    document.body.appendChild(ring);
    requestAnimationFrame(function() {
      ring.style.width = '40px';
      ring.style.height = '40px';
      ring.style.opacity = '0';
    });
    setTimeout(function() { ring.remove(); }, 450);
  };

  // --- Highlight helpers ---
  window.__demoHighlight = function(el) {
    el.style.outline = '3px solid #3b82f6';
    el.style.outlineOffset = '2px';
  };
  window.__demoUnhighlight = function(el) {
    el.style.outline = '';
    el.style.outlineOffset = '';
  };
})();
`;

/**
 * Move the visible cursor to the centre of an element.
 * @param {import('@playwright/test').Page} page
 * @param {string|import('@playwright/test').Locator} selector
 */
async function moveCursorTo(page, selector) {
  const locator = typeof selector === 'string' ? page.locator(selector) : selector;
  const box = await locator.boundingBox({ timeout: DEFAULT_TIMEOUT });
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(({ x, y }) => window.__demoCursorMoveTo(x, y), { x: cx, y: cy });
  await page.waitForTimeout(CURSOR_MOVE_MS + 50);
}

/**
 * Move cursor to element, highlight it, click, fire ripple, remove highlight.
 * @param {import('@playwright/test').Page} page
 * @param {string|import('@playwright/test').Locator} selector
 */
async function clickWithVisual(page, selector) {
  const locator = typeof selector === 'string' ? page.locator(selector) : selector;

  // Get bounding box early — used for cursor, highlight, ripple
  const box = await locator.boundingBox({ timeout: DEFAULT_TIMEOUT });
  if (!box) {
    // Element not visible — fall back to plain click
    await locator.click();
    return;
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Move cursor to element centre
  await page.evaluate(({ x, y }) => window.__demoCursorMoveTo(x, y), { x: cx, y: cy });
  await page.waitForTimeout(CURSOR_MOVE_MS + 50);

  // Highlight (via page.evaluate with coordinates — avoids locator auto-wait)
  await page.evaluate(({ bx, by, bw, bh }) => {
    const el = document.elementFromPoint(bx + bw / 2, by + bh / 2);
    if (el) window.__demoHighlight(el);
  }, { bx: box.x, by: box.y, bw: box.width, bh: box.height });
  await page.waitForTimeout(HIGHLIGHT_MS);

  // Click
  await locator.click();

  // Ripple
  await page.evaluate(({ x, y }) => window.__demoRipple(x, y), { x: cx, y: cy });

  // Remove all highlights (element may have been removed from DOM by the click)
  await page.evaluate(() => {
    document.querySelectorAll('[style*="outline"]').forEach(el => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    });
  }).catch(() => {});
}


// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------

/**
 * Launch a browser, create a context with video recording, create a page,
 * inject visual effects and demo-mode flag.
 *
 * @param {object} [options]
 * @param {boolean} [options.headless] - Launch headless (default: false)
 * @param {{ width: number, height: number }} [options.viewport] - Viewport size
 * @param {string} [options.url] - URL to navigate to
 * @returns {Promise<{ browser: import('@playwright/test').Browser, context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page }>}
 */
export async function setupDemo(options = {}) {
  const viewport = options.viewport || DEMO_CONFIG.VIEWPORT;

  const browser = await chromium.launch({
    headless: options.headless ?? false,
    slowMo: DEMO_CONFIG.SLOW_MO,
  });

  const context = await browser.newContext({
    viewport,
    recordVideo: {
      dir: DEMO_CONFIG.VIDEO_DIR,
      size: viewport,
    },
  });

  const page = await context.newPage();

  // Set demo-mode BEFORE first navigation
  await page.addInitScript(() => {
    sessionStorage.setItem('bearing-demo-mode', 'true');
  });

  // Navigate to the app
  const url = options.url || DEMO_CONFIG.URL;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.vision-section', { timeout: 10000 });

  // Inject visual effects layer after DOM is ready (SPA — no full-page navigations)
  await page.evaluate(VISUAL_EFFECTS_INIT_SCRIPT);

  return { browser, context, page };
}

/**
 * Clean up demo resources: remove demo-mode flag, close context and browser.
 *
 * @param {{ browser: import('@playwright/test').Browser, context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page }} resources
 */
export async function teardownDemo({ browser, context, page }) {
  try {
    await page.evaluate(() => {
      sessionStorage.removeItem('bearing-demo-mode');
    }).catch(() => {});
    await context.close();
    await browser.close();
  } catch (err) {
    throw new Error(`teardownDemo: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Navigate to a view by clicking the nav link.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'long-term'|'mid-term'|'short-term'} view
 */
export async function navigateTo(page, view) {
  const config = VIEW_MAP[view];
  if (!config) {
    throw new Error(`navigateTo: unknown view "${view}". Use 'long-term', 'mid-term', or 'short-term'.`);
  }
  await clickWithVisual(page, `.nav-link:has-text("${config.label}")`);
  await page.waitForSelector(config.waitSelector, { timeout: DEFAULT_TIMEOUT });
}

/**
 * Click a theme badge to navigate back to the OKR view filtered to that theme.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Theme name text
 */
export async function clickThemeBadge(page, name) {
  try {
    await clickWithVisual(page, page.locator(`.theme-badge:has-text("${name}")`).first());
    await page.waitForSelector('.vision-section', { timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`clickThemeBadge: failed for theme "${name}": ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Show a caption overlay, wait for the specified duration, then hide it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {number} [durationMs=1500] - How long to display the caption
 */
export async function caption(page, text, durationMs = DEMO_CONFIG.PAUSE_READ) {
  await page.evaluate((t) => {
    let el = document.getElementById('demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      Object.assign(el.style, {
        position: 'fixed',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '12px 32px',
        borderRadius: '8px',
        fontSize: '22px',
        fontWeight: '500',
        zIndex: '99999',
        transition: 'opacity 0.3s',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        maxWidth: '100%',
        textAlign: 'center',
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = t ? '1' : '0';
    el.style.pointerEvents = t ? 'auto' : 'none';
  }, text);
  await page.waitForTimeout(durationMs);
  // Auto-hide
  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
  });
}

/**
 * Save a named screenshot.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Screenshot name (without extension)
 */
export async function screenshot(page, name) {
  try {
    await screenshotHelper(page, name);
  } catch (err) {
    throw new Error(`screenshot: failed for "${name}": ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Vision / Mission
// ---------------------------------------------------------------------------

/**
 * Open the vision/mission editor and set the specified values.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ vision?: string, mission?: string }} values
 */
export async function editVisionMission(page, { vision, mission } = {}) {
  try {
    // Expand vision section
    await clickWithVisual(page, '.vision-section .section-header-toggle');
    await page.waitForSelector('.vision-body', { timeout: DEFAULT_TIMEOUT });

    // Open edit dialog
    await clickWithVisual(page, '.vision-section .btn-secondary:has-text("Edit")');
    await page.waitForSelector('.vision-dialog', { timeout: DEFAULT_TIMEOUT });

    if (vision !== undefined) {
      const field = page.getByRole('textbox', { name: 'Vision' });
      await moveCursorTo(page, field);
      await field.fill(vision);
      await page.waitForTimeout(TRANSITION);
    }

    if (mission !== undefined) {
      const field = page.getByRole('textbox', { name: 'Mission' });
      await moveCursorTo(page, field);
      await field.fill(mission);
      await page.waitForTimeout(TRANSITION);
    }

    // Save
    await clickWithVisual(page, '.vision-dialog .btn-primary:has-text("Save")');
    await page.waitForSelector('.vision-dialog', { state: 'detached', timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`editVisionMission: ${err.message}`);
  }
}

/**
 * Toggle a collapsible section header (Vision & Mission, Routines, etc.).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sectionSelector - CSS selector for the section container, e.g. '.vision-section'
 */
export async function toggleSection(page, sectionSelector) {
  try {
    await clickWithVisual(page, `${sectionSelector} .section-header-toggle`);
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`toggleSection: failed for "${sectionSelector}": ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// OKR Operations
// ---------------------------------------------------------------------------

/**
 * Create a new theme.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Theme name
 * @param {{ color?: number }} [options] - Optional color index (1-based nth-child)
 */
export async function createTheme(page, name, options = {}) {
  try {
    await clickWithVisual(page, '.btn-primary:has-text("+ Add Theme")');
    await page.waitForSelector('.theme-form', { timeout: DEFAULT_TIMEOUT });

    const input = page.locator('.theme-form input[type="text"]');
    await moveCursorTo(page, input);
    await typeNaturally(page, '.theme-form input[type="text"]', name);

    if (options.color) {
      await clickWithVisual(page, `.theme-form .color-option:nth-child(${options.color})`);
    }

    await page.waitForTimeout(TRANSITION);
    await clickWithVisual(page, '.theme-form .btn-primary:has-text("Create")');
    await page.waitForSelector(`.theme-pill:has-text("${name}")`, { timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`createTheme: failed for "${name}": ${err.message}`);
  }
}

/**
 * Add an objective to a theme. Expands the theme if collapsed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} themeName - Name of the parent theme
 * @param {string} title - Objective title
 */
export async function addObjective(page, themeName, title) {
  try {
    // Find the theme node
    const themeNode = page.locator(`.tree-theme-edit:has-text("${themeName}")`).first();

    // Expand if not already expanded
    const expandBtn = themeNode.locator('.expand-button');
    await clickWithVisual(page, expandBtn);

    // Hover to reveal action buttons
    const header = themeNode.locator('> .item-header');
    await moveCursorTo(page, header);
    await header.hover();

    // Click "Add OKR"
    await clickWithVisual(page, themeNode.locator('button[title="Add OKR"]'));
    await page.waitForSelector('.objective-form', { timeout: DEFAULT_TIMEOUT });

    const input = page.locator('.objective-form input[type="text"]');
    await moveCursorTo(page, input);
    await typeNaturally(page, '.objective-form input[type="text"]', title);
    await page.waitForTimeout(TRANSITION);

    await clickWithVisual(page, '.objective-form .btn-primary');
    await page.waitForSelector('.tree-objective-edit', { timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`addObjective: failed for theme "${themeName}", objective "${title}": ${err.message}`);
  }
}

/**
 * Add a key result to an objective.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} objectiveTitle - Text of the parent objective
 * @param {{ name: string, target?: string }} kr - Key result data
 */
export async function addKeyResult(page, objectiveTitle, { name, target }) {
  try {
    // Find the objective node
    const objNode = page.locator(`.tree-objective-edit:has-text("${objectiveTitle}")`).first();

    // Hover to reveal action buttons
    const header = objNode.locator('.objective-header');
    await moveCursorTo(page, header);
    await header.hover();

    // Click "Add Key Result"
    await clickWithVisual(page, objNode.locator('button[title="Add Key Result"]'));
    await page.waitForSelector('.kr-form', { timeout: DEFAULT_TIMEOUT });

    const input = page.locator('.kr-form input[type="text"]');
    await moveCursorTo(page, input);
    await typeNaturally(page, '.kr-form input[type="text"]', name);

    if (target !== undefined) {
      await page.fill('.kr-form .kr-progress-label:nth-child(2) .kr-progress-input', String(target));
    }

    await page.waitForTimeout(TRANSITION);
    await clickWithVisual(page, '.kr-form .btn-primary');
    await page.waitForSelector('.kr-header', { timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`addKeyResult: failed for objective "${objectiveTitle}", KR "${name}": ${err.message}`);
  }
}

/**
 * Update a key result's current progress value.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} keyResultText - Text of the key result description
 * @param {number} value - New current value
 */
export async function updateKeyResultProgress(page, keyResultText, value) {
  try {
    const krRow = page.locator(`.kr-header:has-text("${keyResultText}")`).first();
    const input = krRow.locator('.kr-current-input');
    await moveCursorTo(page, input);
    await input.fill(String(value));
    await input.dispatchEvent('change');
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`updateKeyResultProgress: failed for "${keyResultText}": ${err.message}`);
  }
}

/**
 * Create a routine in the routines section.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Routine name
 * @param {{ schedule: string, days?: string[], startDate?: string }} options
 *   schedule: e.g. 'daily', 'weekly'
 *   days: array of short day names e.g. ['mon', 'wed', 'fri']
 *   startDate: ISO date string e.g. '2026-01-01'
 */
export async function createRoutine(page, name, { schedule, days, startDate }) {
  try {
    // Expand routines section
    await clickWithVisual(page, '.routines-section .section-header-toggle');

    // Click add routine button
    await clickWithVisual(page, 'button[title="Add Routine"]');
    await page.waitForSelector('.routine-form', { timeout: DEFAULT_TIMEOUT });

    // Scroll form into view
    await page.evaluate(() => {
      const el = document.querySelector('.routine-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    await page.waitForTimeout(TRANSITION);

    // Type name
    const input = page.locator('.routine-form input[type="text"]');
    await moveCursorTo(page, input);
    await typeNaturally(page, '.routine-form input[type="text"]', name);

    // Select schedule
    await page.selectOption('.routine-form .routine-field-select', schedule);
    await page.waitForTimeout(TRANSITION);

    // Set start date
    if (startDate) {
      const dateInput = page.locator('.routine-form input[type="date"]');
      await moveCursorTo(page, dateInput);
      await dateInput.fill(startDate);
      await page.waitForTimeout(TRANSITION);
    }

    // Toggle weekday buttons
    if (days && days.length > 0) {
      for (const day of days) {
        const idx = WEEKDAY_MAP[day.toLowerCase()];
        if (!idx) {
          throw new Error(`unknown day "${day}". Use: sun, mon, tue, wed, thu, fri, sat.`);
        }
        await clickWithVisual(page, `.weekday-toggle:nth-child(${idx})`);
        await page.waitForTimeout(TRANSITION);
      }
    }

    // Scroll create button into view, then click
    const createBtn = page.locator('.routine-form .btn-primary:has-text("Create")');
    await createBtn.scrollIntoViewIfNeeded();
    await clickWithVisual(page, createBtn);
    await page.waitForSelector('.routine-card', { timeout: DEFAULT_TIMEOUT });

    // Scroll to bottom so the new routine card is visible
    await scrollTo(page, 'bottom');
  } catch (err) {
    throw new Error(`createRoutine: failed for "${name}": ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/**
 * Open the day-focus dialog for today.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openDayDialog(page) {
  try {
    const todayCell = page.locator('.day-num.today');
    await moveCursorTo(page, todayCell);
    await page.dblclick('.day-num.today');
    await page.waitForSelector('.dialog', { timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`openDayDialog: ${err.message}`);
  }
}

/**
 * Open the day-focus dialog for a day relative to today.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} delta - Day offset from today, e.g. +1 for tomorrow, -1 for yesterday
 */
export async function openDayDialogFor(page, delta) {
  try {
    const target = new Date();
    target.setDate(target.getDate() + delta);
    const day = target.getDate();
    const month0 = target.getMonth(); // 0-based

    // Calendar grid has one row per day-of-month across all 12 months.
    // For a given day number, the month-th occurrence (0-based) is the right cell.
    const cell = page.locator(`.day-num:text-is("${day}")`).nth(month0);
    await moveCursorTo(page, cell);
    await cell.dblclick();
    await page.waitForSelector('.dialog', { timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`openDayDialogFor: failed for delta ${delta}: ${err.message}`);
  }
}

/**
 * Set the daily focus for today by checking a theme in the day dialog.
 * Opens the dialog if not already open.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} themeName - Theme name to check
 */
export async function setDailyFocus(page, themeName) {
  try {
    // Open dialog if not already open
    const dialogOpen = await page.locator('.dialog').isVisible().catch(() => false);
    if (!dialogOpen) {
      await openDayDialog(page);
    }

    // Check the theme (target the header row to avoid matching child OKR checkboxes)
    await clickWithVisual(page, `.tree-theme-header:has-text("${themeName}") input[type="checkbox"]`);
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`setDailyFocus: failed for theme "${themeName}": ${err.message}`);
  }
}

/**
 * Select a KR as focus in the day dialog. Expands the theme and objective
 * tree nodes first if needed. Assumes the day dialog is already open.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} krText - Key result description text (partial match)
 */
export async function selectDayOKR(page, krText) {
  try {
    // Expand collapsed tree nodes one at a time until the KR is visible.
    // Re-query after each click because the DOM changes when nodes expand.
    for (let round = 0; round < 10; round++) {
      const krVisible = await page.locator(`.tree-kr-item:has-text("${krText}")`).isVisible().catch(() => false);
      if (krVisible) break;
      const btn = page.locator('.dialog .tree-expand-button[aria-expanded="false"]').first();
      if (await btn.count() === 0) break;
      await btn.click();
      await page.waitForTimeout(150);
    }

    // Check the KR checkbox
    await clickWithVisual(page, page.locator(`.tree-kr-item:has-text("${krText}") input[type="checkbox"]`).first());
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`selectDayOKR: failed for "${krText}": ${err.message}`);
  }
}

/**
 * Check a routine in the day-focus dialog. Assumes dialog is already open.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} routineText - Routine description text (partial match)
 */
export async function checkRoutine(page, routineText) {
  try {
    const checkbox = page.locator(`.routine-check:has-text("${routineText}") input[type="checkbox"]`).first();
    await clickWithVisual(page, checkbox);
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`checkRoutine: failed for "${routineText}": ${err.message}`);
  }
}

/**
 * Set the text field in the day-focus dialog. Assumes dialog is already open.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text - Text to enter
 */
export async function setDayText(page, text) {
  try {
    const input = page.locator('#text-input');
    await moveCursorTo(page, input);
    await typeNaturally(page, '#text-input', text);
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`setDayText: failed: ${err.message}`);
  }
}

/**
 * Add a tag to the current day dialog (assumes day dialog is already open).
 * Expands the tags section if collapsed, types the tag, and presses Enter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} tag - Tag text to add
 */
export async function addDayTag(page, tag) {
  try {
    // Expand tags section
    await clickWithVisual(page, '.dialog .collapsible-header');
    await page.waitForSelector('.dialog .tag-editor', { timeout: DEFAULT_TIMEOUT });

    // Fill tag and press Enter
    const tagInput = page.locator('.dialog .tag-editor input[type="text"]');
    await moveCursorTo(page, tagInput);
    await tagInput.fill(tag);
    await tagInput.press('Enter');
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`addDayTag: failed for tag "${tag}": ${err.message}`);
  }
}

/**
 * Save and close the currently open day-focus dialog.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function saveDayDialog(page) {
  try {
    await clickWithVisual(page, '.dialog .btn-primary:has-text("Save")');
    await page.waitForSelector('.dialog', { state: 'detached', timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`saveDayDialog: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// EisenKan
// ---------------------------------------------------------------------------

/**
 * Create a task in the EisenKan create-task dialog.
 * Opens the dialog if not already open.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} title - Task title
 * @param {{ theme: string, priority: 'iu'|'niu'|'inu', tags?: string[] }} options
 */
export async function createTask(page, title, { theme, priority, tags }) {
  const nthChild = PRIORITY_MAP[priority];
  if (!nthChild) {
    throw new Error(`createTask: unknown priority "${priority}". Use 'iu', 'niu', or 'inu'.`);
  }

  try {
    // Open create-task dialog if not visible
    const dialogVisible = await page.locator('.dialog').isVisible().catch(() => false);
    if (!dialogVisible) {
      await clickWithVisual(page, '#create-task-btn');
      await page.waitForSelector('.dialog', { timeout: DEFAULT_TIMEOUT });
    }

    // Fill title
    const titleInput = page.locator('#new-task-title');
    await moveCursorTo(page, titleInput);
    await typeNaturally(page, '#new-task-title', title);

    // Select theme
    await page.selectOption('#new-task-theme', { label: theme });

    // Add tags
    if (tags && tags.length > 0) {
      const tagInput = page.locator('.dialog .tag-input');
      for (const tag of tags) {
        await moveCursorTo(page, tagInput);
        await tagInput.fill(tag);
        await tagInput.press('Enter');
        await page.waitForTimeout(TRANSITION);
      }
    }

    // Click priority button
    await clickWithVisual(page, `.btn-add:nth-child(${nthChild})`);
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`createTask: failed for "${title}": ${err.message}`);
  }
}

/**
 * Commit all staged tasks by clicking "Commit to Todo".
 *
 * @param {import('@playwright/test').Page} page
 */
export async function commitTasks(page) {
  try {
    await clickWithVisual(page, '.btn-primary:has-text("Commit to Todo")');
    await page.waitForSelector('.dialog', { state: 'detached', timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`commitTasks: ${err.message}`);
  }
}

/**
 * Move a task to a target column (doing/done) via the backend API,
 * with a visual cursor animation from the task card to the target column header.
 * Navigates away and back to refresh the view.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} title - Task title
 * @param {'doing'|'done'} targetColumn
 */
export async function moveTask(page, title, targetColumn) {
  try {
    // Find the task card and target column drop zone
    const taskCard = page.locator(`.task-card:has-text("${title}")`).first();
    const targetZone = page.locator(
      `[data-column-name="${targetColumn}"] .column-content`
    ).first();

    const srcBox = await taskCard.boundingBox({ timeout: DEFAULT_TIMEOUT });
    const dstBox = await targetZone.boundingBox({ timeout: DEFAULT_TIMEOUT });

    if (!srcBox || !dstBox) {
      throw new Error('could not locate task card or target column');
    }

    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;
    const dx = dstBox.x + dstBox.width / 2;
    const dy = dstBox.y + 40; // near top of drop zone

    // Show cursor moving from card to column
    await page.evaluate(({ x, y }) => window.__demoCursorMoveTo(x, y), { x: sx, y: sy });
    await page.waitForTimeout(CURSOR_MOVE_MS);

    // Drag: pointer down on card, slow move to target, pointer up
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForTimeout(150); // let svelte-dnd-action register the drag
    await page.mouse.move(dx, dy, { steps: 20 });
    await page.waitForTimeout(150);
    await page.mouse.up();

    // Animate cursor to final position
    await page.evaluate(({ x, y }) => window.__demoCursorMoveTo(x, y), { x: dx, y: dy });
    await page.waitForTimeout(CURSOR_MOVE_MS);
  } catch (err) {
    throw new Error(`moveTask: failed moving "${title}" to "${targetColumn}": ${err.message}`);
  }
}

/**
 * Toggle the "Today's Focus" filter pill on the EisenKan view.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function toggleTodayFocus(page) {
  try {
    // Toggle all visible Today's Focus pills (theme filter + tag filter)
    const pills = page.locator('.today-focus-pill');
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      const pill = pills.nth(i);
      if (await pill.isVisible()) {
        await clickWithVisual(page, pill);
      }
    }
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`toggleTodayFocus: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// UI Utilities
// ---------------------------------------------------------------------------

/**
 * Scroll to a position or element.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'top'|'bottom'|string} target - 'top', 'bottom', or a CSS selector
 */
export async function scrollTo(page, target) {
  try {
    if (target === 'top') {
      await page.evaluate(() => {
        const scrollable = document.querySelector('.okr-content') || document.querySelector('.content');
        if (scrollable) scrollable.scrollTop = 0;
      });
    } else if (target === 'bottom') {
      await page.evaluate(() => {
        const scrollable = document.querySelector('.okr-content') || document.querySelector('.content');
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      });
    } else {
      // Selector string — use Playwright locator to support :has-text() etc.
      await page.locator(target).first().scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`scrollTo: failed for "${target}": ${err.message}`);
  }
}

/**
 * Scroll the currently open dialog to its bottom.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function scrollDialogToBottom(page) {
  try {
    // Scroll the last element inside the dialog into view
    const actions = page.locator('.dialog .dialog-actions').first();
    await actions.scrollIntoViewIfNeeded();
    await page.waitForTimeout(TRANSITION);
  } catch (err) {
    throw new Error(`scrollDialogToBottom: ${err.message}`);
  }
}

/**
 * Move the cursor to the side of the viewport so it doesn't obscure content.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function moveCursorAway(page) {
  await page.evaluate(() => window.__demoCursorMoveTo(50, 400));
  await page.waitForTimeout(CURSOR_MOVE_MS);
}

/**
 * Open the goal advisor panel.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openAdvisor(page) {
  try {
    await clickWithVisual(page, '.btn-secondary:has-text("Advisor")');
    await page.waitForSelector('.advisor-panel.open', { timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`openAdvisor: ${err.message}`);
  }
}

/**
 * Close the goal advisor panel.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function closeAdvisor(page) {
  try {
    await clickWithVisual(page, '.btn-primary:has-text("Close Advisor")');
    await page.waitForSelector('.advisor-panel.open', { state: 'detached', timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    throw new Error(`closeAdvisor: ${err.message}`);
  }
}
