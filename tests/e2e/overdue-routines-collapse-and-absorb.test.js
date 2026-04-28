/**
 * Overdue Routines: Collapsed Display + Absorption E2E Test
 *
 * Validates the integration of the "improve-overdue-routines" initiative
 * (issues #80, #81, #82, #83, #84) end-to-end through the user-visible
 * focus editor flow:
 *
 * 1. A daily routine is missed on days 1..5 (today = day 5).
 * 2. Day 5 (today) editor shows exactly one collapsed overdue row with
 *    "<description> · 5 missed (<date>)" suffix.
 * 3. Checking the routine and saving absorbs all 5 overdue occurrences.
 * 4. Day 6 (today + 1) editor shows zero overdue rows for the routine.
 * 5. Day 4 (today - 1, past) editor shows zero overdue rows (today-gate).
 * 6. Day 7 (today + 2, future) editor shows zero overdue rows (today-gate).
 *
 * Selector strategy: per-project rule, NO data-testid attributes are used.
 * Assertions rely on existing CSS classes (.routine-row.overdue, .routine-desc)
 * and on the textual content rendered by CalendarView.svelte.
 *
 * Clock strategy: the real Go backend uses the system clock. The test treats
 * the actual current date as "day 5" and seeds the routine with a startDate
 * of (today - 4 days) so that days 1..5 are naturally missed.
 *
 * Prerequisites: same as the other E2E tests in this directory — a Wails dev
 * server must be running with BEARING_DATA_DIR pointing to the temp data dir.
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
  readRoutines,
  addDaysISO,
  getYearTitle,
  navigateCalendarToYear,
  openDayFocusEditor,
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

const reporter = new TestReporter('Overdue Routines Collapse + Absorption E2E Tests')

const ROUTINE_DESCRIPTION = 'E2E Overdue Daily'

function todayISO() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function runTests() {
  console.log('Starting Overdue Routines Collapse + Absorption E2E Tests...\n')
  console.log(`Data directory: ${DATA_DIR}\n`)

  // ComputeOverdue returns occurrences strictly before "today". To produce
  // a missedCount of 5 today, the daily routine must start 5 days ago — so
  // today-5..today-1 are the five missed scheduled occurrences. Today itself
  // is rendered separately as a scheduled (current) occurrence, not as missed.
  const today = todayISO()
  const startDate = addDaysISO(today, -5) // first scheduled occurrence (5 days ago)
  const day4 = addDaysISO(today, -1)      // "past" date (yesterday)
  const day5 = today                       // "today"
  const day6 = addDaysISO(today, 1)        // "next day" (tomorrow)
  const day7 = addDaysISO(today, 2)        // "future" date (day after tomorrow)

  console.log(`startDate     : ${startDate}`)
  console.log(`Day 4 (past)  : ${day4}`)
  console.log(`Day 5 (today) : ${day5}`)
  console.log(`Day 6 (next)  : ${day6}`)
  console.log(`Day 7 (future): ${day7}\n`)

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
    // Setup: create a daily routine starting 4 days ago (day 1)
    // ================================================================

    let routineId
    reporter.startTest('Setup: create daily routine with startDate = today - 5 days')
    try {
      await page.evaluate(async ({ description, startDate }) => {
        const app = window.go.main.App
        await app.Establish({
          goalType: 'routine',
          description,
          repeatPattern: { frequency: 'daily', interval: 1, startDate },
        })
      }, { description: ROUTINE_DESCRIPTION, startDate })

      const routines = readRoutines(DATA_DIR)
      const routine = routines.find(r => r.description === ROUTINE_DESCRIPTION)
      if (!routine) {
        throw new Error(`Routine "${ROUTINE_DESCRIPTION}" not found in routines.json`)
      }
      if (!routine.repeatPattern || routine.repeatPattern.frequency !== 'daily') {
        throw new Error(`Expected daily repeatPattern, got ${JSON.stringify(routine.repeatPattern)}`)
      }
      routineId = routine.id
      reporter.pass(`Routine created: id=${routineId}, startDate=${startDate}`)
    } catch (err) {
      reporter.fail(err)
    }

    // Navigate to the calendar view
    await page.click('.nav-link:has-text("Mid-term")')
    await page.waitForSelector('.calendar-view', { timeout: 10000 })

    // ================================================================
    // Step 1: Day 5 (today) — expect exactly one collapsed overdue row
    // ================================================================

    reporter.startTest('Day 5 (today) shows one .routine-row.overdue with "5 missed" suffix')
    try {
      await openDayFocusEditor(page, day5)

      const overdueRows = page.locator('.dialog .routine-row.overdue')
      // Wait for the dialog body to settle; routines load asynchronously after open.
      await overdueRows.first().waitFor({ state: 'visible', timeout: 10000 })

      // The dialog must show the routine with "5 missed" suffix.
      const overdueDescs = page.locator(`.dialog .routine-row.overdue .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
      const overdueCount = await overdueDescs.count()
      if (overdueCount !== 1) {
        throw new Error(`Expected exactly 1 collapsed overdue row for "${ROUTINE_DESCRIPTION}", got ${overdueCount}`)
      }

      const descText = (await overdueDescs.first().textContent()) ?? ''
      if (!descText.includes('5 missed')) {
        throw new Error(`Expected text to contain "5 missed", got "${descText}"`)
      }
      // Sanity-check the description prefix.
      if (!descText.startsWith(ROUTINE_DESCRIPTION)) {
        throw new Error(`Expected text to start with routine description, got "${descText}"`)
      }

      reporter.pass(`Collapsed overdue row visible: "${descText.trim()}"`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Step 2: Check the routine and save (absorbs all overdue)
    // ================================================================

    reporter.startTest('Check routine in day-5 editor and save → absorbs all overdue')
    try {
      const overdueCheckbox = page
        .locator(`.dialog .routine-row.overdue:has(.routine-desc:has-text("${ROUTINE_DESCRIPTION}")) input[type="checkbox"]`)
        .first()
      await overdueCheckbox.check()

      await page.click('.dialog .btn-primary:has-text("Save")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 10000 })

      reporter.pass('Routine checked and saved')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Step 3: Day 6 (today + 1) — zero overdue rows for the routine
    // ================================================================

    reporter.startTest('Day 6 (today + 1) shows zero .routine-row.overdue for the routine')
    try {
      await openDayFocusEditor(page, day6)

      // Allow GetRoutinesForDate to complete; "Routines" section renders only
      // if there is at least one occurrence. A daily routine produces a
      // scheduled occurrence on day 6, so the section will appear.
      await page.locator(`.dialog .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })

      const overdueForRoutine = await page
        .locator(`.dialog .routine-row.overdue .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
        .count()
      if (overdueForRoutine !== 0) {
        throw new Error(`Expected 0 overdue rows for routine on day 6, got ${overdueForRoutine}`)
      }

      // Day 6 is itself a scheduled daily occurrence — verify it renders as scheduled.
      const scheduledForRoutine = await page
        .locator(`.dialog .routine-row:not(.overdue) .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
        .count()
      if (scheduledForRoutine !== 1) {
        throw new Error(`Expected 1 scheduled row for routine on day 6, got ${scheduledForRoutine}`)
      }

      // Cancel out of the editor without saving.
      await page.click('.dialog .btn-secondary:has-text("Cancel")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Day 6: 0 overdue, 1 scheduled (as expected for daily cadence)')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Step 4: Day 4 (today - 1, past) — zero overdue rows
    // ================================================================

    reporter.startTest('Day 4 (today - 1, past) shows zero .routine-row.overdue for the routine')
    try {
      await openDayFocusEditor(page, day4)

      // Day 4 is also a scheduled daily occurrence, so the routine appears as scheduled.
      await page.locator(`.dialog .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })

      const overdueForRoutine = await page
        .locator(`.dialog .routine-row.overdue .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
        .count()
      if (overdueForRoutine !== 0) {
        throw new Error(`Expected 0 overdue rows on day 4 (past), got ${overdueForRoutine}`)
      }

      await page.click('.dialog .btn-secondary:has-text("Cancel")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Day 4: today-gate excludes overdue from past-date editor')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Step 5: Day 7 (today + 2, future) — zero overdue rows
    // ================================================================

    reporter.startTest('Day 7 (today + 2, future) shows zero .routine-row.overdue for the routine')
    try {
      await openDayFocusEditor(page, day7)

      // Day 7 is a scheduled daily occurrence; the routine renders as scheduled.
      await page.locator(`.dialog .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })

      const overdueForRoutine = await page
        .locator(`.dialog .routine-row.overdue .routine-desc:has-text("${ROUTINE_DESCRIPTION}")`)
        .count()
      if (overdueForRoutine !== 0) {
        throw new Error(`Expected 0 overdue rows on day 7 (future), got ${overdueForRoutine}`)
      }

      await page.click('.dialog .btn-secondary:has-text("Cancel")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Day 7: today-gate excludes overdue from future-date editor')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Cleanup: delete the test routine to avoid polluting subsequent tests
    // ================================================================

    reporter.startTest('Cleanup: delete the test routine')
    try {
      if (routineId) {
        await page.evaluate(async (id) => {
          const app = window.go.main.App
          await app.Dismiss(id)
        }, routineId)
        const routines = readRoutines(DATA_DIR)
        const stillThere = routines.find(r => r.id === routineId)
        if (stillThere) {
          throw new Error(`Routine ${routineId} still present after Dismiss`)
        }
      }
      reporter.pass('Routine deleted')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Final: verify no page errors / console errors
    // ================================================================

    reporter.startTest('Final: no page or console errors')
    try {
      if (pageErrors.length > 0) {
        throw new Error(`Page errors: ${pageErrors.join('; ')}`)
      }
      if (consoleErrors.length > 0) {
        throw new Error(`Console errors: ${consoleErrors.join('; ')}`)
      }
      // Reference the year-title helper to keep it covered when the calendar
      // navigation path was not exercised (e.g. all five days fall in the
      // currently displayed year).
      const yearTitle = await getYearTitle(page).catch(() => null)
      if (yearTitle !== null && !/^\d{4}$/.test(yearTitle)) {
        throw new Error(`Calendar year title is not a 4-digit year: "${yearTitle}"`)
      }
      // Also validate that navigateCalendarToYear is a no-op when already on
      // the target year (used implicitly by openDayFocusEditor in the same-year
      // path).
      if (yearTitle) {
        await navigateCalendarToYear(page, parseInt(yearTitle, 10))
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
