/**
 * UI Component Tests for Tag Editor
 * Tests: new tag creation via comma and blur in CreateTaskDialog and EditTaskDialog
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

const reporter = new TestReporter('Tag Editor Tests')

export async function runTests() {
  console.log('Starting Tag Editor Tests...\n')

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
        if (text.includes('(state-check)')) return
        consoleErrors.push(text)
      }
    })

    // Load app and navigate to Tasks view
    await page.goto(TEST_CONFIG.WAILS_DEV_URL, {
      waitUntil: 'networkidle',
      timeout: TEST_CONFIG.TIMEOUT,
    })

    await page.click('.nav-link:has-text("Short-term")')
    await page.waitForSelector('.eisenkan-container', { timeout: 5000 })

    // ---- Test 1: CreateTaskDialog — new tag via comma ----
    reporter.startTest('CreateTaskDialog: new tag via comma')
    try {
      // Open create dialog
      await page.click('#create-task-btn')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Type "newtag," in the tag input (comma triggers tag creation)
      const tagInput = await page.waitForSelector('.task-entry .tag-input', { timeout: 5000 })
      await tagInput.focus()
      await page.keyboard.type('newtag,')

      // Verify a .tag-pill.active appears with text "newtag"
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.task-entry .tag-pill.active')
        return Array.from(pills).some(p => p.textContent.trim() === 'newtag')
      }, { timeout: 5000 })

      // Verify the input was cleared after comma
      const inputValue = await tagInput.evaluate(el => el.value)
      if (inputValue.trim() !== '') {
        throw new Error(`Expected tag input to be cleared after comma, got "${inputValue}"`)
      }

      // Close the dialog
      await page.click('.btn-secondary:has-text("Close")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Comma creates new tag pill in CreateTaskDialog')
    } catch (err) {
      reporter.fail(err)
      // Ensure dialog is closed
      try {
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.click('.btn-secondary:has-text("Close")')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // ---- Test 2: CreateTaskDialog — new tag via blur (click Stage button) ----
    reporter.startTest('CreateTaskDialog: new tag via blur on Stage button click')
    try {
      // Open create dialog
      await page.click('#create-task-btn')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Fill in a task title so the Stage button is enabled
      await page.fill('#new-task-title', 'Blur Tag Test Task')

      // Type "blurtag" in the tag input (no comma, no Enter)
      const tagInput = await page.waitForSelector('.task-entry .tag-input', { timeout: 5000 })
      await tagInput.focus()
      await page.keyboard.type('blurtag')

      // Click a Stage button — this blurs the input, triggering tag creation,
      // then the click handler stages the task with the committed tag
      await page.click('.btn-add:has-text("Important & Urgent")')

      // Verify the pending task was created
      await page.waitForFunction(() => {
        const titles = document.querySelectorAll('.pending-task .task-title')
        return Array.from(titles).some(el => el.textContent.trim() === 'Blur Tag Test Task')
      }, { timeout: 5000 })

      // Double-click the pending task to open the edit-pending dialog and verify "blurtag" tag
      await page.dblclick('.pending-task:has(.task-title:has-text("Blur Tag Test Task"))')
      await page.waitForSelector('[aria-labelledby="edit-pending-dialog-title"]', { timeout: 5000 })

      // Verify "blurtag" is an active pill in the edit-pending dialog's TagEditor
      await page.waitForFunction(() => {
        const dialog = document.querySelector('[aria-labelledby="edit-pending-dialog-title"]')
        if (!dialog) return false
        const pills = dialog.querySelectorAll('.tag-pill.active')
        return Array.from(pills).some(p => p.textContent.trim() === 'blurtag')
      }, { timeout: 5000 })

      // Close the edit-pending dialog
      await page.click('[aria-labelledby="edit-pending-dialog-title"] .btn-secondary')
      await page.waitForSelector('[aria-labelledby="edit-pending-dialog-title"]', { state: 'detached', timeout: 5000 })

      // Close the create dialog
      await page.click('.btn-secondary:has-text("Close")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Blur on Stage button commits tag in CreateTaskDialog')
    } catch (err) {
      reporter.fail(err)
      try {
        // Close any nested dialogs first
        const editDialog = await page.$('[aria-labelledby="edit-pending-dialog-title"]')
        if (editDialog) {
          await page.click('[aria-labelledby="edit-pending-dialog-title"] .btn-secondary')
          await page.waitForSelector('[aria-labelledby="edit-pending-dialog-title"]', { state: 'detached', timeout: 3000 })
        }
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.click('.btn-secondary:has-text("Close")')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // ---- Test 3: EditTaskDialog — new tag via comma ----
    reporter.startTest('EditTaskDialog: new tag via comma')
    try {
      // Double-click a task card to open the edit dialog (use CG-T1 "Complete project proposal")
      await page.dblclick('.task-card:has(.task-title:has-text("Complete project proposal"))')
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

      // Type "edittag," in the tag input
      const tagInput = await page.waitForSelector('[role="dialog"] .tag-input', { timeout: 5000 })
      await tagInput.focus()
      await page.keyboard.type('edittag,')

      // Verify a .tag-pill.active appears with text "edittag"
      await page.waitForFunction(() => {
        const dialog = document.querySelector('[role="dialog"]')
        if (!dialog) return false
        const pills = dialog.querySelectorAll('.tag-pill.active')
        return Array.from(pills).some(p => p.textContent.trim() === 'edittag')
      }, { timeout: 5000 })

      // Cancel the dialog to avoid side effects
      await page.click('[role="dialog"] .btn-secondary')
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 })

      reporter.pass('Comma creates new tag pill in EditTaskDialog')
    } catch (err) {
      reporter.fail(err)
      try {
        const dialog = await page.$('[role="dialog"]')
        if (dialog) {
          await page.click('[role="dialog"] .btn-secondary')
          await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // ---- Test 4: EditTaskDialog — new tag via blur (click Save) ----
    reporter.startTest('EditTaskDialog: new tag via blur on Save click')
    try {
      // Double-click a task card to open the edit dialog (use CG-T1 "Complete project proposal")
      await page.dblclick('.task-card:has(.task-title:has-text("Complete project proposal"))')
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

      // Type "savetag" in the tag input (no comma, no Enter)
      const tagInput = await page.waitForSelector('[role="dialog"] .tag-input', { timeout: 5000 })
      await tagInput.focus()
      await page.keyboard.type('savetag')

      // Click Save — this blurs the input, which should commit "savetag" as a tag
      await page.click('[role="dialog"] .btn-primary')
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 })

      // Navigate away and back to refresh task state from mock storage
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify the task card now shows "savetag" as a tag badge (rendered as "#savetag")
      const hasSaveTag = await page.evaluate(() => {
        const cards = document.querySelectorAll('.task-card')
        for (const card of cards) {
          const title = card.querySelector('.task-title')
          if (title && title.textContent.trim() === 'Complete project proposal') {
            const badges = card.querySelectorAll('.tag-badge')
            return Array.from(badges).some(b => b.textContent.trim() === '#savetag')
          }
        }
        return false
      })
      if (!hasSaveTag) {
        throw new Error('Expected task "Complete project proposal" to have "#savetag" tag badge after save')
      }

      reporter.pass('Blur on Save commits tag in EditTaskDialog')
    } catch (err) {
      reporter.fail(err)
      try {
        const dialog = await page.$('[role="dialog"]')
        if (dialog) {
          await page.click('[role="dialog"] .btn-secondary')
          await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // ---- Cleanup ----
    reporter.startTest('Cleanup: restore test data')
    try {
      // Remove tags we added to CG-T1 and clean up pending drafts
      await page.evaluate(async () => {
        const app = window.go.main.App
        const tasks = await app.GetTasks()
        const cgT1 = tasks.find(t => t.id === 'CG-T1')
        if (cgT1) {
          // Restore original tags (backend, api)
          await app.UpdateTask({
            ...cgT1,
            tags: ['backend', 'api'],
          })
        }
        // Clear drafts
        await app.SaveTaskDrafts(JSON.stringify({}))
      })

      reporter.pass('Test data cleaned up')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Final error check ----
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
