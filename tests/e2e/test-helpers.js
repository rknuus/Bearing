/**
 * Shared test utilities for Bearing true E2E tests
 *
 * Tests run against Wails dev server at http://localhost:34215 with a real Go
 * backend. File verification reads JSON files and git history from the data
 * directory specified by BEARING_DATA_DIR.
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export const TEST_CONFIG = {
  WAILS_DEV_URL: process.env.WAILS_DEV_URL || 'http://localhost:34215',
  TIMEOUT: 60000,
  HEADLESS: process.env.HEADLESS === 'true',
  SLOW_MO: 50,
  CHROME_CHANNEL: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? 'chrome',
}

/**
 * Check if Wails dev server is running and ready
 */
export async function isServerReady() {
  try {
    const response = await fetch(TEST_CONFIG.WAILS_DEV_URL)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Wait for Wails dev server to be ready
 */
export async function waitForServers(maxAttempts = 60, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await isServerReady()

    if (ready) {
      return true
    }

    if (i === 0) {
      console.log('Waiting for Wails dev server to be ready...')
    }
    if (i % 5 === 0 && i > 0) {
      console.log(`  Still waiting... (attempt ${i + 1}/${maxAttempts})`)
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  throw new Error('Wails dev server failed to start within timeout period')
}

// --- File verification helpers ---

/**
 * Read and parse a JSON file from the data directory
 */
export function readJSON(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  const content = fs.readFileSync(fullPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Read themes array from themes/themes.json (unwraps ThemesFile wrapper)
 */
export function readThemes(dataDir) {
  const data = readJSON(dataDir, 'themes/themes.json')
  return data.themes || []
}

/**
 * Read routines array from routines.json
 */
export function readRoutines(dataDir) {
  const fullPath = path.join(dataDir, 'routines.json')
  if (!fs.existsSync(fullPath)) return []
  const data = readJSON(dataDir, 'routines.json')
  return data.routines || []
}

/**
 * Run git log --oneline and return array of commit messages
 */
export function getGitLog(dataDir) {
  try {
    const output = execSync('git log --oneline --format=%s', { cwd: dataDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return output.trim().split('\n').filter(Boolean)
  } catch {
    // No commits yet (empty repo)
    return []
  }
}

/**
 * Return total git commit count
 */
export function getGitCommitCount(dataDir) {
  try {
    const output = execSync('git rev-list --count HEAD', { cwd: dataDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return parseInt(output.trim(), 10)
  } catch {
    // No commits yet (empty repo) — HEAD doesn't exist
    return 0
  }
}

/**
 * Assert file exists at the given relative path
 */
export function assertFileExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Expected file to exist: ${relativePath}`)
  }
}

/**
 * Assert file does NOT exist at the given relative path
 */
export function assertFileNotExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (fs.existsSync(fullPath)) {
    throw new Error(`Expected file NOT to exist: ${relativePath}`)
  }
}

/**
 * Assert directory exists at the given relative path
 */
export function assertDirExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    throw new Error(`Expected directory to exist: ${relativePath}`)
  }
}

/**
 * Assert directory does NOT exist at the given relative path
 */
export function assertDirNotExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (fs.existsSync(fullPath)) {
    throw new Error(`Expected directory NOT to exist: ${relativePath}`)
  }
}

/**
 * List task files in a status directory
 */
export function getTaskFiles(dataDir, status) {
  const dir = path.join(dataDir, 'tasks', status)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'))
}

// --- Suite-scoped task residue cleanup -----------------------------------
//
// Each E2E suite shares one `~/.bearing/data` workspace across the run-all
// sequence. If a suite archives or moves task files and never cleans up,
// the residue leaks into the next suite. To keep suites isolated without
// blanket-deleting unrelated files (which would also wipe pre-existing
// residue from earlier suites or manual probes), we snapshot the task ids
// present under each status directory at suite start, then on teardown
// invoke the backend's DeleteTask binding for every id present at end that
// wasn't present at start.
//
// Going through the backend (not raw `fs.unlink` + `git rm`) keeps the
// data-dir git repository consistent: the backend's CommitAll pipeline
// owns every write to that repo and aborts hard if its on-disk view
// diverges from in-memory state. Using `DeleteTask` for archived files
// requires Restore-then-Delete since DeleteTask only handles non-archived
// statuses; the helper handles that.

const TASK_STATUSES = ['todo', 'doing', 'done', 'archived']

/** Filename → task id (filenames are `<id>.json`). */
function fileNameToId(name) {
  return name.endsWith('.json') ? name.slice(0, -5) : name
}

/**
 * Snapshot the set of task ids under each status directory. Returned
 * value is opaque — pass it to `cleanupTaskResidue` to remove any task
 * files that were added after the snapshot was taken.
 */
export function snapshotTaskFilenames(dataDir) {
  const snapshot = {}
  for (const status of TASK_STATUSES) {
    snapshot[status] = new Set(
      getTaskFiles(dataDir, status).map(fileNameToId),
    )
  }
  return snapshot
}

/**
 * Remove task files added after `snapshot` was taken via the backend's
 * RestoreTask / DeleteTask bindings (so the data-dir's git history and the
 * backend's in-memory state stay in lockstep). Files present in the
 * snapshot are left alone, even if their content has changed (the suite's
 * own assertions cover content/state).
 *
 * The snapshot is matched by *id*, not by `(status, id)`: the backend
 * routinely moves a task between status directories (e.g., MoveTask,
 * ArchiveTask, RestoreTask) and we must not delete a pre-existing task
 * that simply migrated columns during the run.
 *
 * Defensive: errors per task are logged but do not throw, so a failing
 * scenario still gets best-effort cleanup.
 */
export async function cleanupTaskResidue(page, dataDir, snapshot) {
  // Union of every id present anywhere at snapshot time. Any id in this
  // set is treated as pre-existing regardless of where it currently lives.
  const baselineIds = new Set()
  for (const status of TASK_STATUSES) {
    for (const id of snapshot[status] ?? new Set()) {
      baselineIds.add(id)
    }
  }

  const additions = { todo: [], doing: [], done: [], archived: [] }
  for (const status of TASK_STATUSES) {
    for (const name of getTaskFiles(dataDir, status)) {
      const id = fileNameToId(name)
      if (baselineIds.has(id)) continue
      additions[status].push(id)
    }
  }

  const archivedToDelete = additions.archived
  const directDelete = [...additions.todo, ...additions.doing, ...additions.done]

  if (archivedToDelete.length + directDelete.length === 0) return

  try {
    await page.evaluate(async ({ archived, direct }) => {
      const app = window.go.main.App
      // Archived tasks: restore first (DeleteTask doesn't accept archived),
      // then delete. Errors per id are swallowed so the loop runs to end.
      for (const id of archived) {
        try {
          await app.RestoreTask(id)
          await app.DeleteTask(id)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log(`[cleanup] archived ${id}: ${err && err.message ? err.message : err}`)
        }
      }
      for (const id of direct) {
        try {
          await app.DeleteTask(id)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log(`[cleanup] ${id}: ${err && err.message ? err.message : err}`)
        }
      }
    }, { archived: archivedToDelete, direct: directDelete })
  } catch (err) {
    console.log(`  [cleanup] page.evaluate failed: ${err.message}`)
  }
}

/**
 * Check if git working tree is clean (no unstaged changes).
 * Excludes ephemeral files that are not versioned business data:
 * - bearing.log / wails-dev.log: runtime logs
 * - navigation_context.json: UI state (may become tracked via CommitAll side effects)
 * - tasks/drafts.json: ephemeral draft data, explicitly not git-versioned
 */
export function isWorkingTreeClean(dataDir) {
  try {
    const excludes = '":!bearing.log" ":!wails-dev.log" ":!navigation_context.json" ":!tasks/drafts.json"'
    const output = execSync(`git diff --name-only -- ${excludes} && git diff --cached --name-only -- ${excludes}`, { cwd: dataDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], shell: true })
    return output.trim() === ''
  } catch {
    return true
  }
}

// --- Date helpers (used by routine-overdue tests) ---

/**
 * Return an ISO YYYY-MM-DD date `delta` calendar days from `iso`.
 * Uses local-midnight Date construction to avoid UTC timezone shifts.
 */
export function addDaysISO(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// --- Calendar / focus-editor navigation helpers ---

/**
 * Read the currently displayed calendar year (as a string) from the
 * `.year-title` element. Returns `null` if not present.
 */
export async function getYearTitle(page) {
  const title = await page.locator('.calendar-view .year-title').first()
  if ((await title.count()) === 0) return null
  return ((await title.textContent()) ?? '').trim()
}

/**
 * Navigate the calendar to the requested year by clicking the year nav
 * buttons until the displayed year matches. Assumes the calendar view is
 * already mounted (`.calendar-view` is visible).
 */
export async function navigateCalendarToYear(page, targetYear) {
  // Bound the loop defensively; we never expect more than a few clicks in tests.
  for (let i = 0; i < 6; i++) {
    const current = await getYearTitle(page)
    if (current === null) {
      throw new Error('Calendar year title not found — is .calendar-view mounted?')
    }
    const currentYear = parseInt(current, 10)
    if (currentYear === targetYear) return
    if (targetYear < currentYear) {
      await page.click('.calendar-view .nav-button[aria-label="Previous year"]')
    } else {
      await page.click('.calendar-view .nav-button[aria-label="Next year"]')
    }
    // Small wait for the year-title to update (it is synchronous svelte state).
    await page.waitForFunction(
      (year) => {
        const el = document.querySelector('.calendar-view .year-title')
        return el ? el.textContent.trim() === String(year) : false
      },
      targetYear,
      { timeout: 5000 },
    )
  }
  const final = await getYearTitle(page)
  if (parseInt(final ?? '0', 10) !== targetYear) {
    throw new Error(`Failed to navigate calendar to year ${targetYear}; current = ${final}`)
  }
}

/**
 * Open the day-focus editor dialog for the given ISO date (`YYYY-MM-DD`)
 * by navigating the CalendarView year if necessary and double-clicking the
 * matching `.day-num` button.
 *
 * Day cells are not labelled with `data-testid`. We disambiguate the cell
 * by reading each `.day-num` button's inline `grid-column` value
 * (`2 + 3 * monthIdx`) plus its day-number text. Browsers may normalise the
 * inline `style` attribute (`grid-column: 11;` → `grid-column: 11 / auto;`
 * etc.), so a substring CSS selector is unreliable — we read the rendered
 * `style.gridColumnStart` instead, which is browser-canonical.
 */
export async function openDayFocusEditor(page, iso) {
  const [yearStr, monthStr, dayStr] = iso.split('-')
  const targetYear = parseInt(yearStr, 10)
  const monthIdx = parseInt(monthStr, 10) - 1 // 0-based
  const dayNum = parseInt(dayStr, 10)

  await navigateCalendarToYear(page, targetYear)

  // Find the matching `.day-num` button via a single page.evaluate so we can
  // read the canonical `gridColumnStart` (independent of inline-style
  // normalisation quirks). We mark the matching button with a transient
  // attribute so Playwright can drive the dblclick through its real-event
  // pipeline (preserving event sequencing the app relies on).
  const expectedCol = 2 + 3 * monthIdx
  const found = await page.evaluate(
    ({ expectedCol, dayNum }) => {
      const buttons = Array.from(
        document.querySelectorAll('.calendar-view button.day-num'),
      )
      const target = buttons.find((b) => {
        if ((b.textContent || '').trim() !== String(dayNum)) return false
        const col = parseInt(b.style.gridColumnStart || '', 10)
        return col === expectedCol
      })
      if (!target) return false
      // Clear any previous marker to keep selectors single-match.
      document
        .querySelectorAll('[data-e2e-day-target]')
        .forEach((el) => el.removeAttribute('data-e2e-day-target'))
      target.setAttribute('data-e2e-day-target', '1')
      return true
    },
    { expectedCol, dayNum },
  )

  if (!found) {
    throw new Error(
      `Could not find .day-num cell for ${iso} (monthIdx=${monthIdx}, day=${dayNum}, expectedCol=${expectedCol})`,
    )
  }

  const target = page.locator('.calendar-view button.day-num[data-e2e-day-target="1"]')
  await target.scrollIntoViewIfNeeded()
  await target.dblclick()
  await page.waitForSelector('.dialog', { state: 'visible', timeout: 5000 })

  // Clean up the marker — kept transient to avoid leaking test-only state.
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-e2e-day-target]')
      .forEach((el) => el.removeAttribute('data-e2e-day-target'))
  })
}

/**
 * Test reporter for consistent output
 */
export class TestReporter {
  constructor(suiteName) {
    this.suiteName = suiteName
    this.passed = 0
    this.failed = 0
    this.tests = []
  }

  startTest(testName) {
    console.log(`  ${testName}`)
    this.currentTest = { name: testName, passed: false, error: null }
  }

  pass(message = 'PASS') {
    console.log(`    PASS: ${message}`)
    this.passed++
    this.currentTest.passed = true
    this.tests.push(this.currentTest)
  }

  fail(error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`    FAIL: ${message}`)
    this.failed++
    this.currentTest.passed = false
    this.currentTest.error = message
    this.tests.push(this.currentTest)
  }

  printSummary() {
    console.log('\n' + '='.repeat(60))
    console.log(`${this.suiteName} - Test Summary`)
    console.log('='.repeat(60))
    console.log(`Passed: ${this.passed}`)
    console.log(`Failed: ${this.failed}`)
    console.log(`Total:  ${this.passed + this.failed}`)
    console.log('='.repeat(60))

    if (this.failed > 0) {
      console.log('\nFailed Tests:')
      this.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`)
      })
    }
  }

  shouldExit() {
    return this.failed > 0 ? 1 : 0
  }
}
