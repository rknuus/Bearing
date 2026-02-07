/**
 * E2E Tests for Application Lifecycle
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
  console.log('Starting App Lifecycle E2E Tests...\n')

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
      // The default view is 'home' which shows .placeholder-view
      const homeView = await page.waitForSelector('.placeholder-view', {
        timeout: 5000,
      })
      if (!homeView) {
        throw new Error('Home view (.placeholder-view) not found')
      }

      // Verify the welcome heading is present
      const headingText = await page.$eval(
        '.placeholder-view h1',
        (el) => el.textContent.trim()
      )
      if (!headingText.includes('Welcome to Bearing')) {
        throw new Error(
          `Expected heading "Welcome to Bearing", got "${headingText}"`
        )
      }

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

      // Verify quick navigation buttons are present on home view
      const quickNavButtons = await page.$$('.quick-nav-btn')
      if (quickNavButtons.length < 3) {
        throw new Error(
          `Expected at least 3 quick nav buttons, found ${quickNavButtons.length}`
        )
      }

      // Verify Home nav link is active by default
      const activeNavLink = await page.$eval(
        '.nav-link.active',
        (el) => el.textContent.trim()
      )
      if (activeNavLink !== 'Home') {
        throw new Error(
          `Expected active nav link "Home", got "${activeNavLink}"`
        )
      }

      reporter.pass('Default home view renders correctly')
    } catch (err) {
      reporter.fail(err)
    }

    // ---- Test 3: Navigation between views works ----
    reporter.startTest('Navigation between views works')
    try {
      // Click the OKRs nav link
      await page.click('.nav-link:has-text("OKRs")')

      // Wait for the OKR view to render (wrapped in .scrollable-view)
      await page.waitForSelector('.scrollable-view', {
        timeout: 5000,
      })

      // Verify the OKRs nav link is now active
      const activeAfterOKR = await page.$eval(
        '.nav-link.active',
        (el) => el.textContent.trim()
      )
      if (activeAfterOKR !== 'OKRs') {
        throw new Error(
          `Expected active nav link "OKRs" after click, got "${activeAfterOKR}"`
        )
      }

      // Verify Home view is no longer visible
      const homeViewGone = await page.$('.placeholder-view')
      if (homeViewGone) {
        throw new Error(
          'Home view should not be visible after navigating to OKRs'
        )
      }

      // Navigate to Tasks view
      await page.click('.nav-link:has-text("Tasks")')

      // Wait for the Tasks nav link to become active
      await page.waitForSelector('.nav-link.active:has-text("Tasks")', {
        timeout: 5000,
      })

      // Verify the OKR scrollable-view is gone (replaced by EisenKan)
      const okrViewGone = await page.$('.scrollable-view')
      if (okrViewGone) {
        // .scrollable-view is only used for OKR and Components; Tasks does not use it
        const content = await okrViewGone.evaluate(
          (el) => el.textContent
        )
        if (content.includes('Objectives')) {
          throw new Error(
            'OKR view should not be visible after navigating to Tasks'
          )
        }
      }

      // Navigate back to Home
      await page.click('.nav-link:has-text("Home")')
      await page.waitForSelector('.placeholder-view', {
        timeout: 5000,
      })

      const activeAfterHome = await page.$eval(
        '.nav-link.active',
        (el) => el.textContent.trim()
      )
      if (activeAfterHome !== 'Home') {
        throw new Error(
          `Expected active nav link "Home" after returning, got "${activeAfterHome}"`
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
