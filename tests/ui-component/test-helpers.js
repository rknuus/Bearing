/**
 * Shared test utilities for Bearing E2E tests
 *
 * Tests run against Vite dev server at http://localhost:5173 with mock Wails
 * bindings. This approach is necessary because Wails v2 does NOT expose bindings
 * via HTTP - they're only available in the native WebView via IPC. Uses Playwright
 * for browser automation.
 *
 * Port Configuration:
 * - Vite dev server (frontend-dev): Port 5173 (with mock Wails bindings)
 * - Wails dev server (wails dev):   Port 34115 (Wails dev proxy)
 */

export const TEST_CONFIG = {
  // E2E tests run against Vite dev server with mock Wails bindings
  // Mock bindings automatically initialized when window.go doesn't exist
  WAILS_DEV_URL: process.env.WAILS_DEV_URL || 'http://localhost:5173',
  TIMEOUT: 30000,
  HEADLESS: process.env.HEADLESS === 'true',
  SLOW_MO: 50,
  // Use system Chrome ('chrome') instead of Playwright's bundled Chromium.
  // Override with PLAYWRIGHT_CHROME_CHANNEL='' to use bundled Chromium.
  CHROME_CHANNEL: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? 'chrome',
}

/**
 * Check if Vite dev server is running and ready
 */
export async function isServerReady() {
  try {
    const response = await fetch(TEST_CONFIG.WAILS_DEV_URL)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Wait for Vite dev server to be ready
 */
export async function waitForServers(maxAttempts = 60, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await isServerReady()

    if (ready) {
      return true
    }

    if (i === 0) {
      console.log('Waiting for Vite dev server to be ready...')
    }
    if (i % 5 === 0 && i > 0) {
      console.log(`  Still waiting... (attempt ${i + 1}/${maxAttempts})`)
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  throw new Error('Vite dev server failed to start within timeout period')
}

/**
 * Test reporter for consistent output
 */
export class TestReporter {
  constructor(suiteName) {
    this.suiteName = suiteName
    this.passed = 0
    this.failed = 0
    this.tests = []
  }

  startTest(testName) {
    console.log(`  ${testName}`)
    this.currentTest = { name: testName, passed: false, error: null }
  }

  pass(message = 'PASS') {
    console.log(`    PASS: ${message}`)
    this.passed++
    this.currentTest.passed = true
    this.tests.push(this.currentTest)
  }

  fail(error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`    FAIL: ${message}`)
    this.failed++
    this.currentTest.passed = false
    this.currentTest.error = message
    this.tests.push(this.currentTest)
  }

  printSummary() {
    console.log('\n' + '='.repeat(60))
    console.log(`${this.suiteName} - Test Summary`)
    console.log('='.repeat(60))
    console.log(`Passed: ${this.passed}`)
    console.log(`Failed: ${this.failed}`)
    console.log(`Total:  ${this.passed + this.failed}`)
    console.log('='.repeat(60))

    if (this.failed > 0) {
      console.log('\nFailed Tests:')
      this.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`)
      })
    }
  }

  shouldExit() {
    return this.failed > 0 ? 1 : 0
  }
}
