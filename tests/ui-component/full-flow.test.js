/**
 * E2E Tests for Full User Flow
 * Tests the complete Bearing journey: OKR creation -> calendar assignment ->
 * batch task creation -> mixed kanban transitions -> cross-view navigation.
 *
 * Runs against Vite dev server (localhost:5173) with mock Wails bindings.
 * State accumulates across sub-tests (shared browser session).
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
} from './test-helpers.js'

const reporter = new TestReporter('Full Flow Tests')

export async function runTests() {
  console.log('Starting Full Flow E2E Tests...\n')

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

    // Set up error listeners
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
      console.log(`  [pageerror] ${error.message}`)
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (text.includes('[Wails Mock]')) return
        if (text.includes('Failed to load resource')) return
        consoleErrors.push(text)
      }
    })

    // Load app
    await page.goto(TEST_CONFIG.WAILS_DEV_URL, {
      waitUntil: 'networkidle',
      timeout: TEST_CONFIG.TIMEOUT,
    })

    // ---- Sub-test 1: OKR hierarchy creation ----
    reporter.startTest('OKR: create theme, objective, and key result')
    try {
      // Navigate to OKRs
      await page.click('.nav-link:has-text("OKRs")')
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      // Create theme "E2E Flow" with emerald color
      await page.click('.btn-primary:has-text("+ Add Theme")')
      await page.waitForSelector('.theme-form', { timeout: 5000 })
      await page.fill('.theme-form input[type="text"]', 'E2E Flow')
      await page.click('.theme-form .color-option:nth-child(2)')
      await page.click('.theme-form .btn-primary:has-text("Create")')
      await page.waitForSelector(
        '.theme-item:last-child .item-name:has-text("E2E Flow")',
        { timeout: 5000 }
      )

      // Expand theme and add objective via empty-state link
      await page.click('.theme-item:last-child .expand-button')
      await page.waitForSelector(
        '.theme-item:last-child .empty-state .link-button',
        { timeout: 5000 }
      )
      await page.click('.theme-item:last-child .empty-state .link-button')
      await page.waitForSelector('.theme-item:last-child .objective-form', { timeout: 5000 })
      await page.fill(
        '.theme-item:last-child .objective-form input[type="text"]',
        'E2E Objective'
      )
      await page.click('.theme-item:last-child .objective-form .btn-primary')
      await page.waitForSelector('.theme-item:last-child .objective-item', { timeout: 5000 })

      // Hover objective header to reveal action buttons, then add key result
      await page.hover('.theme-item:last-child .objective-item .objective-header')
      await page.click(
        '.theme-item:last-child .objective-item button[title="Add Key Result"]'
      )
      await page.waitForSelector('.theme-item:last-child .kr-form', { timeout: 5000 })
      await page.fill(
        '.theme-item:last-child .kr-form input[type="text"]',
        'E2E Key Result'
      )
      await page.click('.theme-item:last-child .kr-form .btn-primary')
      await page.waitForSelector('.theme-item:last-child .kr-item', { timeout: 5000 })

      // Verify hierarchy text content
      const themeName = await page.$eval(
        '.theme-item:last-child > .item-header .item-name',
        el => el.textContent.trim()
      )
      if (themeName !== 'E2E Flow') {
        throw new Error(`Expected theme "E2E Flow", got "${themeName}"`)
      }

      const objTitle = await page.$eval(
        '.theme-item:last-child .objective-item .item-name',
        el => el.textContent.trim()
      )
      if (objTitle !== 'E2E Objective') {
        throw new Error(`Expected objective "E2E Objective", got "${objTitle}"`)
      }

      const krDesc = await page.$eval(
        '.theme-item:last-child .kr-item .item-name',
        el => el.textContent.trim()
      )
      if (krDesc !== 'E2E Key Result') {
        throw new Error(`Expected KR "E2E Key Result", got "${krDesc}"`)
      }

      reporter.pass('OKR hierarchy created and verified')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 2: Calendar day assignment ----
    reporter.startTest('Calendar: assign theme to a day')
    try {
      // Navigate to Calendar
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      // Click first day cell to open editor dialog
      await page.click('.day-num')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Select "E2E Flow" theme (ID = "EF") and add text
      await page.selectOption('#theme-select', 'EF')
      await page.fill('#text-input', 'E2E test day')
      await page.click('.dialog .btn-primary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Verify at least one day cell now has the emerald theme color
      // Browser may normalize #10b98120 to rgba(16, 185, 129, ...) in style
      await page.waitForFunction(() => {
        const cells = document.querySelectorAll('.day-num')
        return Array.from(cells).some(c => {
          const attr = c.getAttribute('style') || ''
          const bg = window.getComputedStyle(c).backgroundColor || ''
          return attr.includes('#10b981') || bg.includes('16, 185, 129')
        })
      }, { timeout: 5000 })

      reporter.pass('Calendar day assigned with theme color')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 3: Batch task creation (session 1) ----
    reporter.startTest('Tasks: create first batch of 3 tasks')
    try {
      // Create 3 tasks via mock API (Eisenhower DnD unreliable in Playwright)
      await page.evaluate(async () => {
        const app = window.go.main.App
        await app.CreateTask('Task A', 'EF', '2026-01-01', 'important-urgent')
        await app.CreateTask('Task B', 'EF', '2026-01-01', 'important-not-urgent')
        await app.CreateTask('Task C', 'EF', '2026-01-01', 'not-important-urgent')
      })

      // Navigate to Tasks view (onMount fetches fresh data)
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify each task appears in correct priority section
      await page.waitForSelector(
        '[data-testid="section-important-urgent"] .task-title:has-text("Task A")',
        { timeout: 5000 }
      )
      await page.waitForSelector(
        '[data-testid="section-important-not-urgent"] .task-title:has-text("Task B")',
        { timeout: 5000 }
      )
      await page.waitForSelector(
        '[data-testid="section-not-important-urgent"] .task-title:has-text("Task C")',
        { timeout: 5000 }
      )

      reporter.pass('Session 1: 3 tasks in correct priority sections')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 4: Batch task creation (session 2) with ordering ----
    reporter.startTest('Tasks: create second batch and verify ordering')
    try {
      // Create 2 more tasks in the same priority buckets
      await page.evaluate(async () => {
        const app = window.go.main.App
        await app.CreateTask('Task D', 'EF', '2026-01-01', 'important-urgent')
        await app.CreateTask('Task E', 'EF', '2026-01-01', 'important-not-urgent')
      })

      // Navigate away and back to trigger fresh data fetch
      await page.click('.nav-link:has-text("Home")')
      await page.waitForSelector('.placeholder-view', { timeout: 5000 })
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify Task A appears before Task D in Important & Urgent
      const iuTasks = await page.$$eval(
        '[data-testid="section-important-urgent"] .task-title',
        els => els.map(el => el.textContent.trim())
      )
      const idxA = iuTasks.indexOf('Task A')
      const idxD = iuTasks.indexOf('Task D')
      if (idxA === -1 || idxD === -1) {
        throw new Error(`Expected Task A and D in IU section, got: [${iuTasks.join(', ')}]`)
      }
      if (idxA >= idxD) {
        throw new Error(`Task A (pos ${idxA}) should be before Task D (pos ${idxD})`)
      }

      // Verify Task B appears before Task E in Important & Not Urgent
      const inuTasks = await page.$$eval(
        '[data-testid="section-important-not-urgent"] .task-title',
        els => els.map(el => el.textContent.trim())
      )
      const idxB = inuTasks.indexOf('Task B')
      const idxE = inuTasks.indexOf('Task E')
      if (idxB === -1 || idxE === -1) {
        throw new Error(`Expected Task B and E in INU section, got: [${inuTasks.join(', ')}]`)
      }
      if (idxB >= idxE) {
        throw new Error(`Task B (pos ${idxB}) should be before Task E (pos ${idxE})`)
      }

      reporter.pass('Session 2 tasks ordered below session 1 tasks')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 5: Mixed kanban transitions ----
    reporter.startTest('Kanban: move all tasks to Done through varied paths')
    try {
      // Move tasks via mock API (kanban DnD unreliable in Playwright)
      // A: todo -> doing -> done  (full path)
      // B: todo -> done           (skip Doing)
      // C: todo -> doing -> todo -> doing -> done  (backward then forward)
      // D, E: todo -> done        (direct)
      await page.evaluate(async () => {
        const app = window.go.main.App
        await app.MoveTask('EF-T1', 'doing')
        await app.MoveTask('EF-T1', 'done')
        await app.MoveTask('EF-T2', 'done')
        await app.MoveTask('EF-T3', 'doing')
        await app.MoveTask('EF-T3', 'todo')
        await app.MoveTask('EF-T3', 'doing')
        await app.MoveTask('EF-T3', 'done')
        await app.MoveTask('EF-T4', 'done')
        await app.MoveTask('EF-T5', 'done')
      })

      // Navigate away and back to refresh
      await page.click('.nav-link:has-text("Home")')
      await page.waitForSelector('.placeholder-view', { timeout: 5000 })
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify all 5 tasks are in the Done column (3rd kanban column)
      const doneTasks = await page.$$eval(
        '.kanban-column:nth-child(3) .task-title',
        els => els.map(el => el.textContent.trim())
      )
      const expected = ['Task A', 'Task B', 'Task C', 'Task D', 'Task E']
      for (const name of expected) {
        if (!doneTasks.includes(name)) {
          throw new Error(`"${name}" not in Done column. Found: [${doneTasks.join(', ')}]`)
        }
      }

      // Verify none of our tasks remain in TODO or DOING
      const todoTitles = await page.$$eval(
        '.kanban-column:nth-child(1) .task-title',
        els => els.map(el => el.textContent.trim())
      )
      const doingTitles = await page.$$eval(
        '.kanban-column:nth-child(2) .task-title',
        els => els.map(el => el.textContent.trim())
      )
      for (const name of expected) {
        if (todoTitles.includes(name)) {
          throw new Error(`"${name}" should not be in TODO`)
        }
        if (doingTitles.includes(name)) {
          throw new Error(`"${name}" should not be in DOING`)
        }
      }

      reporter.pass('All 5 tasks moved to Done through varied paths')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 6: Cross-view navigation ----
    reporter.startTest('Navigation: cross-view links between views')
    try {
      // Click theme name on a task card to navigate to OKR view
      await page.click('.theme-name-btn:has-text("E2E Flow")')
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      const okrNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (okrNav !== 'OKRs') {
        throw new Error(`Expected OKRs active after theme click, got "${okrNav}"`)
      }

      // Verify E2E Flow theme is visible in OKR view
      await page.waitForSelector('.item-name:has-text("E2E Flow")', { timeout: 5000 })

      // Navigate to Calendar and verify themed day persists
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      await page.waitForFunction(() => {
        const cells = document.querySelectorAll('.day-num')
        return Array.from(cells).some(c => {
          const attr = c.getAttribute('style') || ''
          const bg = window.getComputedStyle(c).backgroundColor || ''
          return attr.includes('#10b981') || bg.includes('16, 185, 129')
        })
      }, { timeout: 5000 })

      // Navigate back to Tasks
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })

      const taskNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (taskNav !== 'Tasks') {
        throw new Error(`Expected Tasks active, got "${taskNav}"`)
      }

      reporter.pass('Cross-view navigation works correctly')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 7: Final error check ----
    reporter.startTest('Final: no page or console errors throughout flow')
    try {
      if (pageErrors.length > 0) {
        throw new Error(`Page errors: ${pageErrors.join('; ')}`)
      }
      if (consoleErrors.length > 0) {
        throw new Error(`Console errors: ${consoleErrors.join('; ')}`)
      }

      reporter.pass('No errors throughout entire flow')
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
