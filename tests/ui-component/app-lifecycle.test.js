/**
 * UI Component Tests for Application Lifecycle
 * Tests: app loads without errors, default view renders, navigation works
 *
 * Runs against Vite dev server (localhost:5173) with mock Wails bindings.
 */

import { chromium } from '@playwright/test'
import {
  TEST_CONFIG,
  TestReporter,
  waitForServers,
} from './test-helpers.js'

const reporter = new TestReporter('App Lifecycle Tests')

export async function runTests() {
  console.log('Starting App Lifecycle Tests...\n')

  let browser
  const pageErrors = []
  const consoleErrors = []

  try {
    // Check servers are running
    console.log('Checking servers...')
    await waitForServers()
    console.log('  Servers are ready\n')

    // Launch browser — use system Chrome via channel to avoid needing
    // Playwright's bundled Chromium download
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
        // Ignore known non-error console messages
        if (text.includes('[Wails Mock]')) return
        // Ignore resource load failures (favicon, etc.) — not app errors
        if (text.includes('Failed to load resource')) return
        consoleErrors.push(text)
      }
    })

    // ---- Test 1: App loads without errors ----
    reporter.startTest('App loads without errors')
    try {
      // Clear error tracking for this test
      pageErrors.length = 0
      consoleErrors.length = 0

      await page.goto(TEST_CONFIG.WAILS_DEV_URL, {
        waitUntil: 'networkidle',
        timeout: TEST_CONFIG.TIMEOUT,
      })

      // Wait for the app container to appear
      const appContainer = await page.waitForSelector('.app-container', {
        timeout: 10000,
      })
      if (!appContainer) {
        throw new Error('App container (.app-container) not found')
      }

      // Verify container is visible
      const isVisible = await appContainer.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      if (!isVisible) {
        throw new Error('App container is not visible')
      }

      // Verify no page errors occurred during load
      if (pageErrors.length > 0) {
        throw new Error(
          `Page errors during load: ${pageErrors.join('; ')}`
        )
      }

      // Verify no unexpected console errors
      if (consoleErrors.length > 0) {
        throw new Error(
          `Console errors during load: ${consoleErrors.join('; ')}`
        )
      }

      reporter.pass('App loaded without errors')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 2: Default view renders ----
    reporter.startTest('Default view renders with expected content')
    try {
      // The default view is 'okr' which renders inside .scrollable-view
      await page.waitForSelector('.scrollable-view', {
        timeout: 5000,
      })

      // Verify navigation bar is present with brand name
      const brandText = await page.$eval(
        '.nav-brand',
        (el) => el.textContent.trim()
      )
      if (brandText !== 'Bearing') {
        throw new Error(
          `Expected nav brand "Bearing", got "${brandText}"`
        )
      }

      // Verify OKRs nav link is active by default
      const activeNavLink = await page.$eval(
        '.nav-link.active',
        (el) => el.textContent.trim()
      )
      if (activeNavLink !== 'Long-term') {
        throw new Error(
          `Expected active nav link "Long-term", got "${activeNavLink}"`
        )
      }

      // Verify nav bar has exactly 3 links
      const navLinks = await page.$$('.nav-link')
      if (navLinks.length !== 3) {
        throw new Error(
          `Expected 3 nav links, found ${navLinks.length}`
        )
      }

      reporter.pass('Default OKR view renders correctly')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 3: Navigation between views works ----
    reporter.startTest('Navigation between views works')
    try {
      // Navigate to Calendar view
      await page.click('.nav-link:has-text("Mid-term")')
      await page.waitForSelector('.calendar-view', {
        timeout: 5000,
      })

      const activeAfterCal = await page.$eval(
        '.nav-link.active',
        (el) => el.textContent.trim()
      )
      if (activeAfterCal !== 'Mid-term') {
        throw new Error(
          `Expected active nav link "Mid-term" after click, got "${activeAfterCal}"`
        )
      }

      // Navigate to Tasks view
      await page.click('.nav-link:has-text("Short-term")')
      await page.waitForSelector('.nav-link.active:has-text("Short-term")', {
        timeout: 5000,
      })

      // Navigate back to OKRs
      await page.click('.nav-link:has-text("Long-term")')
      await page.waitForSelector('.scrollable-view', {
        timeout: 5000,
      })

      const activeAfterOKR = await page.$eval(
        '.nav-link.active',
        (el) => el.textContent.trim()
      )
      if (activeAfterOKR !== 'Long-term') {
        throw new Error(
          `Expected active nav link "Long-term" after returning, got "${activeAfterOKR}"`
        )
      }

      reporter.pass('Navigation between views works correctly')
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
