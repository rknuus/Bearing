/**
 * Tag-scoped bulk archive E2E test (Issue #134)
 *
 * Exercises the full tag-scoped archive flow wired up in #131–#133. Each
 * scenario picks a board scope on the EisenKan TagBoardDeck strip,
 * verifies the Done-column "Archive all" button label reflects the
 * scope, clicks the button, and asserts both the post-action UI state
 * (visible Done column count) AND the on-disk file movement under
 * `~/.bearing/data/tasks/done/` ↔ `~/.bearing/data/tasks/archived/`.
 *
 *   Scenario A — All scope:
 *     • Button label: "Archive all ✅".
 *     • Every done task (tagged + untagged) moves to archived.
 *     • Done column ends up empty.
 *
 *   Scenario B — Untagged scope:
 *     • Button label: "Archive all ✅ in Untagged".
 *     • Only the untagged done task moves to archived.
 *     • Tagged done tasks stay visible AND on disk under tasks/done/.
 *
 *   Scenario C — Specific tag scope (`home`):
 *     • Button label: "Archive all ✅ in home".
 *     • Done tasks carrying `home` — including a multi-tag task with
 *       both `home` and `work` — move to archived.
 *     • Done tasks without `home` remain in tasks/done/.
 *
 * Selector strategy: per project rule, NO data-testid attributes are
 * used. Tag-board chips are identified by their visible text on
 * `.tag-board-strip-item`. The Done column is identified by its
 * `data-column-name="done"` data attribute (already set by the view
 * for DnD reasons), and the archive button by its CSS class
 * `.archive-all-btn`.
 *
 * Prerequisites: a Wails dev server is running with `BEARING_DATA_DIR`
 * pointing to a fresh data dir (set up by `scripts/run-e2e-tests.sh`).
 */

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
  getTaskFiles,
  snapshotTaskFilenames,
  cleanupTaskResidue,
} from './test-helpers.js'

const DATA_DIR = process.env.BEARING_DATA_DIR
if (!DATA_DIR) {
  console.error('ERROR: BEARING_DATA_DIR environment variable is not set.')
  console.error('Start the Wails dev server with:')
  console.error('  BEARING_DATA_DIR=/tmp/bearing-e2e wails dev')
  process.exit(1)
}

const reporter = new TestReporter('Tag-Scoped Bulk Archive E2E Tests')

const THEME_NAME = 'Archive Scope E2E Theme'

// Done-column task fixtures. The titles double as identifiers in the UI
// and let us recover the per-task id from the tasks/done/ JSON files.
const TASK_HOME = 'Archive scope: home only'
const TASK_WORK = 'Archive scope: work only'
const TASK_HOME_WORK = 'Archive scope: home + work'
const TASK_UNTAGGED = 'Archive scope: untagged'

// One always-todo task so the deck always has at least one chip per
// tag (deck strip surfaces tags from currently-loaded tasks). Without
// this, archiving everything tagged `home` would leave the `home` board
// chip unreachable for assertions on later runs.
const TASK_TODO_ANCHOR_HOME = 'Anchor (home) — stays in todo'
const TASK_TODO_ANCHOR_WORK = 'Anchor (work) — stays in todo'

const TAG_HOME = 'home'
const TAG_WORK = 'work'

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/**
 * Reset NavigationContext to a known starting point (selectedTag = All)
 * and reload the page so the EisenKan view re-resolves from the saved
 * context. Mirrors the navigation pattern used by other E2E specs.
 */
async function navigateToEisenKan(page, selectedTag = 'All') {
  await page.evaluate(async (tag) => {
    await window.go.main.App.SaveNavigationContext({
      currentView: 'eisenkan',
      currentItem: '',
      filterThemeId: '',
      lastAccessed: new Date().toISOString(),
      expandedOkrIds: [],
      filterTagIds: [],
      todayFocusActive: false,
      tagFocusActive: false,
      calendarDayEditorDate: '',
      selectedTag: tag,
    })
  }, selectedTag)
  await page.reload({ waitUntil: 'networkidle', timeout: TEST_CONFIG.TIMEOUT })
  await page.click('.nav-link:has-text("Short-term")')
  await page.waitForSelector('.eisenkan-container', { timeout: 10000 })
  await page.waitForSelector('.tag-board-strip', { timeout: 10000 })
}

