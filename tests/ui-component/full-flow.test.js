/**
 * UI Component Tests for Full User Flow
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
  console.log('Starting Full Flow Tests...\n')

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
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      // Create theme "E2E Flow" with orange color
      await page.click('.btn-primary:has-text("+ Add Theme")')
      await page.waitForSelector('.theme-form', { timeout: 5000 })
      await page.fill('.theme-form input[type="text"]', 'E2E Flow')
      await page.click('.theme-form .color-option:nth-child(2)')
      await page.click('.theme-form .btn-primary:has-text("Create")')
      await page.waitForSelector(
        '.tree-theme-edit:last-child .theme-pill:has-text("E2E Flow")',
        { timeout: 5000 }
      )

      // Expand theme and add objective via empty-state link
      await page.click('.tree-theme-edit:last-child .expand-button')
      await page.waitForSelector(
        '.tree-theme-edit:last-child .empty-state .link-button',
        { timeout: 5000 }
      )
      await page.click('.tree-theme-edit:last-child .empty-state .link-button')
      await page.waitForSelector('.tree-theme-edit:last-child .objective-form', { timeout: 5000 })
      await page.fill(
        '.tree-theme-edit:last-child .objective-form input[type="text"]',
        'E2E Objective'
      )
      await page.click('.tree-theme-edit:last-child .objective-form .btn-primary')
      await page.waitForSelector('.tree-theme-edit:last-child .tree-objective-edit', { timeout: 5000 })

      // Hover objective header to reveal action buttons, then add key result
      await page.hover('.tree-theme-edit:last-child .tree-objective-edit .objective-header')
      await page.click(
        '.tree-theme-edit:last-child .tree-objective-edit button[title="Add Key Result"]'
      )
      await page.waitForSelector('.tree-theme-edit:last-child .kr-form', { timeout: 5000 })
      await page.fill(
        '.tree-theme-edit:last-child .kr-form input[type="text"]',
        'E2E Key Result'
      )
      await page.click('.tree-theme-edit:last-child .kr-form .btn-primary')
      await page.waitForSelector('.tree-theme-edit:last-child .tree-kr-edit', { timeout: 5000 })

      // Verify hierarchy text content
      const themeName = await page.$eval(
        '.tree-theme-edit:last-child > .item-header .theme-pill',
        el => el.textContent.trim()
      )
      if (themeName !== 'E2E Flow') {
        throw new Error(`Expected theme "E2E Flow", got "${themeName}"`)
      }

      const objTitle = await page.$eval(
        '.tree-theme-edit:last-child .tree-objective-edit .item-name',
        el => el.textContent.trim()
      )
      if (objTitle !== 'E2E Objective') {
        throw new Error(`Expected objective "E2E Objective", got "${objTitle}"`)
      }

      const krDesc = await page.$eval(
        '.tree-theme-edit:last-child .tree-kr-edit .item-name',
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

      // Double-click first day cell to open editor dialog
      await page.dblclick('.day-num')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Select "E2E Flow" theme checkbox and add text
      await page.click('.tree-theme-item:has-text("E2E Flow") input[type="checkbox"]')
      await page.fill('#text-input', 'E2E test day')
      await page.click('.dialog .btn-primary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Verify at least one text cell now has the orange theme color
      // (theme coloring applies only to text cells, not day-num or weekday)
      await page.waitForFunction(() => {
        const cells = document.querySelectorAll('.day-text')
        return Array.from(cells).some(c => {
          const attr = c.getAttribute('style') || ''
          const bg = window.getComputedStyle(c).backgroundColor || ''
          return attr.includes('249, 115, 22') || bg.includes('249, 115, 22')
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
        await app.CreateTask('Task A', 'EF', 'important-urgent')
        await app.CreateTask('Task B', 'EF', 'important-not-urgent')
        await app.CreateTask('Task C', 'EF', 'not-important-urgent')
      })

      // Navigate to Tasks view (onMount fetches fresh data)
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify each task appears in correct priority section
      await page.waitForSelector(
        '.section-important-urgent .task-title:has-text("Task A")',
        { timeout: 5000 }
      )
      await page.waitForSelector(
        '.section-important-not-urgent .task-title:has-text("Task B")',
        { timeout: 5000 }
      )
      await page.waitForSelector(
        '.section-not-important-urgent .task-title:has-text("Task C")',
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
        await app.CreateTask('Task D', 'EF', 'important-urgent')
        await app.CreateTask('Task E', 'EF', 'important-not-urgent')
      })

      // Navigate away and back to trigger fresh data fetch
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify Task A appears before Task D in Important & Urgent
      const iuTasks = await page.$$eval(
        '.section-important-urgent .task-title',
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
        '.section-important-not-urgent .task-title',
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
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })
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
      await page.click('.theme-badge:has-text("E2E Flow")')
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      const okrNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (okrNav !== 'Long-term') {
        throw new Error(`Expected OKRs active after theme click, got "${okrNav}"`)
      }

      // Verify E2E Flow theme is visible in OKR view
      await page.waitForSelector('.theme-pill:has-text("E2E Flow")', { timeout: 5000 })

      // Navigate to Calendar and verify themed day persists
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      await page.waitForFunction(() => {
        const cells = document.querySelectorAll('.day-text')
        return Array.from(cells).some(c => {
          const attr = c.getAttribute('style') || ''
          const bg = window.getComputedStyle(c).backgroundColor || ''
          return attr.includes('249, 115, 22') || bg.includes('249, 115, 22')
        })
      }, { timeout: 5000 })

      // Navigate back to Tasks
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })

      const taskNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (taskNav !== 'Short-term') {
        throw new Error(`Expected Tasks active, got "${taskNav}"`)
      }

      reporter.pass('Cross-view navigation works correctly')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 7: Task field clearing via edit dialog ----
    reporter.startTest('Tasks: clear optional fields via edit dialog')
    try {
      // Add optional fields to Task A via mock API
      await page.evaluate(async () => {
        const app = window.go.main.App
        const tasks = await app.GetTasks()
        const taskA = tasks.find(t => t.title === 'Task A')
        if (!taskA) throw new Error('Task A not found')
        await app.UpdateTask({
          ...taskA,
          description: 'E2E description to clear',
          tags: ['e2e-tag'],
        })
      })

      // Navigate away and back to refresh state
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Click Task A to open edit dialog
      await page.click('.task-card:has(.task-title:has-text("Task A"))')
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

      // Verify fields are populated
      const desc = await page.$eval('#edit-task-description', el => el.value)
      if (desc !== 'E2E description to clear') {
        throw new Error(`Expected description "E2E description to clear", got "${desc}"`)
      }
      const hasActiveTag = await page.$eval('[role="dialog"] .tag-pill.active', el => el.textContent.trim())
      if (hasActiveTag !== 'e2e-tag') {
        throw new Error(`Expected active tag pill "e2e-tag", got "${hasActiveTag}"`)
      }
      // Clear all optional fields
      await page.fill('#edit-task-description', '')
      await page.click('[role="dialog"] .tag-pill.active')

      // Save
      await page.click('[role="dialog"] .btn-primary')
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 })

      // Verify tag badges are gone from Task A card
      const taskACard = await page.$('.task-card:has(.task-title:has-text("Task A"))')
      const badgeCount = await taskACard.$$eval('.tag-badge', els => els.length)
      if (badgeCount > 0) {
        throw new Error(`Expected no tag badges after clearing, found ${badgeCount}`)
      }

      reporter.pass('Task optional fields cleared via edit dialog')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 8: Calendar day clearing ----
    reporter.startTest('Calendar: clear day focus assignment')
    try {
      // Navigate to Calendar
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      // Find and click the themed day text cell (has orange color)
      await page.waitForFunction(() => {
        const cells = document.querySelectorAll('.day-text')
        return Array.from(cells).some(c => {
          const attr = c.getAttribute('style') || ''
          const bg = window.getComputedStyle(c).backgroundColor || ''
          return attr.includes('249, 115, 22') || bg.includes('249, 115, 22')
        })
      }, { timeout: 5000 })
      await page.evaluate(() => {
        const cells = document.querySelectorAll('.day-text')
        const themed = Array.from(cells).find(c => {
          const attr = c.getAttribute('style') || ''
          const bg = window.getComputedStyle(c).backgroundColor || ''
          return attr.includes('249, 115, 22') || bg.includes('249, 115, 22')
        })
        if (themed) themed.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      })
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Uncheck the selected theme checkbox to clear theme
      await page.click('.tree-theme-item:has-text("E2E Flow") input[type="checkbox"]')
      await page.fill('#text-input', '')
      await page.click('.dialog .btn-primary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Wait for calendar to re-render without orange theme color
      await page.waitForFunction(() => {
        const cells = document.querySelectorAll('.day-text')
        return !Array.from(cells).some(c => {
          const attr = c.getAttribute('style') || ''
          const bg = window.getComputedStyle(c).backgroundColor || ''
          return attr.includes('249, 115, 22') || bg.includes('249, 115, 22')
        })
      }, { timeout: 5000 })

      reporter.pass('Calendar day focus cleared')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 9: OKR deletion (bottom-up: KR → objective → theme) ----
    reporter.startTest('OKR: delete key result, objective, and theme')
    try {
      // Navigate to OKRs
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      // Auto-accept window.confirm() dialogs
      const acceptDialog = (dialog) => dialog.accept()
      page.on('dialog', acceptDialog)

      // Expand theme if collapsed
      const themeExpanded = await page.$('.tree-theme-edit:last-child .tree-objective-edit')
      if (!themeExpanded) {
        await page.click('.tree-theme-edit:last-child .expand-button')
        await page.waitForSelector('.tree-theme-edit:last-child .tree-objective-edit', { timeout: 5000 })
      }

      // Expand objective if collapsed (to reveal KR)
      const krVisible = await page.$('.tree-theme-edit:last-child .tree-kr-edit')
      if (!krVisible) {
        await page.click('.tree-theme-edit:last-child .tree-objective-edit .expand-button')
        await page.waitForSelector('.tree-theme-edit:last-child .tree-kr-edit', { timeout: 5000 })
      }

      // Delete key result
      await page.hover('.tree-theme-edit:last-child .tree-kr-edit .kr-header')
      await page.click('.tree-theme-edit:last-child .tree-kr-edit button[title="Delete"]')
      await page.waitForSelector('.tree-theme-edit:last-child .tree-kr-edit', { state: 'detached', timeout: 5000 })

      // Delete objective
      await page.hover('.tree-theme-edit:last-child .tree-objective-edit .objective-header')
      await page.click('.tree-theme-edit:last-child .tree-objective-edit button[title="Delete"]')
      await page.waitForSelector('.tree-theme-edit:last-child .tree-objective-edit', { state: 'detached', timeout: 5000 })

      // Delete theme
      await page.hover('.tree-theme-edit:last-child > .item-header')
      await page.click('.tree-theme-edit:last-child > .item-header button[title="Delete"]')

      // Verify "E2E Flow" theme is gone
      await page.waitForFunction(() => {
        const names = document.querySelectorAll('.theme-pill')
        return !Array.from(names).some(n => n.textContent.trim() === 'E2E Flow')
      }, { timeout: 5000 })

      page.off('dialog', acceptDialog)

      reporter.pass('OKR hierarchy deleted bottom-up')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 10: Add a new column via column header menu ----
    reporter.startTest('Columns: add a new column via Insert right')
    try {
      // Ensure we're on Tasks view
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Open column menu on TODO column and click "Insert right"
      await page.click('.kanban-column:first-child .column-menu-btn')
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Insert right")')

      // Fill in the prompt dialog
      await page.waitForSelector('.prompt-dialog', { timeout: 5000 })
      await page.fill('.prompt-input', 'Review')
      await page.click('.prompt-ok')
      await page.waitForSelector('.prompt-dialog', { state: 'detached', timeout: 5000 })

      // Verify "Review" column appears on the board
      await page.waitForSelector('h2:has-text("Review")', { timeout: 5000 })

      // Verify column order: TODO, Review, DOING, DONE
      const colTitles = await page.$$eval(
        '.kanban-column .column-header h2',
        els => els.map(el => el.textContent.trim())
      )
      const expectedCols = ['TODO', 'Review', 'DOING', 'DONE']
      if (JSON.stringify(colTitles) !== JSON.stringify(expectedCols)) {
        throw new Error(`Expected columns [${expectedCols.join(', ')}], got [${colTitles.join(', ')}]`)
      }

      reporter.pass('New "Review" column added after TODO')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 11: Insert a column to the left of another ----
    reporter.startTest('Columns: insert column to the left')
    try {
      // Open column menu on DOING column and click "Insert left"
      const doingCol = await page.$('.kanban-column:has(h2:has-text("DOING"))')
      await doingCol.$eval('.column-menu-btn', el => el.click())
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Insert left")')

      // Fill in the prompt dialog
      await page.waitForSelector('.prompt-dialog', { timeout: 5000 })
      await page.fill('.prompt-input', 'QA')
      await page.click('.prompt-ok')
      await page.waitForSelector('.prompt-dialog', { state: 'detached', timeout: 5000 })

      // Verify column order: TODO, Review, QA, DOING, DONE
      await page.waitForSelector('h2:has-text("QA")', { timeout: 5000 })
      const colTitles = await page.$$eval(
        '.kanban-column .column-header h2',
        els => els.map(el => el.textContent.trim())
      )
      const expectedCols = ['TODO', 'Review', 'QA', 'DOING', 'DONE']
      if (JSON.stringify(colTitles) !== JSON.stringify(expectedCols)) {
        throw new Error(`Expected columns [${expectedCols.join(', ')}], got [${colTitles.join(', ')}]`)
      }

      reporter.pass('Column "QA" inserted left of DOING')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 12: Rename a column via prompt dialog ----
    reporter.startTest('Columns: rename a column')
    try {
      // Open column menu on QA column and click "Rename"
      const qaCol = await page.$('.kanban-column:has(h2:has-text("QA"))')
      await qaCol.$eval('.column-menu-btn', el => el.click())
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Rename")')

      // Fill in the prompt dialog with new name
      await page.waitForSelector('.prompt-dialog', { timeout: 5000 })
      await page.fill('.prompt-input', 'Quality Check')
      await page.click('.prompt-ok')
      await page.waitForSelector('.prompt-dialog', { state: 'detached', timeout: 5000 })

      // Verify column header text updated
      await page.waitForSelector('h2:has-text("Quality Check")', { timeout: 5000 })

      // Verify "QA" no longer appears as a column header
      const colTitles = await page.$$eval(
        '.kanban-column .column-header h2',
        els => els.map(el => el.textContent.trim())
      )
      if (colTitles.includes('QA')) {
        throw new Error('Column "QA" should have been renamed')
      }
      if (!colTitles.includes('Quality Check')) {
        throw new Error('Column "Quality Check" not found after rename')
      }

      reporter.pass('Column renamed from "QA" to "Quality Check"')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 13: Attempt to delete non-empty column → error ----
    reporter.startTest('Columns: delete non-empty column shows error')
    try {
      // DOING column has CG-T2 ("Respond to emails") in it
      const doingCol = await page.$('.kanban-column:has(h2:has-text("DOING"))')
      await doingCol.$eval('.column-menu-btn', el => el.click())
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Delete")')

      // Verify error banner appears
      await page.waitForSelector('.error-banner', { timeout: 5000 })
      const errorText = await page.$eval('.error-banner span', el => el.textContent)
      if (!errorText.includes('cannot delete column')) {
        throw new Error(`Expected "cannot delete column" error, got "${errorText}"`)
      }

      // Dismiss error banner
      await page.click('.error-banner button')
      await page.waitForSelector('.error-banner', { state: 'detached', timeout: 5000 })

      // DOING column should still exist
      await page.waitForSelector('h2:has-text("DOING")', { timeout: 5000 })

      reporter.pass('Non-empty column deletion blocked with error')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 14: Delete an empty doing-type column ----
    reporter.startTest('Columns: delete empty doing-type column')
    try {
      // Delete the empty "Review" column
      const reviewCol = await page.$('.kanban-column:has(h2:has-text("Review"))')
      await reviewCol.$eval('.column-menu-btn', el => el.click())
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Delete")')

      // Verify "Review" column is gone
      await page.waitForFunction(() => {
        const headers = document.querySelectorAll('.kanban-column .column-header h2')
        return !Array.from(headers).some(h => h.textContent.trim() === 'Review')
      }, { timeout: 5000 })

      // Verify remaining columns: TODO, Quality Check, DOING, DONE
      const colTitles = await page.$$eval(
        '.kanban-column .column-header h2',
        els => els.map(el => el.textContent.trim())
      )
      const expectedCols = ['TODO', 'Quality Check', 'DOING', 'DONE']
      if (JSON.stringify(colTitles) !== JSON.stringify(expectedCols)) {
        throw new Error(`Expected columns [${expectedCols.join(', ')}], got [${colTitles.join(', ')}]`)
      }

      reporter.pass('Empty "Review" column deleted')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 15: Column changes persist across navigation ----
    reporter.startTest('Columns: changes persist across navigation')
    try {
      // Navigate to OKRs
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      // Navigate back to Tasks
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify columns still include "Quality Check" and exclude "Review"
      const colTitles = await page.$$eval(
        '.kanban-column .column-header h2',
        els => els.map(el => el.textContent.trim())
      )
      if (!colTitles.includes('Quality Check')) {
        throw new Error(`"Quality Check" column not found after navigation. Got: [${colTitles.join(', ')}]`)
      }
      if (colTitles.includes('Review')) {
        throw new Error('"Review" column reappeared after navigation')
      }
      if (colTitles.includes('QA')) {
        throw new Error('"QA" column reappeared after navigation (should be renamed)')
      }

      reporter.pass('Column changes persisted across navigation')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sub-test 16: Final error check ----
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
