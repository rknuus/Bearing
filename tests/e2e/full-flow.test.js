/**
 * True E2E Tests for Full User Flow with File Verification
 *
 * Tests the complete Bearing journey against the real Go backend via Wails dev
 * server (localhost:34115). After each state-changing operation, verifies the
 * actual JSON files and git commits in the data directory.
 *
 * Prerequisites:
 * - Wails dev server running with BEARING_DATA_DIR set to a temp directory:
 *   BEARING_DATA_DIR=/tmp/bearing-e2e wails dev
 * - The data directory must be empty/fresh before running tests.
 *
 * The BEARING_DATA_DIR env var must also be set in this process so the test
 * can read the files.
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
  readJSON,
  readThemes,
  getGitLog,
  getGitCommitCount,
  assertFileExists,
  assertFileNotExists,
  assertDirExists,
  assertDirNotExists,
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

const reporter = new TestReporter('Full Flow E2E Tests')

// Track expected commit count as we go
let expectedCommits = 0

function assertCommitCount(label) {
  const actual = getGitCommitCount(DATA_DIR)
  if (actual !== expectedCommits) {
    throw new Error(`${label}: expected ${expectedCommits} commits, got ${actual}`)
  }
}

function assertLatestCommitContains(substring) {
  const log = getGitLog(DATA_DIR)
  if (!log[0].includes(substring)) {
    throw new Error(`Latest commit "${log[0]}" does not contain "${substring}"`)
  }
}

export async function runTests() {
  console.log('Starting Full Flow E2E Tests...\n')
  console.log(`Data directory: ${DATA_DIR}\n`)

  // Record initial commit count (repo init creates an initial commit)
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
    // Phase 1: OKR Setup
    // ================================================================

    // ---- 1a: Create theme ----
    reporter.startTest('Phase 1a: Create theme and verify files')
    try {
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.okr-header', { timeout: 10000 })

      await page.click('.btn-primary:has-text("+ Add Theme")')
      await page.waitForSelector('.theme-form', { timeout: 5000 })
      await page.fill('.theme-form input[type="text"]', 'E2E Theme')
      await page.click('.theme-form .color-option:nth-child(3)')
      await page.click('.theme-form .btn-primary:has-text("Create")')
      await page.waitForSelector('.theme-pill:has-text("E2E Theme")', { timeout: 5000 })

      // Verify files
      assertFileExists(DATA_DIR, 'themes/themes.json')
      const themes = readThemes(DATA_DIR)
      if (themes.length < 1) throw new Error('Expected at least 1 theme')
      const theme = themes.find(t => t.name === 'E2E Theme')
      if (!theme) throw new Error('Theme "E2E Theme" not found in themes.json')
      if (!theme.id) throw new Error('Theme has no ID')
      if (!theme.color) throw new Error('Theme has no color')

      expectedCommits++
      assertCommitCount('after create theme')
      assertLatestCommitContains('Add theme')

      reporter.pass(`Theme created: id=${theme.id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // Read the theme ID for use in subsequent tests
    const themes = readThemes(DATA_DIR)
    const themeId = themes.find(t => t.name === 'E2E Theme')?.id || 'UNKNOWN'

    // ---- 1b: Create objective ----
    reporter.startTest('Phase 1b: Create objective and verify files')
    try {
      await page.click('.tree-theme-edit:last-child .expand-button')
      await page.waitForSelector('.tree-theme-edit:last-child .empty-state .link-button', { timeout: 5000 })
      await page.click('.tree-theme-edit:last-child .empty-state .link-button')
      await page.waitForSelector('.tree-theme-edit:last-child .objective-form', { timeout: 5000 })
      await page.fill('.tree-theme-edit:last-child .objective-form input[type="text"]', 'E2E Objective')
      await page.click('.tree-theme-edit:last-child .objective-form .btn-primary')
      await page.waitForSelector('.tree-theme-edit:last-child .tree-objective-edit', { timeout: 5000 })

      // Verify files
      const themesAfterObj = readThemes(DATA_DIR)
      const themeWithObj = themesAfterObj.find(t => t.name === 'E2E Theme')
      if (!themeWithObj.objectives || themeWithObj.objectives.length < 1) {
        throw new Error('Expected at least 1 objective')
      }
      const obj = themeWithObj.objectives.find(o => o.title === 'E2E Objective')
      if (!obj) throw new Error('Objective "E2E Objective" not found')
      if (!obj.id.startsWith(themeId)) throw new Error(`Objective ID "${obj.id}" should start with "${themeId}"`)

      expectedCommits++
      assertCommitCount('after create objective')

      reporter.pass(`Objective created: id=${obj.id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 1c: Create key result ----
    reporter.startTest('Phase 1c: Create key result and verify files')
    try {
      await page.hover('.tree-theme-edit:last-child .tree-objective-edit .objective-header')
      await page.click('.tree-theme-edit:last-child .tree-objective-edit button[title="Add Key Result"]')
      await page.waitForSelector('.tree-theme-edit:last-child .kr-form', { timeout: 5000 })
      await page.fill('.tree-theme-edit:last-child .kr-form input[type="text"]', 'E2E Key Result')
      await page.click('.tree-theme-edit:last-child .kr-form .btn-primary')
      await page.waitForSelector('.tree-theme-edit:last-child .tree-kr-edit', { timeout: 5000 })

      // Verify files
      const themesAfterKR = readThemes(DATA_DIR)
      const themeWithKR = themesAfterKR.find(t => t.name === 'E2E Theme')
      const objWithKR = themeWithKR.objectives.find(o => o.title === 'E2E Objective')
      if (!objWithKR.keyResults || objWithKR.keyResults.length < 1) {
        throw new Error('Expected at least 1 key result')
      }
      const kr = objWithKR.keyResults.find(k => k.description === 'E2E Key Result')
      if (!kr) throw new Error('Key result "E2E Key Result" not found')

      expectedCommits++
      assertCommitCount('after create key result')

      reporter.pass(`Key result created: id=${kr.id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Phase 2: Calendar Planning
    // ================================================================

    reporter.startTest('Phase 2: Assign day focus and verify files')
    try {
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      // Double-click first day cell
      await page.dblclick('.day-num')
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Select theme checkbox and add text
      await page.click('.tree-theme-item:has-text("E2E Theme") input[type="checkbox"]')
      await page.fill('#text-input', 'E2E test day')
      await page.click('.dialog .btn-primary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Verify files
      const year = new Date().getFullYear()
      assertFileExists(DATA_DIR, `calendar/${year}.json`)
      const calData = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entries = calData.entries || calData
      const dayEntry = (Array.isArray(entries) ? entries : []).find(
        e => e.themeIds && e.themeIds.includes(themeId)
      )
      if (!dayEntry) throw new Error(`No calendar entry with themeIds containing ${themeId}`)
      if (dayEntry.text !== 'E2E test day') {
        throw new Error(`Expected text "E2E test day", got "${dayEntry.text}"`)
      }

      expectedCommits++
      assertCommitCount('after save day focus')

      reporter.pass(`Day focus assigned: date=${dayEntry.date}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 2b: Create second theme and assign multi-theme day focus ----
    // First, create a second theme via UI
    let theme2Id = 'UNKNOWN'
    reporter.startTest('Phase 2b: Create second theme for multi-theme test')
    try {
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.okr-header', { timeout: 10000 })

      await page.click('.btn-primary:has-text("+ Add Theme")')
      await page.waitForSelector('.theme-form', { timeout: 5000 })
      await page.fill('.theme-form input[type="text"]', 'E2E Theme 2')
      await page.click('.theme-form .color-option:nth-child(5)')
      await page.click('.theme-form .btn-primary:has-text("Create")')
      await page.waitForSelector('.theme-pill:has-text("E2E Theme 2")', { timeout: 5000 })

      const themesAfter2 = readThemes(DATA_DIR)
      const theme2 = themesAfter2.find(t => t.name === 'E2E Theme 2')
      if (!theme2) throw new Error('Theme "E2E Theme 2" not found in themes.json')
      theme2Id = theme2.id

      expectedCommits++
      assertCommitCount('after create second theme')

      reporter.pass(`Second theme created: id=${theme2Id}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Phase 2c: Assign multi-theme day focus and verify files')
    try {
      // Navigate to Calendar
      await page.keyboard.press('Control+2')
      await page.waitForSelector('.calendar-view', { timeout: 5000 })

      // Double-click second day cell (day 2 of first month)
      await page.locator('.day-num').nth(1).dblclick()
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Select both theme checkboxes
      await page.click('.tree-theme-item:has-text("E2E Theme 2") input[type="checkbox"]')
      // "E2E Theme" checkbox — use first tree-theme-item that has exact "E2E Theme" text but not "E2E Theme 2"
      await page.locator('.tree-theme-item').filter({ hasText: 'E2E Theme' }).filter({ hasNotText: 'E2E Theme 2' }).locator('input[type="checkbox"]').click()
      await page.fill('#text-input', 'Multi-theme day')
      await page.click('.dialog .btn-primary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Verify files
      const year = new Date().getFullYear()
      const calData = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entries = calData.entries || calData
      const multiDay = (Array.isArray(entries) ? entries : []).find(
        e => e.text === 'Multi-theme day'
      )
      if (!multiDay) throw new Error('No calendar entry with text "Multi-theme day"')
      if (!multiDay.themeIds || !Array.isArray(multiDay.themeIds)) {
        throw new Error(`Expected themeIds to be an array, got ${JSON.stringify(multiDay.themeIds)}`)
      }
      if (multiDay.themeIds.length !== 2) {
        throw new Error(`Expected 2 themeIds, got ${multiDay.themeIds.length}: ${JSON.stringify(multiDay.themeIds)}`)
      }
      if (!multiDay.themeIds.includes(themeId)) {
        throw new Error(`themeIds does not contain first theme ${themeId}`)
      }
      if (!multiDay.themeIds.includes(theme2Id)) {
        throw new Error(`themeIds does not contain second theme ${theme2Id}`)
      }

      expectedCommits++
      assertCommitCount('after save multi-theme day focus')

      reporter.pass(`Multi-theme day focus assigned: date=${multiDay.date}, themeIds=${JSON.stringify(multiDay.themeIds)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 2d: Clear multi-theme day focus ----
    reporter.startTest('Phase 2d: Clear multi-theme day focus and verify files')
    try {
      // Reopen the same day (second day cell)
      await page.locator('.day-num').nth(1).dblclick()
      await page.waitForSelector('.dialog', { timeout: 5000 })

      // Uncheck both theme checkboxes (they should be checked from Phase 2c)
      await page.click('.tree-theme-item:has-text("E2E Theme 2") input[type="checkbox"]')
      await page.locator('.tree-theme-item').filter({ hasText: 'E2E Theme' }).filter({ hasNotText: 'E2E Theme 2' }).locator('input[type="checkbox"]').click()

      // Clear text
      await page.fill('#text-input', '')
      await page.click('.dialog .btn-primary')
      await page.waitForSelector('.dialog', { state: 'detached', timeout: 5000 })

      // Verify files
      const year = new Date().getFullYear()
      const calData = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entries = calData.entries || calData
      // Find the entry for this day — it should have empty/no themeIds
      const multiDayAfter = (Array.isArray(entries) ? entries : []).find(
        e => e.text === 'Multi-theme day'
      )
      // The entry should either not exist, or have empty themeIds
      if (multiDayAfter && multiDayAfter.themeIds && multiDayAfter.themeIds.length > 0) {
        throw new Error(`Expected themeIds to be empty/cleared, got ${JSON.stringify(multiDayAfter.themeIds)}`)
      }

      expectedCommits++
      assertCommitCount('after clear multi-theme day focus')
      assertLatestCommitContains('Update day focus')

      reporter.pass('Multi-theme day focus cleared')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Phase 3: Task Execution
    // ================================================================

    // ---- 3a: Create first task ----
    reporter.startTest('Phase 3a: Create task 1 and verify files')
    try {
      // Create task via Wails binding (UI task creation through Eisenhower
      // quadrant is unreliable in Playwright)
      await page.evaluate(async (tid) => {
        const app = window.go.main.App
        await app.CreateTask('E2E Task A', tid, 'important-urgent', '', '', '')
      }, themeId)

      // Verify task file
      const todoFiles = getTaskFiles(DATA_DIR, 'todo')
      if (todoFiles.length < 1) throw new Error('Expected at least 1 todo task file')

      const taskFile = todoFiles.find(f => {
        const task = readJSON(DATA_DIR, `tasks/todo/${f}`)
        return task.title === 'E2E Task A'
      })
      if (!taskFile) throw new Error('Task file for "E2E Task A" not found in tasks/todo/')

      const task1 = readJSON(DATA_DIR, `tasks/todo/${taskFile}`)
      if (task1.themeId !== themeId) throw new Error(`Task themeId=${task1.themeId}, expected ${themeId}`)
      if (task1.priority !== 'important-urgent') throw new Error(`Task priority=${task1.priority}`)

      // Verify task_order.json includes the task
      assertFileExists(DATA_DIR, 'task_order.json')
      const order = readJSON(DATA_DIR, 'task_order.json')
      const iuOrder = order['important-urgent'] || []
      if (!iuOrder.includes(task1.id)) {
        throw new Error(`task_order.json important-urgent does not contain ${task1.id}`)
      }

      expectedCommits++
      assertCommitCount('after create task 1')

      reporter.pass(`Task 1 created: id=${task1.id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 3b: Create second task ----
    reporter.startTest('Phase 3b: Create task 2 and verify files')
    try {
      await page.evaluate(async (tid) => {
        const app = window.go.main.App
        await app.CreateTask('E2E Task B', tid, 'not-important-urgent', '', '', '')
      }, themeId)

      const todoFiles = getTaskFiles(DATA_DIR, 'todo')
      const taskBFile = todoFiles.find(f => {
        const task = readJSON(DATA_DIR, `tasks/todo/${f}`)
        return task.title === 'E2E Task B'
      })
      if (!taskBFile) throw new Error('Task file for "E2E Task B" not found')

      const task2 = readJSON(DATA_DIR, `tasks/todo/${taskBFile}`)
      if (task2.priority !== 'not-important-urgent') throw new Error(`Task B priority=${task2.priority}`)

      const order = readJSON(DATA_DIR, 'task_order.json')
      const niuOrder = order['not-important-urgent'] || []
      if (!niuOrder.includes(task2.id)) {
        throw new Error(`task_order.json not-important-urgent does not contain ${task2.id}`)
      }

      expectedCommits++
      assertCommitCount('after create task 2')

      reporter.pass(`Task 2 created: id=${task2.id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // Read task IDs for subsequent operations
    const todoFilesNow = getTaskFiles(DATA_DIR, 'todo')
    let task1Id, task2Id
    for (const f of todoFilesNow) {
      const t = readJSON(DATA_DIR, `tasks/todo/${f}`)
      if (t.title === 'E2E Task A') task1Id = t.id
      if (t.title === 'E2E Task B') task2Id = t.id
    }

    // ---- 3c: Move task todo -> doing ----
    reporter.startTest('Phase 3c: Move task 1 to doing and verify files')
    try {
      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        await app.MoveTask(taskId, 'doing', null)
      }, task1Id)

      // Verify file moved
      assertFileNotExists(DATA_DIR, `tasks/todo/${task1Id}.json`)
      assertFileExists(DATA_DIR, `tasks/doing/${task1Id}.json`)

      const movedTask = readJSON(DATA_DIR, `tasks/doing/${task1Id}.json`)
      if (movedTask.title !== 'E2E Task A') throw new Error('Moved task has wrong title')

      // MoveTask produces 2 commits: one for file move, one for task_order update
      expectedCommits += 2
      assertCommitCount('after move task to doing')

      const log = getGitLog(DATA_DIR)
      const hasMoveCommit = log.some(m => m.includes('Move task') && m.includes('todo -> doing'))
      if (!hasMoveCommit) throw new Error('No "Move task ... todo -> doing" commit found')

      reporter.pass(`Task 1 moved to doing: ${task1Id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 3d: Move task doing -> done ----
    reporter.startTest('Phase 3d: Move task 1 to done and verify files')
    try {
      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        await app.MoveTask(taskId, 'done', null)
      }, task1Id)

      assertFileNotExists(DATA_DIR, `tasks/doing/${task1Id}.json`)
      assertFileExists(DATA_DIR, `tasks/done/${task1Id}.json`)

      expectedCommits += 2
      assertCommitCount('after move task to done')

      reporter.pass(`Task 1 moved to done: ${task1Id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Phase 4: Edits
    // ================================================================

    // ---- 4a: Edit task fields ----
    reporter.startTest('Phase 4a: Edit task 2 and verify files')
    try {
      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        const tasks = await app.GetTasks()
        const task = tasks.find(t => t.id === taskId)
        if (!task) throw new Error(`Task ${taskId} not found`)
        await app.UpdateTask({
          ...task,
          description: 'Updated description',
          tags: ['e2e', 'test'],
        })
      }, task2Id)

      const updatedTask = readJSON(DATA_DIR, `tasks/todo/${task2Id}.json`)
      if (updatedTask.description !== 'Updated description') {
        throw new Error(`Expected description "Updated description", got "${updatedTask.description}"`)
      }
      if (!updatedTask.tags || !updatedTask.tags.includes('e2e')) {
        throw new Error(`Expected tags to include "e2e", got ${JSON.stringify(updatedTask.tags)}`)
      }
      expectedCommits++
      assertCommitCount('after edit task')
      assertLatestCommitContains('Update task')

      reporter.pass('Task 2 edited with description and tags')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4b: Update KR progress ----
    reporter.startTest('Phase 4b: Update key result progress and verify files')
    try {
      // Find the KR ID from themes.json
      const themesNow = readThemes(DATA_DIR)
      const themeNow = themesNow.find(t => t.name === 'E2E Theme')
      const objNow = themeNow.objectives.find(o => o.title === 'E2E Objective')
      const krId = objNow.keyResults[0].id

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.UpdateKeyResultProgress(id, 42)
      }, krId)

      const themesAfterKR = readThemes(DATA_DIR)
      const themeAfterKR = themesAfterKR.find(t => t.name === 'E2E Theme')
      const objAfterKR = themeAfterKR.objectives.find(o => o.title === 'E2E Objective')
      const krAfter = objAfterKR.keyResults[0]
      if (krAfter.currentValue !== 42) {
        throw new Error(`Expected KR currentValue=42, got ${krAfter.currentValue}`)
      }

      expectedCommits++
      assertCommitCount('after update KR progress')

      reporter.pass(`KR progress updated to 42: id=${krId}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4c: Update calendar day text ----
    reporter.startTest('Phase 4c: Update calendar day text and verify files')
    try {
      // Find the existing day entry
      const year = new Date().getFullYear()
      const calBefore = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesBefore = calBefore.entries || calBefore
      const existingDay = (Array.isArray(entriesBefore) ? entriesBefore : []).find(
        e => e.themeIds && e.themeIds.includes(themeId)
      )
      if (!existingDay) throw new Error('No existing day entry found')

      await page.evaluate(async (day) => {
        const app = window.go.main.App
        await app.SaveDayFocus({
          date: day.date,
          themeIds: day.themeIds,
          notes: day.notes,
          text: 'Updated E2E text',
        })
      }, existingDay)

      const calAfter = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesAfter = calAfter.entries || calAfter
      const updatedDay = (Array.isArray(entriesAfter) ? entriesAfter : []).find(
        e => e.date === existingDay.date
      )
      if (updatedDay.text !== 'Updated E2E text') {
        throw new Error(`Expected text "Updated E2E text", got "${updatedDay.text}"`)
      }

      expectedCommits++
      assertCommitCount('after update calendar day')
      assertLatestCommitContains('Update day focus')

      reporter.pass('Calendar day text updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Phase 4d-4u: Field-level edits across OKR, Calendar, EisenKan
    // ================================================================

    // ---- 4d: Edit theme name ----
    reporter.startTest('Phase 4d: Edit theme name and verify files')
    try {
      const themesForNameEdit = readThemes(DATA_DIR)
      const themeForNameEdit = themesForNameEdit.find(t => t.name === 'E2E Theme')
      if (!themeForNameEdit) throw new Error('Theme "E2E Theme" not found')

      await page.evaluate(async (theme) => {
        const app = window.go.main.App
        await app.UpdateTheme({ ...theme, name: 'E2E Theme Renamed' })
      }, themeForNameEdit)

      const themesAfterRename = readThemes(DATA_DIR)
      const renamedTheme = themesAfterRename.find(t => t.name === 'E2E Theme Renamed')
      if (!renamedTheme) throw new Error('Theme "E2E Theme Renamed" not found after rename')

      expectedCommits++
      assertCommitCount('after rename theme')

      // Rename back so later phases can find it by name
      const themeForRevert = readThemes(DATA_DIR).find(t => t.name === 'E2E Theme Renamed')
      await page.evaluate(async (theme) => {
        const app = window.go.main.App
        await app.UpdateTheme({ ...theme, name: 'E2E Theme' })
      }, themeForRevert)

      const themesAfterRevert = readThemes(DATA_DIR)
      if (!themesAfterRevert.find(t => t.name === 'E2E Theme')) {
        throw new Error('Theme "E2E Theme" not found after revert')
      }

      expectedCommits++
      assertCommitCount('after revert theme name')

      reporter.pass('Theme name edited and reverted')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4e: Edit theme color ----
    reporter.startTest('Phase 4e: Edit theme color and verify files')
    try {
      const themesForColor = readThemes(DATA_DIR)
      const themeForColor = themesForColor.find(t => t.name === 'E2E Theme')
      const originalColor = themeForColor.color

      await page.evaluate(async (theme) => {
        const app = window.go.main.App
        await app.UpdateTheme({ ...theme, color: '#ff5733' })
      }, themeForColor)

      const themesAfterColor = readThemes(DATA_DIR)
      const coloredTheme = themesAfterColor.find(t => t.name === 'E2E Theme')
      if (coloredTheme.color !== '#ff5733') {
        throw new Error(`Expected color "#ff5733", got "${coloredTheme.color}"`)
      }

      expectedCommits++
      assertCommitCount('after edit theme color')

      reporter.pass(`Theme color changed from "${originalColor}" to "#ff5733"`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4f: Edit objective title ----
    reporter.startTest('Phase 4f: Edit objective title and verify files')
    try {
      const themesForObjTitle = readThemes(DATA_DIR)
      const themeForObjTitle = themesForObjTitle.find(t => t.name === 'E2E Theme')
      const objForTitle = themeForObjTitle.objectives.find(o => o.title === 'E2E Objective')
      if (!objForTitle) throw new Error('Objective "E2E Objective" not found')

      await page.evaluate(async (args) => {
        const app = window.go.main.App
        await app.UpdateObjective(args.id, 'Updated Obj Title', args.tags || [])
      }, { id: objForTitle.id, tags: objForTitle.tags })

      const themesAfterObjTitle = readThemes(DATA_DIR)
      const themeAfterObjTitle = themesAfterObjTitle.find(t => t.name === 'E2E Theme')
      const updatedObj = themeAfterObjTitle.objectives.find(o => o.id === objForTitle.id)
      if (updatedObj.title !== 'Updated Obj Title') {
        throw new Error(`Expected title "Updated Obj Title", got "${updatedObj.title}"`)
      }

      expectedCommits++
      assertCommitCount('after edit objective title')

      // Rename back for later phases
      await page.evaluate(async (args) => {
        const app = window.go.main.App
        await app.UpdateObjective(args.id, 'E2E Objective', args.tags || [])
      }, { id: objForTitle.id, tags: objForTitle.tags })

      expectedCommits++
      assertCommitCount('after revert objective title')

      reporter.pass('Objective title edited and reverted')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4g: Edit objective tags ----
    reporter.startTest('Phase 4g: Edit objective tags and verify files')
    try {
      const themesForObjTags = readThemes(DATA_DIR)
      const themeForObjTags = themesForObjTags.find(t => t.name === 'E2E Theme')
      const objForTags = themeForObjTags.objectives.find(o => o.title === 'E2E Objective')

      await page.evaluate(async (args) => {
        const app = window.go.main.App
        await app.UpdateObjective(args.id, args.title, ['e2e-tag1', 'e2e-tag2'])
      }, { id: objForTags.id, title: objForTags.title })

      const themesAfterObjTags = readThemes(DATA_DIR)
      const themeAfterObjTags = themesAfterObjTags.find(t => t.name === 'E2E Theme')
      const taggedObj = themeAfterObjTags.objectives.find(o => o.id === objForTags.id)
      if (!taggedObj.tags || !taggedObj.tags.includes('e2e-tag1') || !taggedObj.tags.includes('e2e-tag2')) {
        throw new Error(`Expected tags ["e2e-tag1", "e2e-tag2"], got ${JSON.stringify(taggedObj.tags)}`)
      }

      expectedCommits++
      assertCommitCount('after edit objective tags')

      reporter.pass('Objective tags updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4h: Edit KR description ----
    reporter.startTest('Phase 4h: Edit key result description and verify files')
    try {
      const themesForKRDesc = readThemes(DATA_DIR)
      const themeForKRDesc = themesForKRDesc.find(t => t.name === 'E2E Theme')
      const objForKRDesc = themeForKRDesc.objectives.find(o => o.title === 'E2E Objective')
      const krForDesc = objForKRDesc.keyResults[0]

      await page.evaluate(async (args) => {
        const app = window.go.main.App
        await app.UpdateKeyResult(args.id, 'Updated KR Desc')
      }, { id: krForDesc.id })

      const themesAfterKRDesc = readThemes(DATA_DIR)
      const themeAfterKRDesc = themesAfterKRDesc.find(t => t.name === 'E2E Theme')
      const objAfterKRDesc = themeAfterKRDesc.objectives.find(o => o.title === 'E2E Objective')
      const updatedKR = objAfterKRDesc.keyResults.find(k => k.id === krForDesc.id)
      if (updatedKR.description !== 'Updated KR Desc') {
        throw new Error(`Expected description "Updated KR Desc", got "${updatedKR.description}"`)
      }

      expectedCommits++
      assertCommitCount('after edit KR description')

      reporter.pass('Key result description updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4i: Edit KR start/target values ----
    reporter.startTest('Phase 4i: Edit KR start/target values and verify files')
    try {
      const themesForKRVals = readThemes(DATA_DIR)
      const themeForKRVals = themesForKRVals.find(t => t.name === 'E2E Theme')
      const objForKRVals = themeForKRVals.objectives.find(o => o.title === 'E2E Objective')
      const krForVals = objForKRVals.keyResults[0]

      // Modify KR values in the full theme tree and call UpdateTheme
      const themeWithModifiedKR = JSON.parse(JSON.stringify(themeForKRVals))
      themeWithModifiedKR.objectives[0].keyResults[0].startValue = 5
      themeWithModifiedKR.objectives[0].keyResults[0].targetValue = 200

      await page.evaluate(async (theme) => {
        const app = window.go.main.App
        await app.UpdateTheme(theme)
      }, themeWithModifiedKR)

      const themesAfterKRVals = readThemes(DATA_DIR)
      const themeAfterKRVals = themesAfterKRVals.find(t => t.name === 'E2E Theme')
      const objAfterKRVals = themeAfterKRVals.objectives.find(o => o.title === 'E2E Objective')
      const krAfterVals = objAfterKRVals.keyResults.find(k => k.id === krForVals.id)
      if (krAfterVals.startValue !== 5) {
        throw new Error(`Expected startValue=5, got ${krAfterVals.startValue}`)
      }
      if (krAfterVals.targetValue !== 200) {
        throw new Error(`Expected targetValue=200, got ${krAfterVals.targetValue}`)
      }

      expectedCommits++
      assertCommitCount('after edit KR start/target values')

      reporter.pass('KR start/target values updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4j: Set objective status to completed ----
    reporter.startTest('Phase 4j: Set objective status to completed and verify files')
    try {
      const themesForObjStatus = readThemes(DATA_DIR)
      const themeForObjStatus = themesForObjStatus.find(t => t.name === 'E2E Theme')
      const objForStatus = themeForObjStatus.objectives.find(o => o.title === 'E2E Objective')
      const krForObjStatus = objForStatus.keyResults[0]

      // Must complete KR first (SetObjectiveStatus requires all children completed)
      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.SetKeyResultStatus(id, 'completed')
      }, krForObjStatus.id)

      expectedCommits++
      assertCommitCount('after complete KR for objective status')

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.SetObjectiveStatus(id, 'completed')
      }, objForStatus.id)

      const themesAfterObjStatus = readThemes(DATA_DIR)
      const themeAfterObjStatus = themesAfterObjStatus.find(t => t.name === 'E2E Theme')
      const objAfterStatus = themeAfterObjStatus.objectives.find(o => o.id === objForStatus.id)
      if (objAfterStatus.status !== 'completed') {
        throw new Error(`Expected status "completed", got "${objAfterStatus.status}"`)
      }

      expectedCommits++
      assertCommitCount('after set objective status')

      // Revert objective to active for CloseObjective test
      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.SetObjectiveStatus(id, 'active')
      }, objForStatus.id)

      expectedCommits++
      assertCommitCount('after revert objective to active')

      reporter.pass('Objective status set to completed and reverted')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4k: Close objective ----
    reporter.startTest('Phase 4k: Close objective and verify files')
    try {
      const themesForClose = readThemes(DATA_DIR)
      const themeForClose = themesForClose.find(t => t.name === 'E2E Theme')
      const objForClose = themeForClose.objectives.find(o => o.title === 'E2E Objective')

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.CloseObjective(id, 'achieved', 'Test closing notes')
      }, objForClose.id)

      const themesAfterClose = readThemes(DATA_DIR)
      const themeAfterClose = themesAfterClose.find(t => t.name === 'E2E Theme')
      const objAfterClose = themeAfterClose.objectives.find(o => o.id === objForClose.id)
      if (objAfterClose.closingStatus !== 'achieved') {
        throw new Error(`Expected closingStatus "achieved", got "${objAfterClose.closingStatus}"`)
      }
      if (objAfterClose.closingNotes !== 'Test closing notes') {
        throw new Error(`Expected closingNotes "Test closing notes", got "${objAfterClose.closingNotes}"`)
      }
      if (!objAfterClose.closedAt) {
        throw new Error('Expected closedAt to be set')
      }

      expectedCommits++
      assertCommitCount('after close objective')

      reporter.pass('Objective closed with achieved status and notes')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4l: Reopen objective ----
    reporter.startTest('Phase 4l: Reopen objective and verify files')
    try {
      const themesForReopen = readThemes(DATA_DIR)
      const themeForReopen = themesForReopen.find(t => t.name === 'E2E Theme')
      const objForReopen = themeForReopen.objectives.find(o => o.title === 'E2E Objective')

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.ReopenObjective(id)
      }, objForReopen.id)

      const themesAfterReopen = readThemes(DATA_DIR)
      const themeAfterReopen = themesAfterReopen.find(t => t.name === 'E2E Theme')
      const objAfterReopen = themeAfterReopen.objectives.find(o => o.id === objForReopen.id)
      // ReopenObjective sets status to "" (empty = active)
      if (objAfterReopen.status && objAfterReopen.status !== 'active') {
        throw new Error(`Expected status empty or "active", got "${objAfterReopen.status}"`)
      }
      if (objAfterReopen.closingStatus) {
        throw new Error(`Expected closingStatus to be cleared, got "${objAfterReopen.closingStatus}"`)
      }
      if (objAfterReopen.closingNotes) {
        throw new Error(`Expected closingNotes to be cleared, got "${objAfterReopen.closingNotes}"`)
      }
      if (objAfterReopen.closedAt) {
        throw new Error(`Expected closedAt to be cleared, got "${objAfterReopen.closedAt}"`)
      }

      expectedCommits++
      assertCommitCount('after reopen objective')

      reporter.pass('Objective reopened, closing metadata cleared')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4m: Change KR status ----
    reporter.startTest('Phase 4m: Change KR status and verify files')
    try {
      const themesForKRStatus = readThemes(DATA_DIR)
      const themeForKRStatus = themesForKRStatus.find(t => t.name === 'E2E Theme')
      const objForKRStatus = themeForKRStatus.objectives.find(o => o.title === 'E2E Objective')
      const krForStatus = objForKRStatus.keyResults[0]

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.SetKeyResultStatus(id, 'completed')
      }, krForStatus.id)

      const themesAfterKRComplete = readThemes(DATA_DIR)
      const themeAfterKRComplete = themesAfterKRComplete.find(t => t.name === 'E2E Theme')
      const objAfterKRComplete = themeAfterKRComplete.objectives.find(o => o.title === 'E2E Objective')
      const krAfterComplete = objAfterKRComplete.keyResults.find(k => k.id === krForStatus.id)
      if (krAfterComplete.status !== 'completed') {
        throw new Error(`Expected KR status "completed", got "${krAfterComplete.status}"`)
      }

      expectedCommits++
      assertCommitCount('after set KR status completed')

      // Reset KR status back to active
      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.SetKeyResultStatus(id, 'active')
      }, krForStatus.id)

      const themesAfterKRActive = readThemes(DATA_DIR)
      const themeAfterKRActive = themesAfterKRActive.find(t => t.name === 'E2E Theme')
      const objAfterKRActive = themeAfterKRActive.objectives.find(o => o.title === 'E2E Objective')
      const krAfterActive = objAfterKRActive.keyResults.find(k => k.id === krForStatus.id)
      if (krAfterActive.status !== 'active') {
        throw new Error(`Expected KR status "active", got "${krAfterActive.status}"`)
      }

      expectedCommits++
      assertCommitCount('after reset KR status active')

      reporter.pass('KR status toggled completed -> active')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4n: Create and edit routine ----
    reporter.startTest('Phase 4n: Create and edit routine and verify files')
    try {
      await page.evaluate(async (tid) => {
        const app = window.go.main.App
        await app.AddRoutine(tid, 'E2E Routine', 10, 'at-or-above', 'times/week')
      }, themeId)

      const themesAfterRoutine = readThemes(DATA_DIR)
      const themeAfterRoutine = themesAfterRoutine.find(t => t.name === 'E2E Theme')
      if (!themeAfterRoutine.routines || themeAfterRoutine.routines.length < 1) {
        throw new Error('Expected at least 1 routine')
      }
      const routine = themeAfterRoutine.routines[0]
      if (routine.description !== 'E2E Routine') {
        throw new Error(`Expected routine description "E2E Routine", got "${routine.description}"`)
      }
      if (routine.targetValue !== 10) {
        throw new Error(`Expected routine targetValue=10, got ${routine.targetValue}`)
      }

      expectedCommits++
      assertCommitCount('after create routine')

      // Update routine
      await page.evaluate(async (args) => {
        const app = window.go.main.App
        await app.UpdateRoutine(args.id, 'Updated Routine', 3, 15, 'at-or-above', 'hours')
      }, { id: routine.id })

      const themesAfterRoutineUpdate = readThemes(DATA_DIR)
      const themeAfterRoutineUpdate = themesAfterRoutineUpdate.find(t => t.name === 'E2E Theme')
      const updatedRoutine = themeAfterRoutineUpdate.routines.find(r => r.id === routine.id)
      if (updatedRoutine.description !== 'Updated Routine') {
        throw new Error(`Expected description "Updated Routine", got "${updatedRoutine.description}"`)
      }
      if (updatedRoutine.currentValue !== 3) {
        throw new Error(`Expected currentValue=3, got ${updatedRoutine.currentValue}`)
      }
      if (updatedRoutine.targetValue !== 15) {
        throw new Error(`Expected targetValue=15, got ${updatedRoutine.targetValue}`)
      }

      expectedCommits++
      assertCommitCount('after update routine')

      reporter.pass(`Routine created and updated: id=${routine.id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4o: Delete routine ----
    reporter.startTest('Phase 4o: Delete routine and verify files')
    try {
      const themesForRoutineDel = readThemes(DATA_DIR)
      const themeForRoutineDel = themesForRoutineDel.find(t => t.name === 'E2E Theme')
      const routineToDel = themeForRoutineDel.routines[0]

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.DeleteRoutine(id)
      }, routineToDel.id)

      const themesAfterRoutineDel = readThemes(DATA_DIR)
      const themeAfterRoutineDel = themesAfterRoutineDel.find(t => t.name === 'E2E Theme')
      if (themeAfterRoutineDel.routines && themeAfterRoutineDel.routines.length > 0) {
        throw new Error('Expected 0 routines after deletion')
      }

      expectedCommits++
      assertCommitCount('after delete routine')

      reporter.pass(`Routine deleted: ${routineToDel.id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4p: Save personal vision ----
    reporter.startTest('Phase 4p: Save personal vision and verify files')
    try {
      await page.evaluate(async () => {
        const app = window.go.main.App
        await app.SavePersonalVision('Test mission statement', 'Test vision text')
      })

      const vision = readJSON(DATA_DIR, 'vision.json')
      if (vision.mission !== 'Test mission statement') {
        throw new Error(`Expected mission "Test mission statement", got "${vision.mission}"`)
      }
      if (vision.vision !== 'Test vision text') {
        throw new Error(`Expected vision "Test vision text", got "${vision.vision}"`)
      }

      expectedCommits++
      assertCommitCount('after save personal vision')

      reporter.pass('Personal vision saved')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4q: Edit day focus text (different from 4c) ----
    reporter.startTest('Phase 4q: Edit day focus text via binding and verify files')
    try {
      const year = new Date().getFullYear()
      const calForQ = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesForQ = calForQ.entries || calForQ
      const dayForQ = (Array.isArray(entriesForQ) ? entriesForQ : []).find(
        e => e.text === 'Updated E2E text'
      )
      if (!dayForQ) throw new Error('Day with "Updated E2E text" not found')

      await page.evaluate(async (day) => {
        const app = window.go.main.App
        await app.SaveDayFocus({
          date: day.date,
          themeIds: day.themeIds,
          notes: 'Added notes via E2E',
          text: 'Phase 4q updated text',
          okrIds: day.okrIds || [],
          tags: day.tags || [],
        })
      }, dayForQ)

      const calAfterQ = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesAfterQ = calAfterQ.entries || calAfterQ
      const updatedDayQ = (Array.isArray(entriesAfterQ) ? entriesAfterQ : []).find(
        e => e.date === dayForQ.date
      )
      if (updatedDayQ.text !== 'Phase 4q updated text') {
        throw new Error(`Expected text "Phase 4q updated text", got "${updatedDayQ.text}"`)
      }
      if (updatedDayQ.notes !== 'Added notes via E2E') {
        throw new Error(`Expected notes "Added notes via E2E", got "${updatedDayQ.notes}"`)
      }

      expectedCommits++
      assertCommitCount('after edit day focus text 4q')

      reporter.pass('Day focus text and notes updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4r: Edit day focus tags ----
    reporter.startTest('Phase 4r: Edit day focus tags and verify files')
    try {
      const year = new Date().getFullYear()
      const calForR = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesForR = calForR.entries || calForR
      const dayForR = (Array.isArray(entriesForR) ? entriesForR : []).find(
        e => e.text === 'Phase 4q updated text'
      )
      if (!dayForR) throw new Error('Day with "Phase 4q updated text" not found')

      await page.evaluate(async (day) => {
        const app = window.go.main.App
        await app.SaveDayFocus({
          date: day.date,
          themeIds: day.themeIds,
          notes: day.notes,
          text: day.text,
          okrIds: day.okrIds || [],
          tags: ['e2e-day-tag1', 'e2e-day-tag2'],
        })
      }, dayForR)

      const calAfterR = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesAfterR = calAfterR.entries || calAfterR
      const updatedDayR = (Array.isArray(entriesAfterR) ? entriesAfterR : []).find(
        e => e.date === dayForR.date
      )
      if (!updatedDayR.tags || !updatedDayR.tags.includes('e2e-day-tag1') || !updatedDayR.tags.includes('e2e-day-tag2')) {
        throw new Error(`Expected tags ["e2e-day-tag1", "e2e-day-tag2"], got ${JSON.stringify(updatedDayR.tags)}`)
      }

      expectedCommits++
      assertCommitCount('after edit day focus tags')

      reporter.pass('Day focus tags updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4s: Edit task title ----
    reporter.startTest('Phase 4s: Edit task title and verify files')
    try {
      const taskBefore4s = readJSON(DATA_DIR, `tasks/todo/${task2Id}.json`)

      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        const tasks = await app.GetTasks()
        const task = tasks.find(t => t.id === taskId)
        if (!task) throw new Error(`Task ${taskId} not found`)
        await app.UpdateTask({
          ...task,
          title: 'E2E Task B Renamed',
        })
      }, task2Id)

      const taskAfter4s = readJSON(DATA_DIR, `tasks/todo/${task2Id}.json`)
      if (taskAfter4s.title !== 'E2E Task B Renamed') {
        throw new Error(`Expected title "E2E Task B Renamed", got "${taskAfter4s.title}"`)
      }

      expectedCommits++
      assertCommitCount('after edit task title')

      reporter.pass('Task title updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4t: Edit task priority ----
    reporter.startTest('Phase 4t: Edit task priority and verify files')
    try {
      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        const tasks = await app.GetTasks()
        const task = tasks.find(t => t.id === taskId)
        if (!task) throw new Error(`Task ${taskId} not found`)
        await app.UpdateTask({
          ...task,
          priority: 'important-not-urgent',
        })
      }, task2Id)

      const taskAfter4t = readJSON(DATA_DIR, `tasks/todo/${task2Id}.json`)
      if (taskAfter4t.priority !== 'important-not-urgent') {
        throw new Error(`Expected priority "important-not-urgent", got "${taskAfter4t.priority}"`)
      }

      // Verify task_order.json: task must be in new zone, not old zone
      const orderAfter4t = readJSON(DATA_DIR, 'task_order.json')
      const oldZoneIds = orderAfter4t['important-urgent'] || []
      const newZoneIds = orderAfter4t['important-not-urgent'] || []
      if (oldZoneIds.includes(task2Id)) {
        throw new Error(`Task ${task2Id} should NOT be in important-urgent zone after priority change`)
      }
      if (!newZoneIds.includes(task2Id)) {
        throw new Error(`Task ${task2Id} should be in important-not-urgent zone after priority change`)
      }

      expectedCommits++
      assertCommitCount('after edit task priority')

      reporter.pass('Task priority updated')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 4u: Archive and restore task ----
    reporter.startTest('Phase 4u: Archive and restore task and verify files')
    try {
      // Use task1 which is in done status
      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        await app.ArchiveTask(taskId)
      }, task1Id)

      assertFileNotExists(DATA_DIR, `tasks/done/${task1Id}.json`)
      assertFileExists(DATA_DIR, `tasks/archived/${task1Id}.json`)

      // ArchiveTask = 2 commits (file move + task_order update)
      expectedCommits += 2
      assertCommitCount('after archive task 4u')

      // Restore task
      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        await app.RestoreTask(taskId)
      }, task1Id)

      assertFileNotExists(DATA_DIR, `tasks/archived/${task1Id}.json`)
      assertFileExists(DATA_DIR, `tasks/done/${task1Id}.json`)

      // RestoreTask = 2 commits (file move + task_order update)
      expectedCommits += 2
      assertCommitCount('after restore task 4u')

      reporter.pass(`Task archived and restored: ${task1Id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Phase 5: Cleanup
    // ================================================================

    // ---- 5a: Archive task ----
    reporter.startTest('Phase 5a: Archive task 1 and verify files')
    try {
      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        await app.ArchiveTask(taskId)
      }, task1Id)

      assertFileNotExists(DATA_DIR, `tasks/done/${task1Id}.json`)
      assertFileExists(DATA_DIR, `tasks/archived/${task1Id}.json`)

      // ArchiveTask = 2 commits (file move + task_order removal)
      expectedCommits += 2
      assertCommitCount('after archive task')

      reporter.pass(`Task 1 archived: ${task1Id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 5b: Delete key result ----
    reporter.startTest('Phase 5b: Delete key result and verify files')
    try {
      const themesBeforeDel = readThemes(DATA_DIR)
      const themeBefore = themesBeforeDel.find(t => t.name === 'E2E Theme')
      const objBefore = themeBefore.objectives.find(o => o.title === 'E2E Objective')
      const krIdToDel = objBefore.keyResults[0].id

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.DeleteKeyResult(id)
      }, krIdToDel)

      const themesAfterDel = readThemes(DATA_DIR)
      const themeAfterDel = themesAfterDel.find(t => t.name === 'E2E Theme')
      const objAfterDel = themeAfterDel.objectives.find(o => o.title === 'E2E Objective')
      if (objAfterDel.keyResults && objAfterDel.keyResults.length > 0) {
        throw new Error('Expected 0 key results after deletion')
      }

      expectedCommits++
      assertCommitCount('after delete KR')

      reporter.pass(`Key result deleted: ${krIdToDel}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 5c: Delete objective ----
    reporter.startTest('Phase 5c: Delete objective and verify files')
    try {
      const themesBeforeObjDel = readThemes(DATA_DIR)
      const themeBeforeObjDel = themesBeforeObjDel.find(t => t.name === 'E2E Theme')
      const objIdToDel = themeBeforeObjDel.objectives[0].id

      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.DeleteObjective(id)
      }, objIdToDel)

      const themesAfterObjDel = readThemes(DATA_DIR)
      const themeAfterObjDel = themesAfterObjDel.find(t => t.name === 'E2E Theme')
      if (themeAfterObjDel.objectives && themeAfterObjDel.objectives.length > 0) {
        throw new Error('Expected 0 objectives after deletion')
      }

      expectedCommits++
      assertCommitCount('after delete objective')

      reporter.pass(`Objective deleted: ${objIdToDel}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 5d: Delete theme ----
    reporter.startTest('Phase 5d: Delete theme and verify files')
    try {
      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.DeleteTheme(id)
      }, themeId)

      const themesAfterThemeDel = readThemes(DATA_DIR)
      const deletedTheme = themesAfterThemeDel.find(t => t.name === 'E2E Theme')
      if (deletedTheme) {
        throw new Error('Theme "E2E Theme" still exists after deletion')
      }

      expectedCommits++
      assertCommitCount('after delete theme')
      assertLatestCommitContains('Delete theme')

      reporter.pass(`Theme deleted: ${themeId}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 5d2: Delete second theme ----
    reporter.startTest('Phase 5d2: Delete second theme and verify files')
    try {
      await page.evaluate(async (id) => {
        const app = window.go.main.App
        await app.DeleteTheme(id)
      }, theme2Id)

      const themesAfterTheme2Del = readThemes(DATA_DIR)
      const deletedTheme2 = themesAfterTheme2Del.find(t => t.name === 'E2E Theme 2')
      if (deletedTheme2) {
        throw new Error('Theme "E2E Theme 2" still exists after deletion')
      }

      expectedCommits++
      assertCommitCount('after delete second theme')

      reporter.pass(`Second theme deleted: ${theme2Id}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 5e: Clear day focus ----
    reporter.startTest('Phase 5e: Clear day focus and verify files')
    try {
      const year = new Date().getFullYear()
      const calBeforeClear = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesBeforeClear = calBeforeClear.entries || calBeforeClear
      const dayToClear = (Array.isArray(entriesBeforeClear) ? entriesBeforeClear : []).find(
        e => e.text === 'Phase 4q updated text'
      )
      if (!dayToClear) throw new Error('Day to clear not found')

      await page.evaluate(async (date) => {
        const app = window.go.main.App
        await app.ClearDayFocus(date)
      }, dayToClear.date)

      const calAfterClear = readJSON(DATA_DIR, `calendar/${year}.json`)
      const entriesAfterClear = calAfterClear.entries || calAfterClear
      const clearedDay = (Array.isArray(entriesAfterClear) ? entriesAfterClear : []).find(
        e => e.date === dayToClear.date && e.themeIds && e.themeIds.length > 0
      )
      if (clearedDay) {
        throw new Error(`Day focus still has themeIds after clearing: ${JSON.stringify(clearedDay.themeIds)}`)
      }

      expectedCommits++
      assertCommitCount('after clear day focus')

      reporter.pass(`Day focus cleared: ${dayToClear.date}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Phase 6: Column Management
    // ================================================================

    // Navigate to EisenKan board
    await page.keyboard.press('Control+3')
    await page.waitForSelector('.eisenkan-container', { timeout: 10000 })

    // ---- 6a: Add column via UI ----
    reporter.startTest('Phase 6a: Add column via UI and verify files')
    try {
      const doingMenuBtn = page.locator('button[aria-label="Column options for DOING"]')
      await doingMenuBtn.click()
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Insert right")')
      await page.waitForSelector('.prompt-dialog', { timeout: 5000 })
      await page.fill('.prompt-input', 'E2E Review')
      await page.click('.prompt-ok')
      await page.waitForSelector('.prompt-dialog', { state: 'detached', timeout: 5000 })
      await page.waitForSelector('h2:has-text("E2E Review")', { timeout: 5000 })

      assertFileExists(DATA_DIR, 'board_config.json')
      const config = readJSON(DATA_DIR, 'board_config.json')
      const newCol = config.columnDefinitions.find(c => c.name === 'e2e-review')
      if (!newCol) throw new Error('Column "e2e-review" not found in board_config.json')
      if (newCol.title !== 'E2E Review') throw new Error(`Expected title "E2E Review", got "${newCol.title}"`)
      if (newCol.type !== 'doing') throw new Error(`Expected type "doing", got "${newCol.type}"`)

      assertDirExists(DATA_DIR, 'tasks/e2e-review')

      expectedCommits++
      assertCommitCount('after add column')
      assertLatestCommitContains('Add column')

      reporter.pass('Column "e2e-review" added')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 6b: Create task in custom column, then rename column ----
    reporter.startTest('Phase 6b: Create task in custom column, rename column, verify migration')
    try {
      // Create a theme for Phase 6 tasks (Phase 5d deleted the original)
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.okr-header', { timeout: 10000 })
      await page.click('.btn-primary:has-text("+ Add Theme")')
      await page.waitForSelector('.theme-form', { timeout: 5000 })
      await page.fill('.theme-form input[type="text"]', 'Column Test')
      await page.click('.theme-form .color-option:nth-child(2)')
      await page.click('.theme-form .btn-primary:has-text("Create")')
      await page.waitForSelector('.theme-pill:has-text("Column Test")', { timeout: 5000 })
      expectedCommits++

      const colThemes = readThemes(DATA_DIR)
      const colThemeId = colThemes.find(t => t.name === 'Column Test')?.id
      if (!colThemeId) throw new Error('Column Test theme not found')

      // Navigate back to EisenKan
      await page.keyboard.press('Control+3')
      await page.waitForSelector('.eisenkan-container', { timeout: 10000 })

      await page.evaluate(async (tid) => {
        const app = window.go.main.App
        await app.CreateTask('E2E Column Task', tid, 'important-urgent', '', '', '')
      }, colThemeId)

      expectedCommits++

      // Move task to the custom column
      const todoFilesForCol = getTaskFiles(DATA_DIR, 'todo')
      const colTaskFile = todoFilesForCol.find(f => {
        const t = readJSON(DATA_DIR, `tasks/todo/${f}`)
        return t.title === 'E2E Column Task'
      })
      if (!colTaskFile) throw new Error('Task "E2E Column Task" not found in todo')
      const colTask = readJSON(DATA_DIR, `tasks/todo/${colTaskFile}`)
      const colTaskId = colTask.id

      await page.evaluate(async (taskId) => {
        const app = window.go.main.App
        await app.MoveTask(taskId, 'e2e-review', null)
      }, colTaskId)

      expectedCommits += 2
      assertFileExists(DATA_DIR, `tasks/e2e-review/${colTaskId}.json`)

      // Rename column via UI
      const reviewMenuBtn = page.locator('button[aria-label="Column options for E2E Review"]')
      await reviewMenuBtn.click()
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Rename")')
      await page.waitForSelector('.prompt-dialog', { timeout: 5000 })
      await page.fill('.prompt-input', 'E2E Verify')
      await page.click('.prompt-ok')
      await page.waitForSelector('.prompt-dialog', { state: 'detached', timeout: 5000 })
      await page.waitForSelector('h2:has-text("E2E Verify")', { timeout: 5000 })

      expectedCommits++

      // Verify task file migrated to new directory
      assertDirNotExists(DATA_DIR, 'tasks/e2e-review')
      assertDirExists(DATA_DIR, 'tasks/e2e-verify')
      assertFileExists(DATA_DIR, `tasks/e2e-verify/${colTaskId}.json`)

      const migratedTask = readJSON(DATA_DIR, `tasks/e2e-verify/${colTaskId}.json`)
      if (migratedTask.title !== 'E2E Column Task') {
        throw new Error(`Migrated task title="${migratedTask.title}", expected "E2E Column Task"`)
      }

      // Verify task_order.json updated
      const order = readJSON(DATA_DIR, 'task_order.json')
      if (order['e2e-review']) throw new Error('task_order.json still has "e2e-review" key')
      const verifyOrder = order['e2e-verify'] || []
      if (!verifyOrder.includes(colTaskId)) {
        throw new Error(`task_order.json "e2e-verify" does not contain ${colTaskId}`)
      }

      // Verify board_config.json updated
      const configAfterRename = readJSON(DATA_DIR, 'board_config.json')
      const renamedCol = configAfterRename.columnDefinitions.find(c => c.name === 'e2e-verify')
      if (!renamedCol) throw new Error('Column "e2e-verify" not found in board_config.json after rename')
      if (renamedCol.title !== 'E2E Verify') throw new Error(`Renamed column title="${renamedCol.title}"`)
      const oldCol = configAfterRename.columnDefinitions.find(c => c.name === 'e2e-review')
      if (oldCol) throw new Error('Old column "e2e-review" still in board_config.json')

      reporter.pass(`Column renamed, task ${colTaskId} migrated to e2e-verify`)
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 6c: Remove empty column via UI ----
    reporter.startTest('Phase 6c: Remove empty column via UI and verify files')
    try {
      // Move task out of the custom column first
      const verifyFiles = getTaskFiles(DATA_DIR, 'e2e-verify')
      if (verifyFiles.length > 0) {
        const taskToMove = readJSON(DATA_DIR, `tasks/e2e-verify/${verifyFiles[0]}`)
        await page.evaluate(async (taskId) => {
          const app = window.go.main.App
          await app.MoveTask(taskId, 'doing', null)
        }, taskToMove.id)
        expectedCommits += 2
      }

      // Delete the now-empty column via UI
      const verifyMenuBtn = page.locator('button[aria-label="Column options for E2E Verify"]')
      await verifyMenuBtn.click()
      await page.waitForSelector('.column-menu', { timeout: 5000 })
      await page.click('.column-menu-item:has-text("Delete")')
      await page.waitForSelector('h2:has-text("E2E Verify")', { state: 'detached', timeout: 5000 })

      expectedCommits++

      assertDirNotExists(DATA_DIR, 'tasks/e2e-verify')

      const configAfterDelete = readJSON(DATA_DIR, 'board_config.json')
      const deletedCol = configAfterDelete.columnDefinitions.find(c => c.name === 'e2e-verify')
      if (deletedCol) throw new Error('Column "e2e-verify" still in board_config.json after delete')

      const orderAfterDelete = readJSON(DATA_DIR, 'task_order.json')
      if (orderAfterDelete['e2e-verify']) {
        throw new Error('task_order.json still has "e2e-verify" key after column delete')
      }

      assertLatestCommitContains('Remove column')

      reporter.pass('Column "e2e-verify" removed')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- 6d: Verify git commit count for column operations ----
    reporter.startTest('Phase 6d: Verify git commit count for column operations')
    try {
      assertCommitCount('after all column operations')

      const log = getGitLog(DATA_DIR)
      const addCommit = log.find(m => m.includes('Add column') && m.includes('E2E Review'))
      if (!addCommit) throw new Error('No "Add column: E2E Review" commit found')
      const renameCommit = log.find(m => m.includes('Rename column'))
      if (!renameCommit) throw new Error('No "Rename column" commit found')
      const removeCommit = log.find(m => m.includes('Remove column') && m.includes('e2e-verify'))
      if (!removeCommit) throw new Error('No "Remove column: e2e-verify" commit found')

      reporter.pass('All column operation commits verified')
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
