/**
 * UI Component Tests for Reduced-Motion (issue #148)
 *
 * Verifies that the global `@media (prefers-reduced-motion: reduce)` rule
 * in `frontend/src/styles.css` actually applies at runtime by emulating
 * the media feature via Playwright. This is the only place where the
 * rule can be exercised — Vitest+jsdom cannot evaluate `@media` queries.
 *
 * Runs against Vite dev server (localhost:5173) with mock Wails bindings.
 *
 * Coverage:
 *   1. A DOM element that declares `animation: <name> 0.6s` reports a
 *      computed `animationDuration` of `0.01ms` once reduced motion is on.
 *   2. A DOM element that declares `transition-duration: 1s` reports a
 *      computed `transitionDuration` of `0.01ms`.
 *   3. The targeted opt-out for `.spinner` and `.dot` (which otherwise
 *      look broken when frozen mid-rotation) reports `animation: none`.
 *
 * We inject the elements ourselves so the test is independent of how the
 * app currently provokes its animations — the rule lives in `styles.css`
 * and applies globally, so any element under the document root suffices.
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
} from './test-helpers.js'

const reporter = new TestReporter('Reduced Motion Tests')

export async function runTests() {
  console.log('Starting Reduced Motion Tests...\n')

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
        if (text.includes('[Wails Mock]')) return
        if (text.includes('Failed to load resource')) return
        consoleErrors.push(text)
      }
    })

    // Enable the reduced-motion media feature before any styles are
    // computed so the global rule wins on first paint.
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.goto(TEST_CONFIG.WAILS_DEV_URL, {
      waitUntil: 'networkidle',
      timeout: TEST_CONFIG.TIMEOUT,
    })

    // Wait for the app to mount so `styles.css` is in the document.
    await page.waitForSelector('.app-container', { timeout: 10000 })

    // Chrome serializes `0.01ms` as `1e-05s` (in seconds, scientific
    // notation), but the underlying value is the same near-zero duration.
    // Parse to seconds and assert against a small upper bound — anything
    // under 1ms confirms the global reduced-motion rule won (a real
    // animation would report 0.3s/0.6s/1s/etc.).
    const durationToSeconds = (value) => {
      const trimmed = value.trim()
      if (trimmed.endsWith('ms')) {
        return parseFloat(trimmed.slice(0, -2)) / 1000
      }
      if (trimmed.endsWith('s')) {
        return parseFloat(trimmed.slice(0, -1))
      }
      return parseFloat(trimmed)
    }

    // ---- Test 1: animation-duration is neutralized ----
    reporter.startTest(
      'Reduced motion neutralizes animation-duration to ~0ms'
    )
    try {
      const animationDuration = await page.evaluate(() => {
        // Inject a keyframe + an element that uses a long animation. The
        // global reduced-motion rule must clamp the duration regardless of
        // what the inline style requests.
        const style = document.createElement('style')
        style.id = 'rm-test-style'
        style.textContent = `
          @keyframes rm-test-spin { to { transform: rotate(360deg); } }
          .rm-test-anim {
            width: 10px; height: 10px;
            animation: rm-test-spin 0.6s linear infinite;
          }
        `
        document.head.appendChild(style)

        const el = document.createElement('div')
        el.className = 'rm-test-anim'
        document.body.appendChild(el)

        const computed = window.getComputedStyle(el).animationDuration

        el.remove()
        style.remove()
        return computed
      })

      const seconds = durationToSeconds(animationDuration)
      if (!(seconds < 0.001)) {
        throw new Error(
          `Expected animationDuration < 1ms, got '${animationDuration}' (${seconds}s)`
        )
      }

      reporter.pass(
        `animationDuration === '${animationDuration}' (< 1ms — global rule wins over 600ms inline)`
      )
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 2: transition-duration is neutralized ----
    reporter.startTest(
      'Reduced motion neutralizes transition-duration to ~0ms'
    )
    try {
      const transitionDuration = await page.evaluate(() => {
        const el = document.createElement('div')
        el.style.cssText =
          'width:10px;height:10px;opacity:1;transition:opacity 1s ease;'
        document.body.appendChild(el)

        const computed = window.getComputedStyle(el).transitionDuration

        el.remove()
        return computed
      })

      const seconds = durationToSeconds(transitionDuration)
      if (!(seconds < 0.001)) {
        throw new Error(
          `Expected transitionDuration < 1ms, got '${transitionDuration}' (${seconds}s)`
        )
      }

      reporter.pass(
        `transitionDuration === '${transitionDuration}' (< 1ms — global rule wins over 1s inline)`
      )
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 3: spinner / pulse opt-out ----
    reporter.startTest(
      'Reduced motion disables `.spinner` and `.dot` animations entirely'
    )
    try {
      const result = await page.evaluate(() => {
        const style = document.createElement('style')
        style.id = 'rm-test-spin-style'
        style.textContent = `
          @keyframes rm-test-spin2 { to { transform: rotate(360deg); } }
          .rm-test-spin-target {
            animation: rm-test-spin2 0.6s linear infinite;
          }
        `
        document.head.appendChild(style)

        const spinner = document.createElement('span')
        spinner.className = 'spinner rm-test-spin-target'
        document.body.appendChild(spinner)

        const dot = document.createElement('span')
        dot.className = 'dot rm-test-spin-target'
        document.body.appendChild(dot)

        const spinnerName = window.getComputedStyle(spinner).animationName
        const dotName = window.getComputedStyle(dot).animationName

        spinner.remove()
        dot.remove()
        style.remove()

        return { spinnerName, dotName }
      })

      if (result.spinnerName !== 'none') {
        throw new Error(
          `Expected .spinner animation-name 'none', got '${result.spinnerName}'`
        )
      }
      if (result.dotName !== 'none') {
        throw new Error(
          `Expected .dot animation-name 'none', got '${result.dotName}'`
        )
      }

      reporter.pass(
        `.spinner & .dot animation-name === 'none' (no frozen-mid-rotation glitch)`
      )
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Sanity: no page or console errors during the run ----
    reporter.startTest('No page or console errors during reduced-motion run')
    try {
      if (pageErrors.length > 0) {
        throw new Error(`Page errors: ${pageErrors.join('; ')}`)
      }
      if (consoleErrors.length > 0) {
        throw new Error(`Console errors: ${consoleErrors.join('; ')}`)
      }
      reporter.pass('clean')
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
