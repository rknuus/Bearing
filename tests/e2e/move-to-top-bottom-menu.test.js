/**
 * Move-to-top/bottom task menu E2E test (Issue #129)
 *
 * Exercises the wired-up TaskActionMenu on EisenKan task cards. Two scenarios
 * cover the breadth of the feature:
 *
 *   1. Todo → "Move to top of section": a mid-section task in the
 *      important-urgent (U&I) section is repositioned to the section's first
 *      slot via the card's three-dot menu. The position must persist across a
 *      page reload (re-mount).
 *
 *   2. Doing → "Move to bottom of column": a mid-column task in the flat
 *      Doing column is repositioned to the column's last slot. The position
 *      must persist across a page reload.
 *
 * Selector strategy: per project rule, NO data-testid attributes are used.
 * Card identification uses task title text. The menu trigger is identified by
 * `aria-label="Move task"` (set by TaskCard when wiring TaskActionMenu).
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

const reporter = new TestReporter('Move-to-Top/Bottom Menu E2E Tests')

const THEME_NAME = 'Move Menu E2E Theme'

// Three U&I tasks. The middle one is the subject we move to the top.
const UI_FIRST = 'UI section task A'
const UI_MIDDLE = 'UI section subject B'
const UI_LAST = 'UI section task C'

// Three Doing tasks. The middle one is the subject we move to the bottom.
const DOING_FIRST = 'Doing column task A'
const DOING_MIDDLE = 'Doing column subject B'
const DOING_LAST = 'Doing column task C'

/**
 * Open the task-action menu attached to the card whose title text matches
 * `title`, then click the menu item with the supplied label. The menu is
 * built by TaskCard and the trigger is labelled "Move task" (aria-label).
 *
 * The menu panel is portalled to `document.body` while open (#129 follow-up
 * #2 — the panel must escape the section's overflow context AND the
 * TagBoardCard's transform-induced containing block), so the menu-item
 * locator targets the document root rather than the card.
 */
async function clickMenuAction(page, title, actionLabel) {
  const card = page.locator(`.task-card:has(.task-title:has-text("${title}"))`).first()
  await card.waitFor({ state: 'visible', timeout: 10000 })
  const trigger = card.locator('button[aria-label="Move task"]')
  await trigger.click()
  const item = page
    .locator('.task-action-menu-panel[role="menu"] [role="menuitem"]', { hasText: actionLabel })
  await item.first().waitFor({ state: 'visible', timeout: 5000 })
  await item.first().click()
}

async function navigateToEisenKan(page) {
  // Reset NavigationContext so the EisenKan view shows all tasks. Pin
  // selectedTag to `All` so the focus-aware default-board rule (US-1, #123)
  // doesn't surface a tag-specific board.
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
}