/** Click a tag-board chip by its visible text. */
async function selectBoard(page, label) {
  const chip = page.locator('.tag-board-strip-item', { hasText: new RegExp(`^${label}$`) }).first()
  await chip.waitFor({ state: 'visible', timeout: 5000 })
  await chip.click()
  // Wait until the chip reports active.
  await page.waitForFunction((expected) => {
    const items = Array.from(document.querySelectorAll('.tag-board-strip-item.active'))
    return items.some(el => (el.textContent || '').trim() === expected)
  }, label, { timeout: 5000 })
}

/** Read the archive-all button text (current label). */
async function getArchiveAllLabel(page) {
  const btn = page.locator('[data-column-name="done"] .archive-all-btn').first()
  await btn.waitFor({ state: 'visible', timeout: 5000 })
  return ((await btn.textContent()) ?? '').trim()
}

/** Read the visible Done-column task titles. */
async function readDoneTitles(page) {
  return await page
    .locator('[data-column-name="done"] .task-card .task-title')
    .allTextContents()
}

/** Click the archive-all button and wait until the Done column reflects `expectedTitles`. */
async function clickArchiveAndWait(page, expectedTitles) {
  const btn = page.locator('[data-column-name="done"] .archive-all-btn').first()
  await btn.click()
  await page.waitForFunction((expected) => {
    const titles = Array.from(
      document.querySelectorAll('[data-column-name="done"] .task-card .task-title'),
    ).map(el => (el.textContent || '').trim())
    if (titles.length !== expected.length) return false
    const titleSet = new Set(titles)
    return expected.every(t => titleSet.has(t))
  }, expectedTitles, { timeout: 10000 })
}

/**
 * Return the set of task ids currently under tasks/done/ on disk
 * (filenames are `<id>.json`). We read the file contents to map ids to
 * task titles so assertions can speak in titles.
 */
function readDiskState(dataDir) {
  const collect = (status) => {
    const files = getTaskFiles(dataDir, status)
    return files.map(name => {
      const full = path.join(dataDir, 'tasks', status, name)
      const data = JSON.parse(fs.readFileSync(full, 'utf-8'))
      return { id: data.id, title: data.title, tags: data.tags ?? [] }
    })
  }
  return { done: collect('done'), archived: collect('archived') }
}

/**
 * Restore every currently-archived task back to tasks/done/. Used between
 * scenarios so each run starts with the full done set regardless of what
 * the previous scenario archived.
 *
 * Suite-scoped cleanup at suite start (snapshotTaskFilenames) plus the
 * matching teardown means we are the only suite contributing residue
 * under tasks/archived/, so this can safely restore everything it sees.
 */
async function restoreAllArchived(page, dataDir) {
  const { archived } = readDiskState(dataDir)
  const ids = archived.map(a => a.id)
  if (ids.length === 0) return
  await page.evaluate(async (ids) => {
    const app = window.go.main.App
    for (const id of ids) {
      await app.RestoreTask(id)
    }
  }, ids)
}

/** Return the set of titles currently in `tasks/done/`. */
function diskDoneTitles(dataDir) {
  return readDiskState(dataDir).done.map(t => t.title).sort()
}

/** Return the set of titles currently in `tasks/archived/`. */
function diskArchivedTitles(dataDir) {
  return readDiskState(dataDir).archived.map(t => t.title).sort()
}

function assertSameSet(actual, expected, label) {
  const a = [...actual].sort()
  const e = [...expected].sort()
  if (JSON.stringify(a) !== JSON.stringify(e)) {
    throw new Error(`${label}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`)
  }
}

// ----------------------------------------------------------------
// Suite
// ----------------------------------------------------------------

