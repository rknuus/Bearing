/**
 * E2E Tests for View Workflows
 * Tests: OKR theme creation, calendar day editing, task creation, keyboard navigation
 *
 * Runs against Vite dev server (localhost:5173) with mock Wails bindings.
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
} from './test-helpers.js'

const reporter = new TestReporter('View Workflow Tests')

export async function runTests() {
  console.log('Starting View Workflow E2E Tests...\n')

  let browser

  try {
    // Check servers are running
    console.log('Checking servers...')
    await waitForServers()
    console.log('  Servers are ready\n')

    // Launch browser
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

    // ---- Test 1: OKR workflow — navigate to OKRs and verify theme list ----
    reporter.startTest('OKR workflow: navigate and view themes')
    try {
      await page.goto(TEST_CONFIG.WAILS_DEV_URL, {
        waitUntil: 'networkidle',
        timeout: TEST_CONFIG.TIMEOUT,
      })

      // Navigate to OKRs view
      await page.click('.nav-link:has-text("OKRs")')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })

      // Wait for OKR content to load (should show themes from mock data)
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      const headerText = await page.$eval('.okr-header h1', el => el.textContent.trim())
      if (headerText !== 'Life Themes & OKRs') {
        throw new Error(`Expected OKR header "Life Themes & OKRs", got "${headerText}"`)
      }

      // Verify at least one theme is rendered from mock data
      const themeItems = await page.$$('.theme-item')
      if (themeItems.length === 0) {
        throw new Error('Expected at least one theme item from mock data')
      }

      reporter.pass('OKR view loads and displays themes')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 2: Calendar workflow — navigate and interact with day cell ----
    reporter.startTest('Calendar workflow: navigate and open day editor')
    try {
      // Navigate to Calendar view
      await page.click('.nav-link:has-text("Calendar")')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      // Verify calendar header with year
      const yearTitle = await page.$eval('.year-title', el => el.textContent.trim())
      if (!yearTitle || isNaN(Number(yearTitle))) {
        throw new Error(`Expected numeric year in calendar header, got "${yearTitle}"`)
      }

      // Verify month headers rendered
      const monthHeaders = await page.$$('.month-header')
      if (monthHeaders.length !== 12) {
        throw new Error(`Expected 12 month headers, got ${monthHeaders.length}`)
      }

      // Click a day cell to open editor
      await page.click('.day-num')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Verify dialog has theme select and text input
      const themeSelect = await page.$('#theme-select')
      const textInput = await page.$('#text-input')
      if (!themeSelect || !textInput) {
        throw new Error('Day editor dialog missing theme select or text input')
      }

      // Cancel the dialog
      await page.click('.btn-secondary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Calendar view loads and day editor works')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 3: Task workflow — navigate and view task board ----
    reporter.startTest('Task workflow: navigate and view kanban board')
    try {
      // Navigate to Tasks view
      await page.click('.nav-link:has-text("Tasks")')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })

      // Verify board header
      const boardHeader = await page.$eval('.eisenkan-header h1', el => el.textContent.trim())
      if (boardHeader !== 'EisenKan Board') {
        throw new Error(`Expected board header "EisenKan Board", got "${boardHeader}"`)
      }

      // Verify three columns
      const columns = await page.$$('.kanban-column')
      if (columns.length !== 3) {
        throw new Error(`Expected 3 kanban columns, got ${columns.length}`)
      }

      // Verify column headers
      const columnHeaders = await page.$$eval('.column-header h2', els =>
        els.map(el => el.textContent.trim())
      )
      if (columnHeaders[0] !== 'Todo' || columnHeaders[1] !== 'Doing' || columnHeaders[2] !== 'Done') {
        throw new Error(`Unexpected column headers: ${columnHeaders.join(', ')}`)
      }

      // Verify create button
      const createBtn = await page.$('.create-btn')
      if (!createBtn) {
        throw new Error('Create task button not found')
      }

      // Click create button and verify dialog
      await createBtn.click()
      await page.waitForSelector('.dialog', { timeout: 5000 })

      const dialogTitle = await page.$eval('.dialog h2', el => el.textContent.trim())
      if (dialogTitle !== 'Create New Task') {
        throw new Error(`Expected dialog title "Create New Task", got "${dialogTitle}"`)
      }

      // Cancel the dialog
      await page.click('.btn-secondary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Task board loads with correct columns and create dialog')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 4: Keyboard navigation — use shortcuts to switch views ----
    reporter.startTest('Keyboard navigation: Ctrl+1/2/3 switch views')
    try {
      // Navigate home first
      await page.click('.nav-link:has-text("Home")')
      await page.waitForSelector('.placeholder-view', { timeout: 5000 })

      // Ctrl+1 → OKRs
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })
      const activeAfter1 = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (activeAfter1 !== 'OKRs') {
        throw new Error(`Expected active link "OKRs" after Ctrl+1, got "${activeAfter1}"`)
      }

      // Ctrl+2 → Calendar
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })
      const activeAfter2 = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (activeAfter2 !== 'Calendar') {
        throw new Error(`Expected active link "Calendar" after Ctrl+2, got "${activeAfter2}"`)
      }

      // Ctrl+3 → Tasks
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })
      const activeAfter3 = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (activeAfter3 !== 'Tasks') {
        throw new Error(`Expected active link "Tasks" after Ctrl+3, got "${activeAfter3}"`)
      }

      reporter.pass('Keyboard shortcuts switch views correctly')
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

// Run tests when executed directly
runTests()
