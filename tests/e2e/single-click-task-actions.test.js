/**
 * Single-click task actions E2E test
 *
 * Regression coverage for issue #114: the trash, archive, and restore buttons
 * on EisenKan task cards required two clicks to fire because svelte-dnd-action
 * attaches a native mousedown listener on the draggable container that calls
 * preventDefault, swallowing the browser's click-event generation. The fix
 * attaches a native mousedown/touchstart listener on each button via a Svelte
 * action so the dndzone listener never sees the event.
 *
 * This test exercises the full backend path through the Wails dev server:
 *
 *   1. Create a theme + a single task in the EisenKan U&I quadrant.
 *   2. Click the trash button on the card exactly once.
 *   3. Verify the card disappears, the on-disk task file is gone, and the
 *      backend git history records exactly one commit for the deletion.
 *
 * Selector strategy: per project rule, NO data-testid attributes are used.
 * The trash button is identified by its existing aria-label "Delete task".
 *
 * Prerequisites: same as the other E2E tests in this directory — a Wails dev
 * server must be running with BEARING_DATA_DIR pointing to a fresh data dir.
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
  assertFileExists,
  assertFileNotExists,
  getGitCommitCount,
} from './test-helpers.js'

const DATA_DIR = process.env.BEARING_DATA_DIR
if (!DATA_DIR) {
  console.error('ERROR: BEARING_DATA_DIR environment variable is not set.')
  console.error('Start the Wails dev server with:')
  console.error('  BEARING_DATA_DIR=/tmp/bearing-e2e wails dev')
  console.error('Then run tests with:')
  console.error('  BEARING_DATA_DIR=/tmp/bearing-e2e npm test')
  process.exit(1)
}

const reporter = new TestReporter('Single-Click Task Actions E2E Tests')

const THEME_NAME = 'Single Click E2E Theme'
const TASK_TITLE = 'Single click delete subject'

export async function runTests() {
  console.log('Starting Single-Click Task Actions E2E Tests...\n')
  console.log(`Data directory: ${DATA_DIR}\n`)

  let browser
  const pageErrors = []
  const consoleErrors = []

  try {
    console.log('Checking servers...')
    await waitForServers()
    console.log('  Servers are ready\n')

    console.log('Launching browser...')
    const launchOptions = {
      headless: TEST_CONFIG.HEADLESS,
      slowMo: TEST_CONFIG.SLOW_MO,
    }
    if (TEST_CONFIG.CHROME_CHANNEL) {
      launchOptions.channel = TEST_CONFIG.CHROME_CHANNEL
    }
    browser = await chromium.launch(launchOptions)
    console.log('  Browser launched\n')

    const page = await browser.newPage()

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
    // Setup: theme + one task in EisenKan U&I
    // ================================================================

    let taskId, themeId

    reporter.startTest('Setup: create theme + one task in todo / important-urgent')
    try {
      const ids = await page.evaluate(async ({ themeName, taskTitle }) => {
        const app = window.go.main.App
        const themeResult = await app.Establish({ goalType: 'theme', name: themeName, color: '#0ea5e9' })
        const themeId = themeResult.theme.id
        const task = await app.CreateTask(taskTitle, themeId, 'important-urgent', '', '', '')
        return { themeId, taskId: task.id }
      }, { themeName: THEME_NAME, taskTitle: TASK_TITLE })

      themeId = ids.themeId
      taskId = ids.taskId

      assertFileExists(DATA_DIR, `tasks/todo/${taskId}.json`)
      reporter.pass(`theme=${themeId} task=${taskId}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Navigate to EisenKan and verify the card is rendered
    // ================================================================

    reporter.startTest('Navigate to EisenKan and verify task card is visible')
    try {
      // Reset NavigationContext so the EisenKan view shows all tasks (any prior
      // suite's tag/theme filter would otherwise hide our seeded card).
      await page.evaluate(async () => {
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
        })
      })
      await page.reload({ waitUntil: 'networkidle', timeout: TEST_CONFIG.TIMEOUT })
      await page.click('.nav-link:has-text("Short-term")')
      await page.waitForSelector('.eisenkan-container', { timeout: 10000 })

      const card = page.locator(`.task-card:has(.task-title:has-text("${TASK_TITLE}"))`).first()
      await card.waitFor({ state: 'visible', timeout: 15000 })
      reporter.pass('Task card rendered')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // The actual single-click test: one click on the trash button
    // ================================================================

    const commitsBefore = getGitCommitCount(DATA_DIR)

    reporter.startTest('Single click on trash button deletes the task on the first click')
    try {
      const card = page.locator(`.task-card:has(.task-title:has-text("${TASK_TITLE}"))`).first()
      const deleteBtn = card.locator('button[aria-label="Delete task"]')
      await deleteBtn.waitFor({ state: 'visible', timeout: 5000 })

      // ONE click. Before the fix this was a no-op (the click was eaten by
      // svelte-dnd-action's preventDefault on mousedown). After the fix the
      // task is deleted on the first click.
      await deleteBtn.click()

      // The card should disappear. Wait with a tight upper bound — if the bug
      // regresses, the card stays put and the second click never comes.
      await page.locator(`.task-card:has(.task-title:has-text("${TASK_TITLE}"))`).waitFor({
        state: 'detached',
        timeout: 5000,
      })
      reporter.pass('Card removed after a single click')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Backend: task file deleted and exactly one new commit recorded')
    try {
      assertFileNotExists(DATA_DIR, `tasks/todo/${taskId}.json`)
      const commitsAfter = getGitCommitCount(DATA_DIR)
      const delta = commitsAfter - commitsBefore
      if (delta !== 1) {
        throw new Error(`Expected exactly 1 new commit for the deletion, got ${delta}`)
      }
      reporter.pass(`tasks/todo/${taskId}.json removed; ${delta} commit recorded`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Cleanup: remove the theme
    // ================================================================

    reporter.startTest('Cleanup: dismiss theme')
    try {
      await page.evaluate(async ({ themeId }) => {
        const app = window.go.main.App
        if (themeId) await app.Dismiss(themeId)
      }, { themeId })
      reporter.pass('Theme dismissed')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Final: verify no page errors / console errors
    // ================================================================

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
    if (browser) {
      await browser.close()
    }

    reporter.printSummary()
    process.exit(reporter.shouldExit())
  }
}

runTests()