export async function runTests() {
  console.log('Starting Move-to-Top/Bottom Menu E2E Tests...\n')
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
    // Setup: theme + 3 U&I tasks + 3 Doing tasks
    // ================================================================

    let themeId
    let uiFirstId, uiMiddleId, uiLastId
    let doingFirstId, doingMiddleId, doingLastId

    reporter.startTest('Setup: create theme and seed three U&I tasks + three Doing tasks')
    try {
      const ids = await page.evaluate(async ({ themeName, titles }) => {
        const app = window.go.main.App
        const themeResult = await app.Establish({ goalType: 'theme', name: themeName, color: '#0ea5e9' })
        const themeId = themeResult.theme.id

        const ui1 = await app.CreateTask(titles.uiFirst, themeId, 'important-urgent', '', '', '')
        const ui2 = await app.CreateTask(titles.uiMiddle, themeId, 'important-urgent', '', '', '')
        const ui3 = await app.CreateTask(titles.uiLast, themeId, 'important-urgent', '', '', '')

        const d1Created = await app.CreateTask(titles.doingFirst, themeId, 'important-not-urgent', '', '', '')
        const d2Created = await app.CreateTask(titles.doingMiddle, themeId, 'important-not-urgent', '', '', '')
        const d3Created = await app.CreateTask(titles.doingLast, themeId, 'important-not-urgent', '', '', '')

        // Move the three Doing tasks to the Doing column with explicit
        // positions so we control the starting order (A, B, C).
        await app.MoveTask(d1Created.id, 'doing', '', null)
        await app.MoveTask(d2Created.id, 'doing', '', null)
        await app.MoveTask(d3Created.id, 'doing', '', null)
        await app.ReorderTasks({ doing: [d1Created.id, d2Created.id, d3Created.id] })

        return {
          themeId,
          uiFirstId: ui1.id,
          uiMiddleId: ui2.id,
          uiLastId: ui3.id,
          doingFirstId: d1Created.id,
          doingMiddleId: d2Created.id,
          doingLastId: d3Created.id,
        }
      }, {
        themeName: THEME_NAME,
        titles: {
          uiFirst: UI_FIRST, uiMiddle: UI_MIDDLE, uiLast: UI_LAST,
          doingFirst: DOING_FIRST, doingMiddle: DOING_MIDDLE, doingLast: DOING_LAST,
        },
      })

      themeId = ids.themeId
      uiFirstId = ids.uiFirstId
      uiMiddleId = ids.uiMiddleId
      uiLastId = ids.uiLastId
      doingFirstId = ids.doingFirstId
      doingMiddleId = ids.doingMiddleId
      doingLastId = ids.doingLastId

      reporter.pass(
        `theme=${themeId} ui=[${uiFirstId},${uiMiddleId},${uiLastId}] doing=[${doingFirstId},${doingMiddleId},${doingLastId}]`,
      )
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Scenario 1: Todo / U&I — "Move to top of section"
    // ================================================================

    reporter.startTest('Navigate to EisenKan and verify the U&I starting order [A, B, C]')
    try {
      await navigateToEisenKan(page)
      const titles = await page
        .locator('.column-section.section-important-urgent .task-card .task-title')
        .allTextContents()
      const expected = [UI_FIRST, UI_MIDDLE, UI_LAST]
      const filtered = titles.filter(t => expected.includes(t))
      if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
        throw new Error(`Expected U&I order ${JSON.stringify(expected)}, got ${JSON.stringify(filtered)}`)
      }
      reporter.pass(`U&I order: ${JSON.stringify(filtered)}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Click "Move to top of section" on the middle U&I card')
    try {
      await clickMenuAction(page, UI_MIDDLE, 'Move to top of section')
      // Wait for the optimistic / persisted reorder to land.
      await page.waitForFunction(({ middleTitle }) => {
        const titles = Array.from(
          document.querySelectorAll('.column-section.section-important-urgent .task-card .task-title'),
        ).map(el => (el.textContent || '').trim())
        return titles[0] === middleTitle
      }, { middleTitle: UI_MIDDLE }, { timeout: 5000 })
      reporter.pass('Middle card moved to U&I top')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('UI: U&I order is now [B, A, C]')
    try {
      const titles = await page
        .locator('.column-section.section-important-urgent .task-card .task-title')
        .allTextContents()
      const filtered = titles.filter(t => [UI_FIRST, UI_MIDDLE, UI_LAST].includes(t))
      const expected = [UI_MIDDLE, UI_FIRST, UI_LAST]
      if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
        throw new Error(`Expected U&I order ${JSON.stringify(expected)}, got ${JSON.stringify(filtered)}`)
      }
      reporter.pass(`U&I order after move: ${JSON.stringify(filtered)}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Disk: task_order.json["important-urgent"] persisted in [B, A, C]')
    try {
      const order = readJSON(DATA_DIR, 'task_order.json')
      const iu = order['important-urgent'] || []
      const positions = [uiMiddleId, uiFirstId, uiLastId].map(id => iu.indexOf(id))
      if (positions.some(p => p === -1)) {
        throw new Error(`One of the seeded U&I task IDs is missing from the persisted order: ${JSON.stringify(iu)}`)
      }
      // Strictly increasing indices means the order is preserved.
      if (!(positions[0] < positions[1] && positions[1] < positions[2])) {
        throw new Error(`Expected B < A < C in important-urgent, got positions ${JSON.stringify(positions)} (zone=${JSON.stringify(iu)})`)
      }
      reporter.pass(`important-urgent zone: ${JSON.stringify(iu)}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Persists across reload: navigate away, navigate back, U&I still [B, A, C]')
    try {
      await navigateToEisenKan(page)
      const titles = await page
        .locator('.column-section.section-important-urgent .task-card .task-title')
        .allTextContents()
      const filtered = titles.filter(t => [UI_FIRST, UI_MIDDLE, UI_LAST].includes(t))
      const expected = [UI_MIDDLE, UI_FIRST, UI_LAST]
      if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
        throw new Error(`Expected U&I order ${JSON.stringify(expected)} after re-mount, got ${JSON.stringify(filtered)}`)
      }
      reporter.pass(`U&I order after re-mount: ${JSON.stringify(filtered)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Regression: opening the menu in a Todo section must not flash a
    // horizontal scrollbar in the section. The Todo column nests two
    // `overflow-y: auto` containers (.section-container outer, .column-content
    // inner). Per the CSS spec a non-`visible` overflow-y forces overflow-x
    // to compute as `auto` too — so any descendant whose painted box pokes
    // past the section's content edge triggered a horizontal bar. The fix
    // anchors the panel to the viewport via position: fixed so it no longer
    // participates in any ancestor's overflow context.
    //
    // Assertion: with the menu open on a U&I card, both the section's
    // `.column-content` AND the surrounding `.section-container` report
    // scrollWidth === clientWidth (no horizontal overflow on either layer).
    // ================================================================

    reporter.startTest('Bug C regression: opening the menu in a Todo section does not introduce horizontal overflow')
    try {
      const card = page
        .locator(`.column-section.section-important-urgent .task-card:has(.task-title:has-text("${UI_MIDDLE}"))`)
        .first()
      await card.waitFor({ state: 'visible', timeout: 5000 })
      const trigger = card.locator('button[aria-label="Move task"]')

      // Open the menu and let any layout settle.
      await trigger.click()
      await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 5000 })
      // A small paint delay so any transient layout/scrollbar would have
      // had time to flash and (incorrectly) persist into the measurement.
      await page.waitForTimeout(150)

      const overflow = await page.evaluate(() => {
        const sectionContent = document.querySelector(
          '.column-section.section-important-urgent .column-content',
        )
        const sectionContainer = document.querySelector(
          '.kanban-column[data-column-name="todo"] .section-container',
        )
        function delta(el) {
          if (!el) return null
          return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        }
        return { content: delta(sectionContent), container: delta(sectionContainer) }
      })

      if (!overflow.content || !overflow.container) {
        throw new Error(`Could not locate section containers for overflow check: ${JSON.stringify(overflow)}`)
      }
      const contentDelta = overflow.content.scrollWidth - overflow.content.clientWidth
      const containerDelta = overflow.container.scrollWidth - overflow.container.clientWidth
      if (contentDelta > 0 || containerDelta > 0) {
        throw new Error(
          `Horizontal overflow detected with menu open: ` +
          `column-content Δ=${contentDelta}, section-container Δ=${containerDelta} ` +
          `(content=${JSON.stringify(overflow.content)}, container=${JSON.stringify(overflow.container)})`,
        )
      }

      // Close the menu so the next assertion starts clean.
      await page.keyboard.press('Escape')
      reporter.pass(`No horizontal overflow with menu open: column-content Δ=${contentDelta}, section-container Δ=${containerDelta}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Scenario 2: Doing — "Move to bottom of column"
    // ================================================================

    reporter.startTest('Verify the Doing starting order [A, B, C]')
    try {
      // The Doing column is the second column (no sections). Identify it via the
      // column data attribute and read its task titles in DOM order.
      const titles = await page
        .locator('[data-column-name="doing"] .task-card .task-title')
        .allTextContents()
      const filtered = titles.filter(t => [DOING_FIRST, DOING_MIDDLE, DOING_LAST].includes(t))
      const expected = [DOING_FIRST, DOING_MIDDLE, DOING_LAST]
      if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
        throw new Error(`Expected Doing order ${JSON.stringify(expected)}, got ${JSON.stringify(filtered)}`)
      }
      reporter.pass(`Doing order: ${JSON.stringify(filtered)}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Click "Move to bottom of column" on the middle Doing card')
    try {
      await clickMenuAction(page, DOING_MIDDLE, 'Move to bottom of column')
      await page.waitForFunction(({ middleTitle }) => {
        const titles = Array.from(
          document.querySelectorAll('[data-column-name="doing"] .task-card .task-title'),
        ).map(el => (el.textContent || '').trim())
        return titles[titles.length - 1] === middleTitle
      }, { middleTitle: DOING_MIDDLE }, { timeout: 5000 })
      reporter.pass('Middle card moved to bottom of Doing')
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('UI: Doing order is now [A, C, B]')
    try {
      const titles = await page
        .locator('[data-column-name="doing"] .task-card .task-title')
        .allTextContents()
      const filtered = titles.filter(t => [DOING_FIRST, DOING_MIDDLE, DOING_LAST].includes(t))
      const expected = [DOING_FIRST, DOING_LAST, DOING_MIDDLE]
      if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
        throw new Error(`Expected Doing order ${JSON.stringify(expected)}, got ${JSON.stringify(filtered)}`)
      }
      reporter.pass(`Doing order after move: ${JSON.stringify(filtered)}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Disk: task_order.json["doing"] persisted in [A, C, B]')
    try {
      const order = readJSON(DATA_DIR, 'task_order.json')
      const doing = order['doing'] || []
      const positions = [doingFirstId, doingLastId, doingMiddleId].map(id => doing.indexOf(id))
      if (positions.some(p => p === -1)) {
        throw new Error(`One of the seeded Doing task IDs is missing from the persisted order: ${JSON.stringify(doing)}`)
      }
      if (!(positions[0] < positions[1] && positions[1] < positions[2])) {
        throw new Error(`Expected A < C < B in doing, got positions ${JSON.stringify(positions)} (zone=${JSON.stringify(doing)})`)
      }
      reporter.pass(`doing zone: ${JSON.stringify(doing)}`)
    } catch (err) {
      reporter.fail(err)
    }

    reporter.startTest('Persists across reload: Doing still [A, C, B] after view re-mount')
    try {
      await navigateToEisenKan(page)
      const titles = await page
        .locator('[data-column-name="doing"] .task-card .task-title')
        .allTextContents()
      const filtered = titles.filter(t => [DOING_FIRST, DOING_MIDDLE, DOING_LAST].includes(t))
      const expected = [DOING_FIRST, DOING_LAST, DOING_MIDDLE]
      if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
        throw new Error(`Expected Doing order ${JSON.stringify(expected)} after re-mount, got ${JSON.stringify(filtered)}`)
      }
      reporter.pass(`Doing order after re-mount: ${JSON.stringify(filtered)}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Regression: clicking another task's trigger closes the previous menu
    // AND opens the new one in a single click (Bug A on #129 fix follow-up).
    // ================================================================

    reporter.startTest('Bug A regression: opening menu B while A is open closes A and opens B in one click')
    try {
      // Both subjects live in the Doing column at this point (after the
      // previous scenario): order is [DOING_FIRST, DOING_LAST, DOING_MIDDLE].
      // Open the menu on the first card, then click the trigger on the
      // second card. The first menu must close and the second must open.
      const cardA = page
        .locator(`.task-card:has(.task-title:has-text("${DOING_FIRST}"))`)
        .first()
      const cardB = page
        .locator(`.task-card:has(.task-title:has-text("${DOING_LAST}"))`)
        .first()
      const triggerA = cardA.locator('button[aria-label="Move task"]')
      const triggerB = cardB.locator('button[aria-label="Move task"]')

      // The menu panel is portalled to <body> while open, so the
      // open/closed state of a card's menu is read off its trigger's
      // `aria-expanded` attribute (the trigger stays inside the card).

      // Open A.
      await triggerA.click()
      // Wait until A's trigger reports aria-expanded="true" and B's stays false.
      await page.waitForFunction(({ titleA, titleB }) => {
        const card = (title) => Array.from(document.querySelectorAll('.task-card')).find(
          (c) => (c.querySelector('.task-title')?.textContent || '').trim() === title,
        )
        const a = card(titleA)
        const b = card(titleB)
        if (!a || !b) return false
        const ta = a.querySelector('button[aria-label="Move task"]')
        const tb = b.querySelector('button[aria-label="Move task"]')
        if (!ta || !tb) return false
        return ta.getAttribute('aria-expanded') === 'true'
          && tb.getAttribute('aria-expanded') === 'false'
      }, { titleA: DOING_FIRST, titleB: DOING_LAST }, { timeout: 5000 })

      // ONE click on B's trigger. Before the fix this was a two-click
      // operation: the first click hit A's overlay and only closed A.
      await triggerB.click()
      await page.waitForFunction(({ titleA, titleB }) => {
        const card = (title) => Array.from(document.querySelectorAll('.task-card')).find(
          (c) => (c.querySelector('.task-title')?.textContent || '').trim() === title,
        )
        const a = card(titleA)
        const b = card(titleB)
        if (!a || !b) return false
        const ta = a.querySelector('button[aria-label="Move task"]')
        const tb = b.querySelector('button[aria-label="Move task"]')
        if (!ta || !tb) return false
        return ta.getAttribute('aria-expanded') === 'false'
          && tb.getAttribute('aria-expanded') === 'true'
      }, { titleA: DOING_FIRST, titleB: DOING_LAST }, { timeout: 5000 })

      // Close B by pressing Escape (cleanup so the next assertion starts clean).
      await page.keyboard.press('Escape')
      await page.waitForFunction(({ titleB }) => {
        const card = Array.from(document.querySelectorAll('.task-card')).find(
          (c) => (c.querySelector('.task-title')?.textContent || '').trim() === titleB,
        )
        if (!card) return false
        const t = card.querySelector('button[aria-label="Move task"]')
        return !!t && t.getAttribute('aria-expanded') === 'false'
      }, { titleB: DOING_LAST }, { timeout: 5000 })

      reporter.pass('A closed and B opened in a single click on B')
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Regression: opening the menu does not visibly move the card (Bug B on
    // #129 fix follow-up). svelte-dnd-action's mousedown listener used to see
    // the trigger's mousedown bubble through the slot wrapper and register a
    // brief drag candidate, producing a "wobble". Assertion: the card's
    // bounding rect is identical immediately before and immediately after
    // the trigger click.
    // ================================================================

    reporter.startTest('Bug B regression: clicking the trigger does not shift the card position')
    try {
      const card = page
        .locator(`.task-card:has(.task-title:has-text("${DOING_FIRST}"))`)
        .first()
      const trigger = card.locator('button[aria-label="Move task"]')

      const before = await card.boundingBox()
      if (!before) {
        throw new Error('Could not read card bounding box before click')
      }
      await trigger.click()
      // Read the rect immediately and again after a paint, to catch any
      // animation that snaps the card back to its origin a frame or two
      // later. A wobble would manifest as a non-zero delta on either read.
      const immediately = await card.boundingBox()
      // Wait briefly for any deferred animation frames.
      await page.waitForTimeout(150)
      const afterPaint = await card.boundingBox()

      if (!immediately || !afterPaint) {
        throw new Error('Could not read card bounding box after click')
      }

      const dxImmediate = Math.abs(immediately.x - before.x)
      const dyImmediate = Math.abs(immediately.y - before.y)
      const dxPaint = Math.abs(afterPaint.x - before.x)
      const dyPaint = Math.abs(afterPaint.y - before.y)

      // Allow zero motion only — the menu opens in absolute positioning and
      // must not displace the card itself.
      if (dxImmediate > 0.5 || dyImmediate > 0.5 || dxPaint > 0.5 || dyPaint > 0.5) {
        throw new Error(
          `Card moved when menu opened: immediate Δ=(${dxImmediate.toFixed(2)},${dyImmediate.toFixed(2)}), ` +
          `post-paint Δ=(${dxPaint.toFixed(2)},${dyPaint.toFixed(2)}); ` +
          `before=${JSON.stringify(before)}, immediately=${JSON.stringify(immediately)}, after=${JSON.stringify(afterPaint)}`,
        )
      }

      // Close the menu so cleanup starts clean.
      await page.keyboard.press('Escape')
      reporter.pass(`Card position unchanged across trigger click: Δimmediate=(${dxImmediate.toFixed(2)},${dyImmediate.toFixed(2)}), Δpaint=(${dxPaint.toFixed(2)},${dyPaint.toFixed(2)})`)
    } catch (err) {
      reporter.fail(err)
    }

    // ================================================================
    // Cleanup
    // ================================================================

    reporter.startTest('Cleanup: delete tasks and theme')
    try {
      await page.evaluate(async ({ ids, themeId }) => {
        const app = window.go.main.App
        for (const id of ids) {
          if (id) await app.DeleteTask(id)
        }
        if (themeId) await app.Dismiss(themeId)
      }, {
        ids: [uiFirstId, uiMiddleId, uiLastId, doingFirstId, doingMiddleId, doingLastId],
        themeId,
      })
      reporter.pass('Tasks and theme deleted')
    } catch (err) {
      reporter.fail(err)
    }

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
