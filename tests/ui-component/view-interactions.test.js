/**
 * UI Component Tests for View Interactions
 * Tests: filter workflows, calendar features, section/column folding,
 * OKR inline editing, staging buttons, and cross-view navigation.
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

const reporter = new TestReporter('View Interaction Tests')

export async function runTests() {
  console.log('Starting View Interaction Tests...\n')

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

    // Load app
    await page.goto(TEST_CONFIG.WAILS_DEV_URL, {
      waitUntil: 'networkidle',
      timeout: TEST_CONFIG.TIMEOUT,
    })

    // ---- Task 201: Filter workflow ----

    // Sub-test 1: ThemeFilterBar and TagFilterBar render on Tasks view
    reporter.startTest('201a: Filter bars render on Tasks view')
    try {
      await page.click('.nav-link:has-text("Short-term")')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })

      // Verify ThemeFilterBar renders
      await page.waitForSelector('.theme-filter-bar', { timeout: 5000 })
      const themeLabel = await page.$eval('.theme-filter-bar .filter-label', el => el.textContent.trim())
      if (!themeLabel.includes('Filter by theme')) {
        throw new Error(`Expected "Filter by theme" label, got "${themeLabel}"`)
      }

      // Verify TagFilterBar renders
      await page.waitForSelector('.tag-filter-bar', { timeout: 5000 })
      const tagLabel = await page.$eval('.tag-filter-bar .filter-label', el => el.textContent.trim())
      if (!tagLabel.includes('Filter by tag')) {
        throw new Error(`Expected "Filter by tag" label, got "${tagLabel}"`)
      }

      reporter.pass('Filter bars render correctly')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 2: Click a theme pill to filter tasks
    reporter.startTest('201b: Theme pill filters tasks')
    try {
      // Click "Career Growth" theme pill
      await page.click('.theme-filter-bar .theme-pill:has-text("Career Growth")')

      // Wait for filter to take effect
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.theme-filter-bar .theme-pill.active')
        return pills.length > 0
      }, { timeout: 5000 })

      // Verify only CG tasks are visible (CG-T1 in todo, CG-T2 in doing)
      const visibleTitles = await page.$$eval('.task-title', els => els.map(el => el.textContent.trim()))
      const cgTitles = ['Complete project proposal', 'Respond to emails']
      for (const title of cgTitles) {
        if (!visibleTitles.includes(title)) {
          throw new Error(`Expected CG task "${title}" visible, got: [${visibleTitles.join(', ')}]`)
        }
      }
      // HF and PF tasks should not be visible
      if (visibleTitles.includes('Review quarterly goals')) {
        throw new Error('HF task should be filtered out')
      }
      if (visibleTitles.includes('Review budget spreadsheet')) {
        throw new Error('PF task should be filtered out')
      }

      reporter.pass('Theme filter shows only matching tasks')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 3: All pill resets filter
    reporter.startTest('201c: All pill resets theme filter')
    try {
      await page.click('.theme-filter-bar .all-pill')

      // Wait for all tasks to reappear
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.theme-filter-bar .theme-pill.active')
        return pills.length === 0
      }, { timeout: 5000 })

      // Verify All pill is active
      const allActive = await page.$eval('.theme-filter-bar .all-pill', el => el.classList.contains('active'))
      if (!allActive) {
        throw new Error('All pill should be active after reset')
      }

      // Verify all tasks are visible again (at least CG and HF tasks)
      await page.waitForSelector('.task-title:has-text("Complete project proposal")', { timeout: 5000 })
      await page.waitForSelector('.task-title:has-text("Review quarterly goals")', { timeout: 5000 })

      reporter.pass('All pill resets theme filter')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 4: Tag pill filters tasks
    reporter.startTest('201d: Tag pill filters tasks')
    try {
      // Click "backend" tag pill
      await page.click('.tag-filter-bar .tag-pill:has-text("#backend")')

      // Wait for filter to take effect
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.tag-filter-bar .tag-pill.active')
        return pills.length > 0
      }, { timeout: 5000 })

      // Only CG-T1 has the "backend" tag
      const visibleTitles = await page.$$eval('.task-title', els => els.map(el => el.textContent.trim()))
      if (!visibleTitles.includes('Complete project proposal')) {
        throw new Error(`Expected CG-T1 visible with "backend" tag, got: [${visibleTitles.join(', ')}]`)
      }
      // Other tasks without "backend" tag should not be visible
      if (visibleTitles.includes('Review quarterly goals')) {
        throw new Error('HF-T1 should be filtered out (no backend tag)')
      }

      // Reset tag filter
      await page.click('.tag-filter-bar .all-pill')
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.tag-filter-bar .tag-pill.active')
        return pills.length === 0
      }, { timeout: 5000 })

      reporter.pass('Tag filter shows only matching tasks')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 5: Untagged pill filters
    reporter.startTest('201e: Untagged pill filters tasks without tags')
    try {
      // Click "Untagged" pill
      await page.click('.tag-filter-bar .untagged-pill')

      await page.waitForFunction(() => {
        const pill = document.querySelector('.tag-filter-bar .untagged-pill')
        return pill && pill.classList.contains('active')
      }, { timeout: 5000 })

      // HF-T1 and PF-T1 have no tags
      const visibleTitles = await page.$$eval('.task-title', els => els.map(el => el.textContent.trim()))
      if (!visibleTitles.includes('Review quarterly goals')) {
        throw new Error(`Expected untagged HF-T1 visible, got: [${visibleTitles.join(', ')}]`)
      }
      if (!visibleTitles.includes('Review budget spreadsheet')) {
        throw new Error(`Expected untagged PF-T1 visible, got: [${visibleTitles.join(', ')}]`)
      }
      // Tagged tasks should not be visible
      if (visibleTitles.includes('Complete project proposal')) {
        throw new Error('Tagged CG-T1 should be filtered out')
      }

      // Reset
      await page.click('.tag-filter-bar .all-pill')
      await page.waitForFunction(() => {
        const pill = document.querySelector('.tag-filter-bar .untagged-pill')
        return !pill || !pill.classList.contains('active')
      }, { timeout: 5000 })

      reporter.pass('Untagged pill shows only untagged tasks')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 6: Combined theme + tag filter
    reporter.startTest('201f: Combined theme + tag filter')
    try {
      // Filter by Career Growth theme first
      await page.click('.theme-filter-bar .theme-pill:has-text("Career Growth")')
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.theme-filter-bar .theme-pill.active')
        return pills.length > 0
      }, { timeout: 5000 })

      // Then filter by "urgent" tag
      await page.click('.tag-filter-bar .tag-pill:has-text("#urgent")')
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.tag-filter-bar .tag-pill.active')
        return pills.length > 0
      }, { timeout: 5000 })

      // Only CG-T2 has both CG theme and "urgent" tag
      const visibleTitles = await page.$$eval('.task-title', els => els.map(el => el.textContent.trim()))
      if (!visibleTitles.includes('Respond to emails')) {
        throw new Error(`Expected CG-T2 visible with combined filter, got: [${visibleTitles.join(', ')}]`)
      }
      if (visibleTitles.includes('Complete project proposal')) {
        throw new Error('CG-T1 should be filtered out (no "urgent" tag)')
      }

      // Reset both filters
      await page.click('.theme-filter-bar .all-pill')
      await page.click('.tag-filter-bar .all-pill')

      reporter.pass('Combined theme + tag filter narrows results')
    } catch (err) {
      reporter.fail(err)
      // Best effort cleanup
      try {
        const activeThemePills = await page.$$('.theme-filter-bar .theme-pill.active')
        if (activeThemePills.length > 0) await page.click('.theme-filter-bar .all-pill')
        const activeTagPills = await page.$$('.tag-filter-bar .tag-pill.active')
        if (activeTagPills.length > 0) await page.click('.tag-filter-bar .all-pill')
      } catch { /* best effort */ }
    }

    // ---- Task 202: Calendar features ----

    // Sub-test 7: Calendar grid structure
    reporter.startTest('202a: Calendar grid structure with 12 months and today indicator')
    try {
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      // Verify 12 month headers
      const monthHeaders = await page.$$('.month-header')
      if (monthHeaders.length !== 12) {
        throw new Error(`Expected 12 month headers, got ${monthHeaders.length}`)
      }

      // Verify today indicator exists (current date should have .today class)
      const todayCells = await page.$$('.day-num.today')
      if (todayCells.length === 0) {
        throw new Error('Expected at least one today indicator (.day-num.today)')
      }

      // Verify day rows exist (at least 28 per month)
      const dayNums = await page.$$('.day-num')
      if (dayNums.length < 28 * 12) {
        throw new Error(`Expected at least ${28 * 12} day cells, got ${dayNums.length}`)
      }

      reporter.pass('Calendar grid has 12 months, day rows, and today indicator')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 8: Multi-theme day focus with gradient
    reporter.startTest('202b: Multi-theme day focus shows gradient styling')
    try {
      // Use mock API to set two themes on a day
      await page.evaluate(async () => {
        const app = window.go.main.App
        await app.SaveDayFocus({
          date: '2026-03-15',
          themeIds: ['HF', 'CG'],
          notes: '',
          text: 'Multi-theme day',
        })
      })

      // Navigate away and back to refresh
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.okr-header', { timeout: 5000 })
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      // Verify gradient styling on the day text cell
      const hasGradient = await page.waitForFunction(() => {
        const cells = document.querySelectorAll('.day-text')
        return Array.from(cells).some(c => {
          const style = c.getAttribute('style') || ''
          return style.includes('linear-gradient')
        })
      }, { timeout: 5000 })

      if (!hasGradient) {
        throw new Error('Expected gradient styling for multi-theme day')
      }

      reporter.pass('Multi-theme day shows gradient styling')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 9: Auto-ancestor OKR selection in day editor
    reporter.startTest('202c: Auto-ancestor OKR selection in day editor')
    try {
      // Click a day to open the editor
      await page.dblclick('.day-num.today')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Expand HF theme in the tree
      const hfExpandBtn = await page.$('.tree-theme-item:has(.tree-item-name:has-text("Health & Fitness")) .tree-expand-button')
      if (hfExpandBtn) {
        await hfExpandBtn.click()
        // Wait for children to render
        await page.waitForSelector('.tree-objective-item', { timeout: 5000 })

        // Expand the first objective (HF-O1: Improve cardiovascular health)
        const objExpandBtn = await page.$('.tree-objective-item:has(.tree-item-name:has-text("Improve cardiovascular health")) .tree-expand-button')
        if (objExpandBtn) {
          await objExpandBtn.click()
          await page.waitForSelector('.tree-kr-item', { timeout: 5000 })

          // Check a KR checkbox (should auto-select parent objective and theme)
          // Use an active KR — completed KRs are hidden in select mode
          const krCheckbox = await page.$('.tree-kr-item:has(.tree-item-name:has-text("Exercise 4 times")) input[type="checkbox"]')
          if (krCheckbox) {
            await krCheckbox.click()

            // Verify parent objective checkbox is now checked
            const objChecked = await page.$eval(
              '.tree-objective-item:has(.tree-item-name:has-text("Improve cardiovascular health")) input[type="checkbox"]',
              el => el.checked
            )
            if (!objChecked) {
              throw new Error('Parent objective should be auto-selected when KR is checked')
            }

            // Verify theme checkbox is now checked
            const themeChecked = await page.$eval(
              '.tree-theme-item:has(.tree-item-name:has-text("Health & Fitness")) input[type="checkbox"]',
              el => el.checked
            )
            if (!themeChecked) {
              throw new Error('Theme should be auto-selected when KR is checked')
            }
          } else {
            throw new Error('KR checkbox not found')
          }
        } else {
          throw new Error('Objective expand button not found')
        }
      } else {
        throw new Error('HF theme expand button not found')
      }

      // Cancel the dialog
      await page.click('.btn-secondary:has-text("Cancel")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Auto-ancestor OKR selection works correctly')
    } catch (err) {
      reporter.fail(err)
      // Ensure dialog is closed
      try {
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.click('.btn-secondary:has-text("Cancel")')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // Sub-test 10: Day editor fold state persists
    reporter.startTest('202d: Day editor fold state persists across reopens')
    try {
      // Open the day editor
      await page.dblclick('.day-num.today')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Expand HF theme
      const hfItem = await page.$('.tree-theme-item:has(.tree-item-name:has-text("Health & Fitness"))')
      const isExpanded = await hfItem?.$('.tree-children')
      if (!isExpanded) {
        await page.click('.tree-theme-item:has(.tree-item-name:has-text("Health & Fitness")) .tree-expand-button')
        await page.waitForSelector('.tree-theme-item:has(.tree-item-name:has-text("Health & Fitness")) .tree-children', { timeout: 5000 })
      }

      // Save to persist fold state
      await page.click('.btn-primary:has-text("Save")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Reopen the same day
      await page.dblclick('.day-num.today')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Verify HF theme is still expanded (fold state persisted)
      const childrenVisible = await page.$('.tree-theme-item:has(.tree-item-name:has-text("Health & Fitness")) .tree-children')
      if (!childrenVisible) {
        throw new Error('Theme fold state should persist after save and reopen')
      }

      // Close dialog
      await page.click('.btn-secondary:has-text("Cancel")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      reporter.pass('Day editor fold state persists')
    } catch (err) {
      reporter.fail(err)
      try {
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.click('.btn-secondary:has-text("Cancel")')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // ---- Task 203: Section/column folding ----

    // Sub-test 11: Collapse a priority section
    reporter.startTest('203a: Collapse priority section hides task cards')
    try {
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify Important & Urgent section has tasks before collapsing
      await page.waitForSelector('.section-important-urgent .task-card', { timeout: 5000 })

      // Click the section fold button (first section in TODO column)
      await page.click('.section-important-urgent .section-fold-btn')

      // Verify section content has collapsed-section class
      await page.waitForFunction(() => {
        const section = document.querySelector('.section-important-urgent .column-content')
        return section && section.classList.contains('collapsed-section')
      }, { timeout: 5000 })

      // Verify cards are not visible (overflow: hidden with height: 0)
      const sectionHeight = await page.$eval(
        '.section-important-urgent .column-content',
        el => el.offsetHeight
      )
      if (sectionHeight > 0) {
        throw new Error(`Expected collapsed section height 0, got ${sectionHeight}`)
      }

      reporter.pass('Collapsed section hides task cards')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 12: Expand section restores task cards
    reporter.startTest('203b: Expand section restores task cards')
    try {
      // Click fold button again to expand
      await page.click('.section-important-urgent .section-fold-btn')

      // Verify section content no longer has collapsed-section class
      await page.waitForFunction(() => {
        const section = document.querySelector('.section-important-urgent .column-content')
        return section && !section.classList.contains('collapsed-section')
      }, { timeout: 5000 })

      // Verify task cards are visible again
      await page.waitForSelector('.section-important-urgent .task-card', { timeout: 5000 })

      reporter.pass('Expanded section shows task cards')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 13: Collapse entire column
    reporter.startTest('203c: Collapse column narrows it')
    try {
      // Click column fold button on DOING column
      const doingCol = await page.$('.kanban-column:has(h2:has-text("DOING"))')
      await doingCol.$eval('.column-fold-btn', el => el.click())

      // Verify the column has the collapsed-column class
      await page.waitForFunction(() => {
        const cols = document.querySelectorAll('.kanban-column')
        return Array.from(cols).some(c => c.classList.contains('collapsed-column'))
      }, { timeout: 5000 })

      // Verify the collapsed column strip is visible
      await page.waitForSelector('.collapsed-column-strip', { timeout: 5000 })

      reporter.pass('Collapsed column narrows and shows strip')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 14: Expand column restores it
    reporter.startTest('203d: Expand column restores it')
    try {
      // Click the collapsed strip to expand
      await page.click('.collapsed-column-strip')

      // Verify no more collapsed columns
      await page.waitForFunction(() => {
        const cols = document.querySelectorAll('.kanban-column.collapsed-column')
        return cols.length === 0
      }, { timeout: 5000 })

      // Verify DOING column header visible again
      await page.waitForSelector('.kanban-column:has(h2:has-text("DOING")) .column-header', { timeout: 5000 })

      reporter.pass('Expanded column restores full width')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Task 204: OKR inline editing and tag filtering ----

    // Sub-test 15: Inline edit a theme name
    reporter.startTest('204a: Inline edit theme name')
    try {
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      // Find PF theme by evaluating DOM text content
      const pfThemeSelector = await page.evaluate(() => {
        const themes = document.querySelectorAll('.tree-theme-edit')
        for (let i = 0; i < themes.length; i++) {
          const name = themes[i].querySelector('.theme-pill')
          if (name && name.textContent.trim() === 'Personal Finance') {
            return `.tree-theme-edit:nth-child(${i + 1})`
          }
        }
        return null
      })
      if (!pfThemeSelector) throw new Error('Personal Finance theme not found')

      // Hover to reveal actions
      await page.hover(`${pfThemeSelector} > .item-header`)

      // Click edit button
      await page.click(`${pfThemeSelector} button[title="Edit"]`)

      // Verify inline edit input appears
      await page.waitForSelector(`${pfThemeSelector} .inline-edit`, { timeout: 5000 })

      // Clear and type new name
      await page.fill(`${pfThemeSelector} .inline-edit`, 'Personal Finance Edited')

      // Click save button
      await page.click(`${pfThemeSelector} button[title="Save"]`)

      // Verify updated name is displayed
      await page.waitForSelector('.theme-pill:has-text("Personal Finance Edited")', { timeout: 5000 })

      reporter.pass('Theme name edited inline')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 16: Inline edit an objective title
    reporter.startTest('204b: Inline edit objective title')
    try {
      // Expand HF theme
      const hfTheme = await page.$('.tree-theme-edit:has(.theme-pill:has-text("Health & Fitness"))')
      const hfExpanded = await hfTheme?.$('.tree-children-edit')
      if (!hfExpanded) {
        await page.click('.tree-theme-edit:has(.theme-pill:has-text("Health & Fitness")) .expand-button')
        await page.waitForSelector('.tree-theme-edit:has(.theme-pill:has-text("Health & Fitness")) .tree-children-edit', { timeout: 5000 })
      }

      // Hover to reveal actions on first objective
      await page.hover('.tree-objective-edit:has(.item-name:has-text("Improve cardiovascular health")) .objective-header')

      // Click edit button
      await page.click('.tree-objective-edit:has(.item-name:has-text("Improve cardiovascular health")) button[title="Edit"]')

      // Verify inline edit appears
      await page.waitForSelector('.tree-objective-edit .inline-edit', { timeout: 5000 })

      // Change the title
      await page.fill('.tree-objective-edit .inline-edit', 'Improve cardiovascular health v2')

      // Save via save button
      await page.click('.tree-objective-edit button[title="Save"]')

      // Verify updated title
      await page.waitForSelector('.item-name:has-text("Improve cardiovascular health v2")', { timeout: 5000 })

      reporter.pass('Objective title edited inline')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 17: Escape cancels inline edit
    reporter.startTest('204c: Escape cancels inline edit')
    try {
      // Start editing the objective again
      await page.hover('.tree-objective-edit:has(.item-name:has-text("Improve cardiovascular health v2")) .objective-header')
      await page.click('.tree-objective-edit:has(.item-name:has-text("Improve cardiovascular health v2")) button[title="Edit"]')
      await page.waitForSelector('.tree-objective-edit .inline-edit', { timeout: 5000 })

      // Type a different value
      await page.fill('.tree-objective-edit .inline-edit', 'Should be cancelled')

      // Press Escape
      await page.keyboard.press('Escape')

      // Verify original value is restored (edit mode cancelled)
      await page.waitForSelector('.item-name:has-text("Improve cardiovascular health v2")', { timeout: 5000 })

      // Verify no inline-edit input is present
      const editInputs = await page.$$('.tree-objective-edit .inline-edit')
      if (editInputs.length > 0) {
        throw new Error('Inline edit should be dismissed after Escape')
      }

      reporter.pass('Escape cancels inline edit and restores original')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 18: OKR tag filtering
    reporter.startTest('204d: OKR tag filtering shows matching objectives')
    try {
      // OKR view should have tag filter bar (HF-O1 has tags: Q1, health; CG-O1 has tags: blocked)
      await page.waitForSelector('.tag-filter-bar', { timeout: 5000 })

      // Click "Q1" tag pill (use text selector, not :has-text inside waitForFunction)
      await page.click('.tag-filter-bar .tag-pill:has-text("#Q1")')

      // Wait for the pill to become active
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.tag-filter-bar .tag-pill.active')
        return pills.length > 0
      }, { timeout: 5000 })

      // HF theme should be visible (has objective with Q1 tag)
      await page.waitForSelector('.theme-pill:has-text("Health & Fitness")', { timeout: 5000 })

      // CG theme should be filtered out (no Q1 tag)
      const cgVisible = await page.evaluate(() => {
        const names = document.querySelectorAll('.tree-theme-edit .theme-pill')
        return Array.from(names).some(n => n.textContent.trim() === 'Career Growth')
      })
      if (cgVisible) {
        throw new Error('Career Growth theme should be filtered out (no Q1 tag)')
      }

      // Reset filter
      await page.click('.tag-filter-bar .all-pill')
      await page.waitForFunction(() => {
        const pills = document.querySelectorAll('.tag-filter-bar .tag-pill.active')
        return pills.length === 0
      }, { timeout: 5000 })

      reporter.pass('OKR tag filter shows matching objectives')
    } catch (err) {
      reporter.fail(err)
      // Best effort reset
      try {
        const activeTagPills = await page.$$('.tag-filter-bar .tag-pill.active')
        if (activeTagPills.length > 0) await page.click('.tag-filter-bar .all-pill')
      } catch { /* best effort */ }
    }

    // ---- Task 205: Staging buttons and cross-view navigation ----

    // Sub-test 19: Create dialog has 3 staging buttons with full labels
    reporter.startTest('205a: Create dialog shows 3 staging buttons with full labels')
    try {
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Open create dialog
      await page.click('#create-task-btn')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Verify 3 staging buttons
      const addButtons = await page.$$('.btn-add')
      if (addButtons.length !== 3) {
        throw new Error(`Expected 3 staging buttons, got ${addButtons.length}`)
      }

      // Verify button labels contain full priority names
      const buttonTexts = await page.$$eval('.btn-add', els => els.map(el => el.textContent.trim()))
      const expectedLabels = ['Important & Urgent', 'Not Important & Urgent', 'Important & Not Urgent']
      for (const label of expectedLabels) {
        if (!buttonTexts.some(t => t.includes(label))) {
          throw new Error(`Expected button with label "${label}", got: [${buttonTexts.join(', ')}]`)
        }
      }

      // Verify "Stage to" prefix
      for (const text of buttonTexts) {
        if (!text.startsWith('Stage to')) {
          throw new Error(`Expected "Stage to" prefix, got "${text}"`)
        }
      }

      reporter.pass('Create dialog has 3 staging buttons with "Stage to" prefix')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 20: Stage a task via button and verify
    reporter.startTest('205b: Stage task via button and commit')
    try {
      // Fill in task title
      await page.fill('#new-task-title', 'Staged Test Task')

      // Click the first "Stage to" button (Important & Urgent)
      await page.click('.btn-add:has-text("Important & Urgent")')

      // Verify task appears in the Important & Urgent quadrant as a pending task
      await page.waitForFunction(() => {
        const titles = document.querySelectorAll('.pending-task .task-title')
        return Array.from(titles).some(el => el.textContent.trim() === 'Staged Test Task')
      }, { timeout: 5000 })

      // Commit the task
      await page.click('.btn-primary:has-text("Commit to Todo")')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Refresh the view by navigating away and back
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.okr-header', { timeout: 5000 })
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Verify task appears in Important & Urgent section
      await page.waitForSelector('.section-important-urgent .task-title:has-text("Staged Test Task")', { timeout: 5000 })

      reporter.pass('Task staged and committed to correct quadrant')
    } catch (err) {
      reporter.fail(err)
      // Close dialog if still open
      try {
        const dialog = await page.$('.dialog')
        if (dialog) {
          await page.click('.btn-secondary:has-text("Close")')
          await page.waitForSelector('.dialog', { state: 'detached', timeout: 3000 })
        }
      } catch { /* best effort */ }
    }

    // Sub-test 21: Theme name click navigates to OKR view
    reporter.startTest('205c: Theme name on task card navigates to OKR view')
    try {
      // Ensure we're on Tasks view
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.kanban-board', { timeout: 5000 })

      // Click a theme name button on a task card
      await page.click('.theme-badge:has-text("Career Growth")')

      // Verify we navigated to OKR view
      await page.waitForSelector('.okr-header', { timeout: 5000 })
      const activeNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (activeNav !== 'Long-term') {
        throw new Error(`Expected OKRs active after theme click, got "${activeNav}"`)
      }

      reporter.pass('Theme name click navigates to OKR view')
    } catch (err) {
      reporter.fail(err)
    }

    // Sub-test 22: Keyboard shortcuts preserve context across view switches
    reporter.startTest('205d: Keyboard shortcuts preserve view context')
    try {
      // Start on OKRs (from previous test)
      await page.waitForSelector('.okr-header', { timeout: 5000 })

      // Switch to Calendar
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })
      const calNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (calNav !== 'Mid-term') {
        throw new Error(`Expected Calendar active, got "${calNav}"`)
      }

      // Switch to Tasks
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.eisenkan-container', { timeout: 5000 })
      const taskNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (taskNav !== 'Short-term') {
        throw new Error(`Expected Tasks active, got "${taskNav}"`)
      }

      // Switch back to OKRs
      await page.keyboard.press('Control+1')
      await page.waitForSelector('.okr-header', { timeout: 5000 })
      const okrNav = await page.$eval('.nav-link.active', el => el.textContent.trim())
      if (okrNav !== 'Long-term') {
        throw new Error(`Expected OKRs active, got "${okrNav}"`)
      }

      reporter.pass('Keyboard shortcuts switch views with correct active nav')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Cleanup ----

    // Clean up test data
    reporter.startTest('Cleanup: remove test data')
    try {
      // Delete the test task we created
      await page.evaluate(async () => {
        const app = window.go.main.App
        const tasks = await app.GetTasks()
        const testTask = tasks.find(t => t.title === 'Staged Test Task')
        if (testTask) await app.DeleteTask(testTask.id)
      })

      // Revert the edited theme name
      await page.evaluate(async () => {
        const app = window.go.main.App
        const themes = await app.GetThemes()
        const pf = themes.find(t => t.id === 'PF')
        if (pf && pf.name === 'Personal Finance Edited') {
          await app.UpdateTheme({ ...pf, name: 'Personal Finance' })
        }
      })

      // Revert the edited objective title
      await page.evaluate(async () => {
        const app = window.go.main.App
        const themes = await app.GetThemes()
        for (const theme of themes) {
          for (const obj of theme.objectives) {
            if (obj.title === 'Improve cardiovascular health v2') {
              await app.UpdateObjective(obj.id, 'Improve cardiovascular health', obj.tags || [])
            }
          }
        }
      })

      // Clear the multi-theme day
      await page.evaluate(async () => {
        const app = window.go.main.App
        await app.ClearDayFocus('2026-03-15')
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
