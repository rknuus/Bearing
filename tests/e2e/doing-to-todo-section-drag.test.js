/**
 * Doing → Todo section drag E2E test
 *
 * Regression coverage for the bug originally reported as "Add day closing
 * workflow" landing in I&NU after being dropped on U&I, with a [state-check]
 * task-order mismatch warning. Root cause: `MoveTask` updated only the task's
 * status, never its priority — so the task's derived drop zone (from priority)
 * remained the stale value, while task_order.json carried positions under the
 * destination section's zone key. The fix extends `MoveTask` to accept an
 * optional newPriority and rewrite the priority atomically with the move.
 *
 * This test exercises the full backend path through the Wails dev server:
 *
 *   1. Create a theme + task (priority = important-not-urgent) in todo.
 *   2. Move task → doing (status changes; priority field unchanged).
 *   3. Seed two tasks in todo / important-urgent so we can assert position.
 *   4. Move the doing task back to todo with newPriority='important-urgent'
 *      and explicit positions placing it at index 1 (between the two seeded
 *      U&I tasks).
 *   5. Verify on disk:
 *        - task file's priority is now 'important-urgent'
 *        - task is at index 1 in task_order.json["important-urgent"]
 *        - task is NOT present in task_order.json["important-not-urgent"]
 *        - task is NOT present in task_order.json["doing"]
 *   6. Verify in the UI:
 *        - the task card is rendered inside the U&I section at index 1
 *        - the task card is NOT rendered inside any other Todo section
 *   7. No page errors. No `[state-check]` warning was emitted.
 *
 * Selector strategy: per project rule, NO data-testid attributes are used.
 * Card identification uses task title text and existing CSS class hierarchy.
 *
 * Prerequisites: same as the other E2E tests in this directory — a Wails dev
 * server must be running with BEARING_DATA_DIR pointing to a fresh data dir.
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
  readJSON,
  assertFileExists,
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

const reporter = new TestReporter('Doing → Todo Section Drag E2E Tests')

const THEME_NAME = 'Section Drag E2E Theme'

// Task titles — the original repro task title is used so future maintainers can
// grep for "Add day closing workflow" and find the regression test.
const SUBJECT_TITLE = 'Add day closing workflow'
const URGENT_BEFORE_TITLE = 'Section Drag U&I Before'
const URGENT_AFTER_TITLE = 'Section Drag U&I After'

export async function runTests() {
  console.log('Starting Doing → Todo Section Drag E2E Tests...\n')
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
    // Setup: theme + three tasks
    // ================================================================

    let subjectId, beforeId, afterId, themeId

    reporter.startTest('Setup: create theme and seed three tasks (1 doing + 2 U&I)')
    try {
      const ids = await page.evaluate(async ({ themeName, subjectTitle, beforeTitle, afterTitle }) => {
        const app = window.go.main.App
        const themeResult = await app.Establish({ goalType: 'theme', name: themeName, color: '#0ea5e9' })
        const themeId = themeResult.theme.id

        // The subject task: create in todo with priority I&NU, then move to
        // doing. Its priority field remains I&NU (stale) — exactly the state
        // that produced the original bug.
        const subject = await app.CreateTask(subjectTitle, themeId, 'important-not-urgent', '', '', '')
        await app.MoveTask(subject.id, 'doing', '', null)

        // Two existing U&I tasks so we can drop the subject between them.
        const before = await app.CreateTask(beforeTitle, themeId, 'important-urgent', '', '', '')
        const after = await app.CreateTask(afterTitle, themeId, 'important-urgent', '', '', '')

        return { themeId, subjectId: subject.id, beforeId: before.id, afterId: after.id }
      }, { themeName: THEME_NAME, subjectTitle: SUBJECT_TITLE, beforeTitle: URGENT_BEFORE_TITLE, afterTitle: URGENT_AFTER_TITLE })

      themeId = ids.themeId
      subjectId = ids.subjectId
      beforeId = ids.beforeId
      afterId = ids.afterId

      assertFileExists(DATA_DIR, `tasks/doing/${subjectId}.json`)
      assertFileExists(DATA_DIR, `tasks/todo/${beforeId}.json`)
      assertFileExists(DATA_DIR, `tasks/todo/${afterId}.json`)

      const subjectFile = readJSON(DATA_DIR, `tasks/doing/${subjectId}.json`)
      if (subjectFile.priority !== 'important-not-urgent') {
        throw new Error(`Setup precondition: subject task priority should still be I&NU (got "${subjectFile.priority}")`)
      }

      reporter.pass(`theme=${themeId} subject=${subjectId}, before=${beforeId}, after=${afterId}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Repro: drag subject from doing → todo / important-urgent at index 1
    // ================================================================

    reporter.startTest('Move subject from Doing → Todo / U&I at index 1 (between the two U&I tasks)')
    try {
      const result = await page.evaluate(async ({ subjectId, beforeId, afterId }) => {
        const app = window.go.main.App
        // The exact call the frontend now makes after the fix: pass the
        // destination section as newPriority, with positions for the U&I zone
        // placing the subject between the two existing tasks.
        return await app.MoveTask(subjectId, 'todo', 'important-urgent', {
          'important-urgent': [beforeId, subjectId, afterId],
        })
      }, { subjectId, beforeId, afterId })

      if (!result || !result.success) {
        throw new Error(`MoveTask did not succeed: ${JSON.stringify(result)}`)
      }
      reporter.pass('MoveTask succeeded')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Disk-level assertions
    // ================================================================

    reporter.startTest('Subject task file moved to todo/ with priority rewritten to important-urgent')
    try {
      assertFileExists(DATA_DIR, `tasks/todo/${subjectId}.json`)
      const subjectFile = readJSON(DATA_DIR, `tasks/todo/${subjectId}.json`)
      if (subjectFile.priority !== 'important-urgent') {
        throw new Error(`Expected priority "important-urgent", got "${subjectFile.priority}"`)
      }
      if (subjectFile.themeId !== themeId) {
        throw new Error(`Expected themeId "${themeId}", got "${subjectFile.themeId}"`)
      }
      reporter.pass(`tasks/todo/${subjectId}.json: priority=${subjectFile.priority}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('task_order.json: subject at index 1 in important-urgent, absent from old zones')
    try {
      const order = readJSON(DATA_DIR, 'task_order.json')
      const iu = order['important-urgent'] || []
      const inu = order['important-not-urgent'] || []
      const doing = order['doing'] || []

      const idx = iu.indexOf(subjectId)
      if (idx !== 1) {
        throw new Error(`Subject should be at index 1 in important-urgent, got index ${idx} (zone=${JSON.stringify(iu)})`)
      }
      if (iu[0] !== beforeId || iu[2] !== afterId) {
        throw new Error(`Surrounding U&I tasks misordered: got ${JSON.stringify(iu)}`)
      }
      if (inu.includes(subjectId)) {
        throw new Error(`Subject should NOT be in important-not-urgent zone, got ${JSON.stringify(inu)}`)
      }
      if (doing.includes(subjectId)) {
        throw new Error(`Subject should NOT be in doing zone, got ${JSON.stringify(doing)}`)
      }
      reporter.pass(`important-urgent zone: ${JSON.stringify(iu)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // UI-level assertions: the task card is in the U&I section
    // ================================================================

    reporter.startTest('UI: subject card appears in U&I section at index 1, not in I&NU')
    try {
      // The shared E2E data dir carries a NavigationContext from prior test
      // suites that may have an active tag/theme filter (e.g. filterTagIds:
      // ["Routine"]). Reset it to a neutral state so the EisenKan view shows
      // all tasks, not just the previous suite's filter slice. Pin
      // selectedTag to `All` so the focus-aware default-board rule (US-1,
      // #123) doesn't surface a tag-specific board when prior suites have
      // left day-focus tags set for today.
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
          selectedTag: 'All',
        })
      })
      await page.reload({ waitUntil: 'networkidle', timeout: TEST_CONFIG.TIMEOUT })
      await page.click('.nav-link:has-text("Short-term")')
      await page.waitForSelector('.eisenkan-container', { timeout: 10000 })

      // Wait for the subject task card to render anywhere on the board.
      await page.locator(`.task-card:has(.task-title:has-text("${SUBJECT_TITLE}"))`).first().waitFor({ state: 'visible', timeout: 15000 })

      // Read all U&I card titles in DOM order; subject must be at index 1.
      const uiTitles = await page.locator('.column-section.section-important-urgent .task-card .task-title').allTextContents()
      const idx = uiTitles.indexOf(SUBJECT_TITLE)
      if (idx !== 1) {
        throw new Error(`Subject should be at index 1 in U&I section, got index ${idx} (titles=${JSON.stringify(uiTitles)})`)
      }

      // Subject must NOT appear in I&NU.
      const inuTitles = await page.locator('.column-section.section-important-not-urgent .task-card .task-title').allTextContents()
      if (inuTitles.includes(SUBJECT_TITLE)) {
        throw new Error(`Subject should NOT be visible in I&NU section, got ${JSON.stringify(inuTitles)}`)
      }
      // Subject must NOT appear in N-I&U either.
      const niuTitles = await page.locator('.column-section.section-not-important-urgent .task-card .task-title').allTextContents()
      if (niuTitles.includes(SUBJECT_TITLE)) {
        throw new Error(`Subject should NOT be visible in N-I&U section, got ${JSON.stringify(niuTitles)}`)
      }

      reporter.pass(`U&I section titles: ${JSON.stringify(uiTitles)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Cleanup: delete the test tasks and theme to avoid polluting subsequent tests
    // ================================================================

    reporter.startTest('Cleanup: delete tasks and theme')
    try {
      await page.evaluate(async ({ subjectId, beforeId, afterId, themeId }) => {
        const app = window.go.main.App
        for (const id of [subjectId, beforeId, afterId]) {
          if (id) await app.DeleteTask(id)
        }
        if (themeId) await app.Dismiss(themeId)
      }, { subjectId, beforeId, afterId, themeId })
      reporter.pass('Tasks and theme deleted')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Final: verify no page errors / console errors / state-check warnings
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
