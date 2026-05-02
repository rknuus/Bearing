/**
 * Tag Deck — View-Entry Re-Read E2E Test
 *
 * Per AD-4 (initiative tag-stacked-boards), the EisenKan TagBoardDeck
 * re-reads today's focus tags every time the user enters the EisenKan
 * view. This test exercises the cross-view propagation path:
 *
 *   1. Seed a theme + a task carrying tag X.
 *   2. Set today's day-focus tag to X via the backend (mimicking a save
 *      from the Calendar view).
 *   3. Switch the user to OKR, then back to EisenKan.
 *   4. Assert the deck shows X as a focus chip in the strip and lands on
 *      X's board (or, equivalently, X is the active strip item).
 *   5. Update today's day-focus tag to Y, again via the backend.
 *   6. Switch to OKR, then back to EisenKan.
 *   7. Assert the deck now reflects Y instead of X.
 *
 * The point of the test is the *re-read on view re-entry* — without it,
 * step 6 would still display X.
 *
 * Prerequisites: same as the rest of the e2e suite (Wails dev server +
 * BEARING_DATA_DIR pointed at a clean test repo).
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
  readThemes,
} from './test-helpers.js'

const DATA_DIR = process.env.BEARING_DATA_DIR
if (!DATA_DIR) {
  console.error('ERROR: BEARING_DATA_DIR environment variable is not set.')
  process.exit(1)
}

const reporter = new TestReporter('Tag Deck — View-Entry Re-Read E2E')

const TAG_X = 'e2e-deck-x'
const TAG_Y = 'e2e-deck-y'

/** Returns the YYYY-MM-DD ISO string for today's local date. */
function todayISO() {
  const d = new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Locate the active strip item (current foreground board). */
async function activeStripLabel(page) {
  const active = page.locator('.tag-board-strip-item.active').first()
  if ((await active.count()) === 0) return null
  return ((await active.textContent()) ?? '').trim()
}

/** Returns the labels of all focus-group chips in the strip. */
async function focusChipLabels(page) {
  const chips = page.locator('.tag-board-strip-item.focus-group')
  const count = await chips.count()
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(((await chips.nth(i).textContent()) ?? '').trim())
  }
  return out
}

/** Saves today's day-focus tags via the backend (mirrors the Calendar save path). */
async function setTodayFocusTags(page, themeIds, tags) {
  const date = todayISO()
  await page.evaluate(
    async ({ date, themeIds, tags }) => {
      const app = window.go.main.App
      await app.SaveDayFocus({
        date,
        themeIds,
        tags,
        notes: '',
        text: '',
        okrIds: [],
      })
    },
    { date, themeIds, tags },
  )
}

