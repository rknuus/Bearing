/**
 * Tag Round-Trip E2E Tests
 *
 * Verifies that new tags persist correctly through the full
 * frontend -> backend -> filesystem -> reload cycle, ensuring no
 * state mismatch errors.
 *
 * Tests both CreateTaskDialog (comma-creates-tag) and
 * EditTaskDialog (blur-commits-tag) flows.
 *
 * Prerequisites: same as full-flow.test.js
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
  readJSON,
  readThemes,
  getGitCommitCount,
  getTaskFiles,
  isWorkingTreeClean,
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

const reporter = new TestReporter('Tag Round-Trip E2E Tests')

let expectedCommits = 0

function assertCommitCount(label) {
  const actual = getGitCommitCount(DATA_DIR)
  if (actual !== expectedCommits) {
    throw new Error(`${label}: expected ${expectedCommits} commits, got ${actual}`)
  }
}

export async function runTests() {
  console.log('Starting Tag Round-Trip E2E Tests...\n')
  console.log(`Data directory: ${DATA_DIR}\n`)

  expectedCommits = getGitCommitCount(DATA_DIR)

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
    // Setup: Create a theme for tag tests
    // ================================================================

    reporter.startTest('Setup: Create theme for tag tests')
    let themeId
    try {
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.okr-header', { timeout: 10000 })

      await page.click('.btn-primary:has-text("+ Add Theme")')
      await page.waitForSelector('.theme-form', { timeout: 5000 })
      await page.fill('.theme-form input[type="text"]', 'Tag Test Theme')
      await page.click('.theme-form .color-option:nth-child(2)')
      await page.click('.theme-form .btn-primary:has-text("Create")')
      await page.waitForSelector('.theme-pill:has-text("Tag Test Theme")', { timeout: 5000 })

      const themes = readThemes(DATA_DIR)
      const theme = themes.find(t => t.name === 'Tag Test Theme')
      if (!theme) throw new Error('Theme "Tag Test Theme" not found')
      themeId = theme.id

      expectedCommits++
      assertCommitCount('after create theme')

      reporter.pass(`Theme created: id=${themeId}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Test 1: Create task with new tag via comma — round-trip
    // ================================================================

    reporter.startTest('Test 1: Create task with new tag via comma — round-trip')
    try {
      // Navigate to EisenKan board
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.eisenkan-container', { timeout: 10000 })

      // Open CreateTaskDialog
      await page.click('#create-task-btn')
      await page.waitForSelector('.task-entry', { timeout: 5000 })

      // Fill in task title
      await page.fill('#new-task-title', 'Tag Comma Test Task')

      // Select theme
      await page.selectOption('#new-task-theme', themeId)

      // Type a new tag name followed by comma to trigger tag creation
      await page.fill('.tag-input', 'e2e-comma-tag,')

      // Wait for the tag pill to appear as active
      await page.waitForSelector('.tag-pill.active:has-text("e2e-comma-tag")', { timeout: 5000 })

      // The input should be cleared after comma-triggered tag creation
      const inputValue = await page.inputValue('.tag-input')
      if (inputValue.trim() !== '') {
        throw new Error(`Expected tag input to be cleared after comma, got "${inputValue}"`)
      }

      // Stage task to Important & Urgent quadrant
      await page.click('.btn-add:has-text("Important & Urgent")')

      // Verify task appears in the quadrant
      await page.waitForSelector('.quadrant:has-text("Tag Comma Test Task")', { timeout: 5000 })

      // Commit tasks
      await page.click('button:has-text("Commit to Todo")')
      await page.waitForSelector('.task-entry', { state: 'detached', timeout: 10000 })

      // Verify no state mismatch error banner appears
      const alertBanner = await page.locator('[role="alert"]:has-text("Internal state mismatch")').count()
      if (alertBanner > 0) {
        throw new Error('Internal state mismatch error detected after creating task with tag')
      }

      // Verify task file on filesystem
      const todoFiles = getTaskFiles(DATA_DIR, 'todo')
      const taskFile = todoFiles.find(f => {
        const task = readJSON(DATA_DIR, `tasks/todo/${f}`)
        return task.title === 'Tag Comma Test Task'
      })
      if (!taskFile) throw new Error('Task "Tag Comma Test Task" not found in tasks/todo/')

      const task = readJSON(DATA_DIR, `tasks/todo/${taskFile}`)
      if (!task.tags || !task.tags.includes('e2e-comma-tag')) {
        throw new Error(`Expected tags to include "e2e-comma-tag", got ${JSON.stringify(task.tags)}`)
      }

      expectedCommits++
      assertCommitCount('after create task with tag')

      // Verify the tag badge appears on the task card in the EisenKan view
      await page.waitForSelector(`.task-card:has-text("Tag Comma Test Task") .tag-badge:has-text("#e2e-comma-tag")`, { timeout: 5000 })

      reporter.pass(`Task created with tag: id=${task.id}, tags=${JSON.stringify(task.tags)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Test 2: Edit task to add new tag via blur — round-trip
    // ================================================================

    reporter.startTest('Test 2: Edit task to add new tag via blur — round-trip')
    try {
      // Double-click the task card to open EditTaskDialog
      await page.dblclick('.task-card:has-text("Tag Comma Test Task")')
      await page.waitForSelector('#edit-task-title', { timeout: 5000 })

      // Verify the existing tag pill is active
      await page.waitForSelector('.tag-pill.active:has-text("e2e-comma-tag")', { timeout: 5000 })

      // Type a new tag in the input (do NOT press Enter — test blur-commit)
      await page.fill('.tag-input', 'e2e-blur-tag')

      // Click Save, which causes blur on the tag input first (committing the tag),
      // then submits the form
      await page.click('button:has-text("Save")')
      await page.waitForSelector('#edit-task-title', { state: 'detached', timeout: 10000 })

      // Verify no state mismatch error banner
      const alertBanner = await page.locator('[role="alert"]:has-text("Internal state mismatch")').count()
      if (alertBanner > 0) {
        throw new Error('Internal state mismatch error detected after editing task with blur-tag')
      }

      // Verify updated task file on filesystem
      const todoFiles = getTaskFiles(DATA_DIR, 'todo')
      const taskFile = todoFiles.find(f => {
        const task = readJSON(DATA_DIR, `tasks/todo/${f}`)
        return task.title === 'Tag Comma Test Task'
      })
      if (!taskFile) throw new Error('Task "Tag Comma Test Task" not found after edit')

      const updatedTask = readJSON(DATA_DIR, `tasks/todo/${taskFile}`)
      if (!updatedTask.tags || !updatedTask.tags.includes('e2e-blur-tag')) {
        throw new Error(`Expected tags to include "e2e-blur-tag", got ${JSON.stringify(updatedTask.tags)}`)
      }
      if (!updatedTask.tags.includes('e2e-comma-tag')) {
        throw new Error(`Expected tags to still include "e2e-comma-tag", got ${JSON.stringify(updatedTask.tags)}`)
      }

      expectedCommits++
      assertCommitCount('after edit task with blur-tag')

      // Verify both tag badges appear on the task card
      await page.waitForSelector(`.task-card:has-text("Tag Comma Test Task") .tag-badge:has-text("#e2e-blur-tag")`, { timeout: 5000 })
      await page.waitForSelector(`.task-card:has-text("Tag Comma Test Task") .tag-badge:has-text("#e2e-comma-tag")`, { timeout: 5000 })

      reporter.pass(`Task edited with blur-tag: tags=${JSON.stringify(updatedTask.tags)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Final Verification
    // ================================================================

    reporter.startTest('Final: working tree clean and no errors')
    try {
      if (!isWorkingTreeClean(DATA_DIR)) {
        throw new Error('Git working tree has unstaged changes')
      }

      if (pageErrors.length > 0) {
        throw new Error(`Page errors: ${pageErrors.join('; ')}`)
      }
      if (consoleErrors.length > 0) {
        throw new Error(`Console errors: ${consoleErrors.join('; ')}`)
      }

      const totalCommits = getGitCommitCount(DATA_DIR)
      console.log(`    Total git commits: ${totalCommits}`)

      reporter.pass('Working tree clean, no errors')
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
