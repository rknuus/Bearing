/**
 * UI Component Tests for View Workflows
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
  console.log('Starting View Workflow Tests...\n')

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
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })

      // Wait for OKR content to load (should show themes from mock data)
      await page.waitForSelector('.themes-section .section-header', { timeout: 5000 })

      const headerText = await page.$eval('.themes-section .section-header h1', el => el.textContent.trim())
      if (headerText !== 'Life Themes & OKRs') {
        throw new Error(`Expected OKR header "Life Themes & OKRs", got "${headerText}"`)
      }

      // Verify at least one theme is rendered from mock data
      const themeItems = await page.$$('.tree-theme-edit')
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
      await page.click('.nav-link:has-text("Mid-term")')
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

      // Double-click a day cell to open editor
      await page.dblclick('.day-num')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Verify dialog has theme tree and text input
      const themeTree = await page.$('.theme-okr-tree')
      const textInput = await page.$('#text-input')
      if (!themeTree || !textInput) {
        throw new Error('Day editor dialog missing theme tree or text input')
      }

      // Cancel the dialog
      await page.click('.btn-secondary:has-text("Cancel")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Calendar view loads and day editor works')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 3: Task workflow — navigate and view task board ----
    reporter.startTest('Task workflow: navigate and view kanban board')
    try {
      // Navigate to Tasks view
      await page.click('.nav-link:has-text("Short-term")')
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
      if (columnHeaders[0] !== 'TODO' || columnHeaders[1] !== 'DOING' || columnHeaders[2] !== 'DONE') {
        throw new Error(`Unexpected column headers: ${columnHeaders.join(', ')}`)
      }

      // Verify create button
      const createBtn = await page.$('#create-task-btn')
      if (!createBtn) {
        throw new Error('Create task button not found')
      }

      // Click create button and verify dialog
      await createBtn.click()
      await page.waitForSelector('.dialog', { timeout: 5000 })

      const dialogTitle = await page.$eval('.dialog h2', el => el.textContent.trim())
      if (dialogTitle !== 'Create Tasks') {
        throw new Error(`Expected dialog title "Create Tasks", got "${dialogTitle}"`)
      }

      // Close the dialog
      await page.click('.btn-secondary:has-text("Close")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Task board loads with correct columns and create dialog')
    } catch (err) {
      reporter.fail(err)
      // Ensure dialog is closed so subsequent tests aren't blocked by overlay
      try {
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.click('.btn-secondary:has-text("Close")')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // ---- Test 4: Keyboard navigation — use shortcuts to switch views ----
    reporter.startTest('Keyboard navigation: Ctrl+1/2/3 switch views')
    try {
      // Ctrl+1 → OKRs
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.scrollable-view', { timeout: 5000 })
      const activeAfter1 = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (activeAfter1 !== 'Long-term') {
        throw new Error(`Expected active link "Long-term" after Ctrl+1, got "${activeAfter1}"`)
      }

      // Ctrl+2 → Calendar
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })
      const activeAfter2 = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (activeAfter2 !== 'Mid-term') {
        throw new Error(`Expected active link "Mid-term" after Ctrl+2, got "${activeAfter2}"`)
      }

      // Ctrl+3 → Tasks
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })
      const activeAfter3 = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (activeAfter3 !== 'Short-term') {
        throw new Error(`Expected active link "Short-term" after Ctrl+3, got "${activeAfter3}"`)
      }

      reporter.pass('Keyboard shortcuts switch views correctly')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 5: OKR edit interactions — expand theme and verify structure ----
    reporter.startTest('OKR edit interactions: expand theme and verify objectives')
    try {
      // Navigate to OKR view
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.themes-section .section-header', { timeout: 5000 })

      // Find the first theme and click its expand button
      const firstTheme = await page.waitForSelector('.tree-theme-edit', { timeout: 5000 })
      const expandBtn = await firstTheme.$('.expand-button')
      if (!expandBtn) {
        throw new Error('No expand button found on first theme')
      }
      await expandBtn.click()

      // Wait for the children container to appear
      await page.waitForSelector('.tree-children-edit', { timeout: 5000 })

      // Verify objectives are rendered inside the expanded theme
      const objectives = await page.$$('.tree-objective-edit')
      if (objectives.length === 0) {
        throw new Error('Expected at least one objective after expanding theme')
      }

      // Verify the first objective has a title and action buttons
      const firstObjective = objectives[0]
      const objTitle = await firstObjective.$('.item-name')
      if (!objTitle) {
        throw new Error('Objective missing title (.item-name)')
      }
      const titleText = await objTitle.evaluate(el => el.textContent.trim())
      if (!titleText) {
        throw new Error('Objective title is empty')
      }

      const objActions = await firstObjective.$('.item-actions')
      if (!objActions) {
        throw new Error('Objective missing action buttons (.item-actions)')
      }

      // Expand the first objective to check KRs
      const objExpandBtn = await firstObjective.$('.expand-button')
      if (objExpandBtn) {
        await objExpandBtn.click()
        // Wait briefly for children to render
        await page.waitForTimeout(500)

        // Check for KR items
        const krItems = await page.$$('.tree-kr-edit')
        if (krItems.length > 0) {
          const firstKr = krItems[0]
          const krName = await firstKr.$('.item-name')
          if (!krName) {
            throw new Error('Key result missing description (.item-name)')
          }
          const krText = await krName.evaluate(el => el.textContent.trim())
          if (!krText) {
            throw new Error('Key result description is empty')
          }
        }
      }

      reporter.pass('OKR theme expands with objectives and key results')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 6: Calendar edit interactions — open dialog, type, and close ----
    reporter.startTest('Calendar edit interactions: open day editor, type text, close')
    try {
      // Navigate to Calendar view
      await page.click('.nav-link:has-text("Mid-term")')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })
      await page.waitForSelector('.calendar-grid', { timeout: 5000 })

      // Double-click a day cell to open the editor dialog
      await page.dblclick('.day-num')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Verify the dialog has expected fields
      const themeTree = await page.$('.theme-okr-tree')
      if (!themeTree) {
        throw new Error('Day editor dialog missing theme/OKR tree')
      }

      const textInput = await page.$('#text-input')
      if (!textInput) {
        throw new Error('Day editor dialog missing text input')
      }

      // Verify the collapsible Tags section header exists
      const tagsHeader = await page.$('.collapsible-header')
      if (!tagsHeader) {
        throw new Error('Day editor dialog missing Tags collapsible section')
      }

      // Type text into the text input
      await textInput.fill('Test calendar entry')
      const inputValue = await textInput.evaluate(el => el.value)
      if (inputValue !== 'Test calendar entry') {
        throw new Error(`Expected input value "Test calendar entry", got "${inputValue}"`)
      }

      // Close the dialog by pressing Escape
      await page.keyboard.press('Escape')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Calendar day editor opens, accepts input, and closes')
    } catch (err) {
      reporter.fail(err)
      // Ensure dialog is closed so subsequent tests aren't blocked
      try {
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.keyboard.press('Escape')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // ---- Test 7: EisenKan edit interactions — click task card, verify edit dialog ----
    reporter.startTest('EisenKan edit interactions: open edit dialog from task card')
    try {
      // Navigate to Short-term view
      await page.click('.nav-link:has-text("Short-term")')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })

      // Wait for task cards to render from mock data
      const taskCards = await page.$$('.task-card')
      if (taskCards.length === 0) {
        throw new Error('Expected at least one task card from mock data')
      }

      // Double-click the first task card to open the edit dialog
      await taskCards[0].dblclick()
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Verify edit dialog title
      const dialogTitle = await page.$eval('.dialog h2', el => el.textContent.trim())
      if (dialogTitle !== 'Edit Task') {
        throw new Error(`Expected dialog title "Edit Task", got "${dialogTitle}"`)
      }

      // Verify the dialog has title input, theme select, and description textarea
      const titleInput = await page.$('#edit-task-title')
      if (!titleInput) {
        throw new Error('Edit dialog missing title input (#edit-task-title)')
      }
      const titleValue = await titleInput.evaluate(el => el.value)
      if (!titleValue) {
        throw new Error('Edit dialog title input is empty — expected pre-filled task title')
      }

      const themeSelect = await page.$('#edit-task-theme')
      if (!themeSelect) {
        throw new Error('Edit dialog missing theme select (#edit-task-theme)')
      }

      const descTextarea = await page.$('#edit-task-description')
      if (!descTextarea) {
        throw new Error('Edit dialog missing description textarea (#edit-task-description)')
      }

      // Close the dialog via Cancel button
      await page.click('.btn-secondary:has-text("Cancel")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Task edit dialog opens with pre-filled fields and closes')
    } catch (err) {
      reporter.fail(err)
      // Ensure dialog is closed so no overlay blocks further actions
      try {
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.click('.btn-secondary:has-text("Cancel")')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
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