export async function runTests() {
  console.log('Starting Tag Deck View-Entry Re-Read E2E Test...\n')
  console.log(`Data directory: ${DATA_DIR}\n`)

  let browser
  const pageErrors = []
  const consoleErrors = []

  try {
    console.log('Checking servers...')
    await waitForServers()
    console.log('  Servers are ready\n')

    const launchOptions = {
      headless: TEST_CONFIG.HEADLESS,
      slowMo: TEST_CONFIG.SLOW_MO,
    }
    if (TEST_CONFIG.CHROME_CHANNEL) {
      launchOptions.channel = TEST_CONFIG.CHROME_CHANNEL
    }
    browser = await chromium.launch(launchOptions)
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

    // ----------------------------------------------------------------
    // Setup: create theme, seed two tasks each carrying one of the deck
    // tags, and clear any pre-existing navigation context (selectedTag)
    // so the default-board rule has a fresh slate.
    // ----------------------------------------------------------------

    reporter.startTest('Setup: theme + tagged tasks + reset navigation context')
    let themeId
    try {
      // Reset navigation context so no stale selectedTag overrides the default rule.
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
          selectedTag: '',
        })
      })

      // Create a theme + two tasks (one per deck tag) via the backend.
      const ids = await page.evaluate(
        async ({ themeName, tagX, tagY }) => {
          const app = window.go.main.App
          const themeResult = await app.Establish({
            goalType: 'theme',
            name: themeName,
            color: '#10b981',
          })
          const themeId = themeResult.theme.id
          // CreateTask(title, themeId, priority, description, tags, promotionDate)
          const tX = await app.CreateTask(`E2E ${tagX} task`, themeId, 'important-urgent', '', tagX, '')
          const tY = await app.CreateTask(`E2E ${tagY} task`, themeId, 'important-urgent', '', tagY, '')
          return { themeId, tX: tX.id, tY: tY.id }
        },
        { themeName: 'E2E Deck Theme', tagX: TAG_X, tagY: TAG_Y },
      )
      themeId = ids.themeId

      const themes = readThemes(DATA_DIR)
      if (!themes.find(t => t.id === themeId)) {
        throw new Error(`Theme ${themeId} not found on disk`)
      }

      reporter.pass(`themeId=${themeId} tasks seeded with tags [${TAG_X}, ${TAG_Y}]`)
    } catch (err) {
      reporter.fail(err)
    }

    // ----------------------------------------------------------------
    // Step A: set today's focus = [TAG_X], navigate to EisenKan, assert
    // the deck reflects TAG_X (focus chip + active foreground).
    // ----------------------------------------------------------------

    reporter.startTest(`Step A: focus=[${TAG_X}] reflects after EisenKan navigation`)
    try {
      await setTodayFocusTags(page, [], [TAG_X])

      // Force a page reload so the App-level focus state is freshly
      // resolved; this is the analogue of "user opened the app today".
      await page.reload({ waitUntil: 'networkidle', timeout: TEST_CONFIG.TIMEOUT })

      // Navigate via OKR → EisenKan so App.navigateToEisenKan() runs and
      // re-resolves today's focus before remounting the deck. (A direct
      // first-load to EisenKan races the async focus init — the deck
      // mounts before todayFocusTags has been resolved.)
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.okr-view', { timeout: 10000 })

      await page.click('.nav-link:has-text("Short-term")')
      await page.waitForSelector('.eisenkan-container', { timeout: 10000 })
      await page.waitForSelector('.tag-board-strip', { timeout: 10000 })

      // Allow a couple of frames for derived reactivity to settle.
      let focusChipsA = []
      for (let i = 0; i < 10; i++) {
        focusChipsA = await focusChipLabels(page)
        if (focusChipsA.includes(TAG_X)) break
        await page.waitForTimeout(50)
      }
      if (!focusChipsA.includes(TAG_X)) {
        throw new Error(`Expected focus chips to include "${TAG_X}", got ${JSON.stringify(focusChipsA)}`)
      }
      const activeA = await activeStripLabel(page)
      if (activeA !== TAG_X) {
        throw new Error(`Expected active board "${TAG_X}", got "${activeA}"`)
      }
      reporter.pass(`focus chips=[${focusChipsA.join(', ')}], active=${activeA}`)
    } catch (err) {
      reporter.fail(err)
    }

    // ----------------------------------------------------------------
    // Step B: while EisenKan stays mounted, change today's focus on the
    // backend to [TAG_Y]. The deck must NOT yet reflect the change —
    // AD-4 explicitly defers cross-view propagation to view-mount only.
    // ----------------------------------------------------------------

    reporter.startTest(`Step B: backend focus change to [${TAG_Y}] does NOT propagate to a still-mounted deck`)
    try {
      await setTodayFocusTags(page, [], [TAG_Y])

      // Give the page a moment in case any rogue subscription tries to fire.
      await page.waitForTimeout(300)

      const focusChipsB = await focusChipLabels(page)
      // The deck should still show TAG_X — focus is snapshotted at view-mount,
      // and EisenKan is still the active view.
      if (!focusChipsB.includes(TAG_X)) {
        throw new Error(
          `AD-4 violation: focus changed mid-view; expected stale focus to still include "${TAG_X}", got ${JSON.stringify(focusChipsB)}`,
        )
      }
      reporter.pass(`stale focus retained: chips=[${focusChipsB.join(', ')}]`)
    } catch (err) {
      reporter.fail(err)
    }

    // ----------------------------------------------------------------
    // Step C: switch to OKR (Long-term), then back to EisenKan. The
    // deck remounts, re-reads focus, and reflects [TAG_Y]. Foreground
    // selection: TAG_X was persisted (recognised) so it stays foreground;
    // we only assert the focus chip / marker has moved.
    // ----------------------------------------------------------------

    reporter.startTest('Step C: switching OKR → EisenKan triggers view-mount re-read')
    try {
      await page.click('.nav-link:has-text("Long-term")')
      // OKRView mounts a different container; wait for it to appear and
      // for the EisenKan container to detach so the deck unmounts cleanly.
      await page.waitForSelector('.okr-view', { timeout: 10000 })
      await page.waitForSelector('.eisenkan-container', { state: 'detached', timeout: 10000 })

      // Switch back to EisenKan — this remounts EisenKanView and the deck.
      await page.click('.nav-link:has-text("Short-term")')
      await page.waitForSelector('.eisenkan-container', { timeout: 10000 })
      await page.waitForSelector('.tag-board-strip', { timeout: 10000 })

      // The strip's focus group must now reflect [TAG_Y].
      let focusChipsC = []
      // Allow a couple of frames for derived reactivity to settle.
      for (let i = 0; i < 10; i++) {
        focusChipsC = await focusChipLabels(page)
        if (focusChipsC.includes(TAG_Y)) break
        await page.waitForTimeout(50)
      }

      if (!focusChipsC.includes(TAG_Y)) {
        throw new Error(
          `View-entry re-read failed: expected focus chips to include "${TAG_Y}", got ${JSON.stringify(focusChipsC)}`,
        )
      }
      if (focusChipsC.includes(TAG_X)) {
        throw new Error(
          `Stale focus leaked across re-mount: chips still include "${TAG_X}" (${JSON.stringify(focusChipsC)})`,
        )
      }
      reporter.pass(`focus chips after view re-entry: [${focusChipsC.join(', ')}]`)
    } catch (err) {
      reporter.fail(err)
    }

    // ----------------------------------------------------------------
    // Cleanup: dismiss the theme so the test repo stays small. We leave
    // the day-focus entry in place — it is naturally per-day and does
    // not interfere with subsequent test runs against a fresh data dir.
    // ----------------------------------------------------------------

    reporter.startTest('Cleanup: dismiss theme')
    try {
      await page.evaluate(async ({ themeId }) => {
        const app = window.go.main.App
        if (themeId) await app.Dismiss(themeId)
      }, { themeId })
      reporter.pass('Theme dismissed')
    } catch (err) {
      reporter.fail(err)
    }

    // ----------------------------------------------------------------
    // Final: no page errors / no console errors / no [state-check] warnings.
    // ----------------------------------------------------------------

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