export async function runTests() {
  console.log('Starting Tag-Scoped Bulk Archive E2E Tests...\n')
  console.log(`Data directory: ${DATA_DIR}\n`)

  // Snapshot task filenames so the `finally` block can remove anything
  // this suite added — even if a scenario crashes mid-flight, the
  // workspace ends in the same archive state it started in.
  const taskFilenameSnapshot = snapshotTaskFilenames(DATA_DIR)

  let browser
  let page
  const pageErrors = []
  const consoleErrors = []

  try {
    console.log('Checking servers...')
    await waitForServers()
    console.log('  Servers are ready\n')

    const launchOptions = {
      headless: TEST_CONFIG.HEADLESS,
      slowMo: TEST_CONFIG.SLOW_MO,
    }
    if (TEST_CONFIG.CHROME_CHANNEL) {
      launchOptions.channel = TEST_CONFIG.CHROME_CHANNEL
    }
    browser = await chromium.launch(launchOptions)
    page = await browser.newPage()

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
      console.log(`  [pageerror] ${error.message}`)
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (text.includes('[vite]')) return
        if (text.includes('Failed to load resource')) return
        if (text.includes('WebSocket')) return
        consoleErrors.push(text)
      }
      if (msg.type() === 'warning' && msg.text().includes('[state-check]')) {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto(TEST_CONFIG.WAILS_DEV_URL, {
      waitUntil: 'networkidle',
      timeout: TEST_CONFIG.TIMEOUT,
    })

    // ================================================================
    // Setup: theme + 4 done tasks (mixed tags) + 2 todo anchor tasks
    //
    // Done set (this is the working set for all three scenarios):
    //   • TASK_HOME       → tags: [home]
    //   • TASK_WORK       → tags: [work]
    //   • TASK_HOME_WORK  → tags: [home, work]   (multi-tag fixture)
    //   • TASK_UNTAGGED   → tags: []
    //
    // Anchor set (kept in todo, never archived; ensures the `home` and
    // `work` chips remain present in the strip across scenarios):
    //   • TASK_TODO_ANCHOR_HOME  → tags: [home]
    //   • TASK_TODO_ANCHOR_WORK  → tags: [work]
    // ================================================================

    let themeId
    let homeId, workId, homeWorkId, untaggedId
    let anchorHomeId, anchorWorkId

    reporter.startTest('Setup: theme + 4 done tasks (mixed tags) + 2 todo anchors')
    try {
      const ids = await page.evaluate(async ({ themeName, titles, tagHome, tagWork }) => {
        const app = window.go.main.App
        const themeResult = await app.Establish({ goalType: 'theme', name: themeName, color: '#f97316' })
        const themeId = themeResult.theme.id

        // Anchor todos — never archived, exist purely so the `home` /
        // `work` chips remain present in the TagBoardDeck strip.
        const anchorHome = await app.CreateTask(titles.anchorHome, themeId, 'important-urgent', '', tagHome, '')
        const anchorWork = await app.CreateTask(titles.anchorWork, themeId, 'important-urgent', '', tagWork, '')

        // Done set. CreateTask + MoveTask -> 'done' (priority cleared).
        // CreateTask signature: (title, themeId, priority, description, tags, promotionDate)
        // Tags are passed comma-separated.
        const home = await app.CreateTask(titles.home, themeId, 'important-urgent', '', tagHome, '')
        const work = await app.CreateTask(titles.work, themeId, 'important-urgent', '', tagWork, '')
        const homeWork = await app.CreateTask(titles.homeWork, themeId, 'important-urgent', '', `${tagHome},${tagWork}`, '')
        const untagged = await app.CreateTask(titles.untagged, themeId, 'important-urgent', '', '', '')

        await app.MoveTask(home.id, 'done', '', null)
        await app.MoveTask(work.id, 'done', '', null)
        await app.MoveTask(homeWork.id, 'done', '', null)
        await app.MoveTask(untagged.id, 'done', '', null)

        return {
          themeId,
          homeId: home.id,
          workId: work.id,
          homeWorkId: homeWork.id,
          untaggedId: untagged.id,
          anchorHomeId: anchorHome.id,
          anchorWorkId: anchorWork.id,
        }
      }, {
        themeName: THEME_NAME,
        tagHome: TAG_HOME,
        tagWork: TAG_WORK,
        titles: {
          home: TASK_HOME,
          work: TASK_WORK,
          homeWork: TASK_HOME_WORK,
          untagged: TASK_UNTAGGED,
          anchorHome: TASK_TODO_ANCHOR_HOME,
          anchorWork: TASK_TODO_ANCHOR_WORK,
        },
      })

      themeId = ids.themeId
      homeId = ids.homeId
      workId = ids.workId
      homeWorkId = ids.homeWorkId
      untaggedId = ids.untaggedId
      anchorHomeId = ids.anchorHomeId
      anchorWorkId = ids.anchorWorkId

      // Sanity-check the disk: all four done-set tasks land under tasks/done/.
      const initialDone = diskDoneTitles(DATA_DIR)
      const expectedDone = [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED]
      for (const t of expectedDone) {
        if (!initialDone.includes(t)) {
          throw new Error(`Setup: expected "${t}" in tasks/done/, got ${JSON.stringify(initialDone)}`)
        }
      }
      reporter.pass(`themeId=${themeId} done set seeded: ${JSON.stringify(expectedDone)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Scenario A — All scope
    // ================================================================

    reporter.startTest('All scope: button label is "Archive all ✅"')
    try {
      await navigateToEisenKan(page, 'All')
      // Confirm we're on the All chip (navigateToEisenKan pinned it).
      await selectBoard(page, 'All')
      const label = await getArchiveAllLabel(page)
      if (label !== 'Archive all ✅') {
        throw new Error(`Expected label "Archive all ✅", got "${label}"`)
      }
      reporter.pass(`label="${label}"`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('All scope: click Archive all moves every done task to archived')
    try {
      // Pre-condition: all four done titles are visible.
      const before = await readDoneTitles(page)
      const expectedBefore = [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED]
      for (const t of expectedBefore) {
        if (!before.includes(t)) {
          throw new Error(`Pre-condition: expected "${t}" in Done column, got ${JSON.stringify(before)}`)
        }
      }
      await clickArchiveAndWait(page, [])
      reporter.pass('Done column emptied via Archive all (All scope)')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('All scope: Done column is empty after archive')
    try {
      const after = await readDoneTitles(page)
      if (after.length !== 0) {
        throw new Error(`Expected empty Done column, got ${JSON.stringify(after)}`)
      }
      reporter.pass('Done column is empty')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('All scope: tasks/done is empty of seeded titles and all 4 are under tasks/archived')
    try {
      const done = diskDoneTitles(DATA_DIR)
      const archived = diskArchivedTitles(DATA_DIR)
      const seeded = [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED]
      for (const t of seeded) {
        if (done.includes(t)) {
          throw new Error(`Disk: expected "${t}" not under tasks/done/, but it is. tasks/done=${JSON.stringify(done)}`)
        }
        if (!archived.includes(t)) {
          throw new Error(`Disk: expected "${t}" under tasks/archived/, but missing. tasks/archived=${JSON.stringify(archived)}`)
        }
      }
      reporter.pass(`tasks/archived contains all seeded done titles`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Scenario B — Untagged scope
    //
    // Restore everything first so we start from the full done set.
    // ================================================================

    reporter.startTest('Untagged scope: restore previous archive set so the done set is whole again')
    try {
      await restoreAllArchived(page, DATA_DIR)
      const done = diskDoneTitles(DATA_DIR)
      for (const t of [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED]) {
        if (!done.includes(t)) {
          throw new Error(`Restore: expected "${t}" back under tasks/done/, got ${JSON.stringify(done)}`)
        }
      }
      reporter.pass(`tasks/done (filtered to seeded) contains all four seeded titles`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Untagged scope: button label is "Archive all ✅ in Untagged"')
    try {
      await navigateToEisenKan(page, 'All')
      await selectBoard(page, 'Untagged')
      const label = await getArchiveAllLabel(page)
      if (label !== 'Archive all ✅ in Untagged') {
        throw new Error(`Expected label "Archive all ✅ in Untagged", got "${label}"`)
      }
      reporter.pass(`label="${label}"`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Untagged scope: only untagged done task moved to archived (UI)')
    try {
      // Pre-condition on the Untagged board: among the seeded set,
      // only TASK_UNTAGGED is visible in the Done column. We filter to
      // the seeded subset so the assertion stays robust against any
      // residue a manual probe (or a future shared workspace fixture)
      // might place under tasks/done/.
      const seededTitles = [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED]
      const before = await readDoneTitles(page)
      const beforeSeeded = before.filter(t => seededTitles.includes(t)).sort()
      if (JSON.stringify(beforeSeeded) !== JSON.stringify([TASK_UNTAGGED])) {
        throw new Error(`Pre-condition: among seeded tasks, expected Done = ["${TASK_UNTAGGED}"] on Untagged board, got ${JSON.stringify(beforeSeeded)}`)
      }
      // Click and wait until our seeded TASK_UNTAGGED is gone from the
      // Untagged board's Done column. Any other untagged task that
      // happens to share the workspace (e.g. a manual residue probe)
      // may also be archived in the same call — that's outside this
      // assertion's scope.
      const btn = page.locator('[data-column-name="done"] .archive-all-btn').first()
      await btn.click()
      await page.waitForFunction((ourTitle) => {
        const titles = Array.from(
          document.querySelectorAll('[data-column-name="done"] .task-card .task-title'),
        ).map(el => (el.textContent || '').trim())
        return !titles.includes(ourTitle)
      }, TASK_UNTAGGED, { timeout: 10000 })
      const after = await readDoneTitles(page)
      const afterSeeded = after.filter(t => seededTitles.includes(t)).sort()
      if (afterSeeded.length !== 0) {
        throw new Error(`Expected no seeded tasks in Done on Untagged board after archive, got ${JSON.stringify(afterSeeded)}`)
      }
      reporter.pass('TASK_UNTAGGED no longer in Untagged Done column; tagged done tasks unaffected on this board view')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Untagged scope: tagged done tasks remain visible on All board AND on disk')
    try {
      // Switch back to All to confirm the three tagged done tasks still
      // populate the Done column.
      await selectBoard(page, 'All')
      const all = await readDoneTitles(page)
      const expectedTagged = [TASK_HOME, TASK_WORK, TASK_HOME_WORK]
      for (const t of expectedTagged) {
        if (!all.includes(t)) {
          throw new Error(`Expected "${t}" still visible on All board's Done column, got ${JSON.stringify(all)}`)
        }
      }
      if (all.includes(TASK_UNTAGGED)) {
        throw new Error(`Did not expect "${TASK_UNTAGGED}" still on All board's Done column, got ${JSON.stringify(all)}`)
      }

      // Disk: the three tagged done tasks remain under tasks/done/, the
      // untagged seeded task is under tasks/archived/.
      const done = diskDoneTitles(DATA_DIR)
      const archived = diskArchivedTitles(DATA_DIR)
      for (const t of expectedTagged) {
        if (!done.includes(t)) {
          throw new Error(`Disk: expected "${t}" still under tasks/done/, got ${JSON.stringify(done)}`)
        }
      }
      if (done.includes(TASK_UNTAGGED)) {
        throw new Error(`Disk: expected "${TASK_UNTAGGED}" not under tasks/done/, got ${JSON.stringify(done)}`)
      }
      if (!archived.includes(TASK_UNTAGGED)) {
        throw new Error(`Disk: expected "${TASK_UNTAGGED}" under tasks/archived/, got ${JSON.stringify(archived)}`)
      }
      reporter.pass(`tagged done tasks intact; only untagged was archived`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Scenario C — Specific tag scope (`home`)
    //
    // Restore everything first so we start from the full done set.
    // ================================================================

    reporter.startTest('Specific tag scope: restore previous archive set so the done set is whole again')
    try {
      await restoreAllArchived(page, DATA_DIR)
      const done = diskDoneTitles(DATA_DIR)
      for (const t of [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED]) {
        if (!done.includes(t)) {
          throw new Error(`Restore: expected "${t}" back under tasks/done/, got ${JSON.stringify(done)}`)
        }
      }
      reporter.pass(`tasks/done (filtered to seeded) contains all four seeded titles`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest(`Specific tag scope: button label is "Archive all ✅ in ${TAG_HOME}"`)
    try {
      await navigateToEisenKan(page, 'All')
      await selectBoard(page, TAG_HOME)
      const label = await getArchiveAllLabel(page)
      const expected = `Archive all ✅ in ${TAG_HOME}`
      if (label !== expected) {
        throw new Error(`Expected label "${expected}", got "${label}"`)
      }
      reporter.pass(`label="${label}"`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest(`Specific tag scope: tasks carrying "${TAG_HOME}" (incl. multi-tag) moved to archived`)
    try {
      // Pre-condition on the home board: TASK_HOME and TASK_HOME_WORK
      // are visible in the Done column. TASK_WORK and TASK_UNTAGGED are
      // filtered out.
      const before = await readDoneTitles(page)
      const expectedBefore = [TASK_HOME, TASK_HOME_WORK]
      for (const t of expectedBefore) {
        if (!before.includes(t)) {
          throw new Error(`Pre-condition: expected "${t}" on ${TAG_HOME} board's Done column, got ${JSON.stringify(before)}`)
        }
      }
      if (before.includes(TASK_WORK) || before.includes(TASK_UNTAGGED)) {
        throw new Error(`Pre-condition: did not expect work-only / untagged tasks on ${TAG_HOME} board's Done column, got ${JSON.stringify(before)}`)
      }

      await clickArchiveAndWait(page, [])
      const after = await readDoneTitles(page)
      if (after.length !== 0) {
        throw new Error(`Expected empty Done column on ${TAG_HOME} board after archive, got ${JSON.stringify(after)}`)
      }
      reporter.pass('home Done column emptied via Archive all in home')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest(`Specific tag scope: tasks without "${TAG_HOME}" remain in done (UI + disk)`)
    try {
      // Disk: TASK_HOME and TASK_HOME_WORK now under tasks/archived/;
      // TASK_WORK and TASK_UNTAGGED still under tasks/done/.
      const done = diskDoneTitles(DATA_DIR)
      const archived = diskArchivedTitles(DATA_DIR)

      assertSameSet(
        done.filter(t => [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED].includes(t)),
        [TASK_WORK, TASK_UNTAGGED],
        'tasks/done (filtered to seeded set)',
      )
      assertSameSet(
        archived.filter(t => [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED].includes(t)),
        [TASK_HOME, TASK_HOME_WORK],
        'tasks/archived (filtered to seeded set)',
      )

      // UI: switch to All, the Done column shows only TASK_WORK and
      // TASK_UNTAGGED out of the original four.
      await selectBoard(page, 'All')
      const titles = await readDoneTitles(page)
      const filtered = titles.filter(t => [TASK_HOME, TASK_WORK, TASK_HOME_WORK, TASK_UNTAGGED].includes(t)).sort()
      const expected = [TASK_WORK, TASK_UNTAGGED].sort()
      if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
        throw new Error(`Expected Done column on All board to show ${JSON.stringify(expected)}, got ${JSON.stringify(filtered)}`)
      }
      reporter.pass(`tasks without "${TAG_HOME}" remain: ${JSON.stringify(expected)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Cleanup
    // ================================================================

    reporter.startTest('Cleanup: delete tasks and theme')
    try {
      await page.evaluate(async ({ ids, themeId }) => {
        const app = window.go.main.App
        for (const id of ids) {
          if (id) {
            try {
              await app.DeleteTask(id)
            } catch {
              // Ignore — task may already be archived/deleted by a previous step.
            }
          }
        }
        if (themeId) await app.Dismiss(themeId)
      }, {
        ids: [homeId, workId, homeWorkId, untaggedId, anchorHomeId, anchorWorkId],
        themeId,
      })
      reporter.pass('Tasks and theme deleted')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Final: no page errors and no [state-check] warnings')
    try {
      if (pageErrors.length > 0) {
        throw new Error(`Page errors: ${pageErrors.join('; ')}`)
      }
      if (consoleErrors.length > 0) {
        throw new Error(`Console errors / state-check warnings: ${consoleErrors.join('; ')}`)
      }
      reporter.pass('No errors')
    } catch (err) {
      reporter.fail(err)
    }
  } catch (err) {
    console.error('\nFatal error:', err)
  } finally {
    // Suite-scoped cleanup: route through the backend so the data-dir
    // git repository stays consistent. Runs before browser.close() so
    // `page.evaluate` is still available, and even when a scenario
    // crashes mid-flight so the workspace ends in the same archive
    // state it started in.
    if (page) {
      try {
        await cleanupTaskResidue(page, DATA_DIR, taskFilenameSnapshot)
      } catch (err) {
        console.log(`  [cleanup] error: ${err.message}`)
      }
    }
    if (browser) {
      await browser.close()
    }
    reporter.printSummary()
    process.exit(reporter.shouldExit())
  }
}

runTests()
