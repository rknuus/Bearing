/**
 * Test Runner for Bearing true E2E Tests
 * Orchestrates test execution, server checks, and result aggregation
 *
 * Tests run against Wails dev server with real Go backend.
 * URL: http://localhost:34115
 * Data directory: set via BEARING_DATA_DIR environment variable
 */

import { isServerReady, TEST_CONFIG } from './test-helpers.js'

const TEST_SUITES = [
  { name: 'Full Flow (E2E)', file: 'full-flow.test.js', enabled: true },
  { name: 'Tag Round-Trip (E2E)', file: 'tag-roundtrip.test.js', enabled: true },
  { name: 'Overdue Routines Collapse + Absorption (E2E)', file: 'overdue-routines-collapse-and-absorb.test.js', enabled: true },
  { name: 'Doing → Todo Section Drag (E2E)', file: 'doing-to-todo-section-drag.test.js', enabled: true },
]

const enabledSuites = TEST_SUITES.filter(suite => suite.enabled)

if (enabledSuites.length === 0) {
  console.log('No test files registered yet.')
  process.exit(0)
}

import { spawn } from 'child_process'

class TestRunner {
  constructor() {
    this.results = []
    this.totalPassed = 0
    this.totalFailed = 0
  }

  async checkServers() {
    console.log('Checking if Wails dev server is running...\n')

    const serverReady = await isServerReady()

    if (!serverReady) {
      console.error('Wails dev server is not running!')
      console.error('  Please start the Wails dev server with a custom data directory:')
      console.error('  BEARING_DATA_DIR=/tmp/bearing-e2e wails dev\n')
      console.error(`  Expected URL: ${TEST_CONFIG.WAILS_DEV_URL}\n`)
      return false
    }
    console.log(`Wails dev server is running (${TEST_CONFIG.WAILS_DEV_URL})\n`)

    return true
  }

  async runTestSuite(suite) {
    console.log('='.repeat(70))
    console.log(`Running: ${suite.name}`)
    console.log('='.repeat(70))

    return new Promise((resolve) => {
      const testProcess = spawn('node', [suite.file], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...process.env, HEADLESS: process.env.HEADLESS || 'false' },
      })

      testProcess.on('close', code => {
        const result = {
          suite: suite.name,
          passed: code === 0,
          exitCode: code,
        }

        this.results.push(result)

        if (code === 0) {
          this.totalPassed++
          console.log(`\n${suite.name} - PASSED\n`)
        } else {
          this.totalFailed++
          console.log(`\n${suite.name} - FAILED (exit code: ${code})\n`)
        }

        resolve(result)
      })

      testProcess.on('error', err => {
        console.error(`\nError running ${suite.name}:`, err)
        this.totalFailed++
        this.results.push({
          suite: suite.name,
          passed: false,
          exitCode: -1,
          error: err.message,
        })
        resolve({ suite: suite.name, passed: false, exitCode: -1 })
      })
    })
  }

  async runAll() {
    console.log(`Bearing E2E Test Suite Runner\n`)
    console.log(`Running ${enabledSuites.length} test suites...\n`)

    const serversReady = await this.checkServers()
    if (!serversReady) {
      console.error('Cannot run tests - Wails dev server not ready')
      process.exit(1)
    }

    const startTime = Date.now()

    for (const suite of enabledSuites) {
      await this.runTestSuite(suite)
    }

    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    this.printSummary(duration)
    process.exit(this.totalFailed > 0 ? 1 : 0)
  }

  printSummary(duration) {
    console.log('\n' + '='.repeat(70))
    console.log('FINAL TEST SUMMARY')
    console.log('='.repeat(70))

    console.log('\nTest Suite Results:')
    this.results.forEach(result => {
      const status = result.passed ? 'PASS' : 'FAIL'
      console.log(`  ${status} - ${result.suite}`)
    })

    console.log('\n' + '-'.repeat(70))
    console.log(`Total Suites: ${enabledSuites.length}`)
    console.log(`Passed:       ${this.totalPassed}`)
    console.log(`Failed:       ${this.totalFailed}`)
    console.log(`Duration:     ${duration}s`)
    console.log('-'.repeat(70))

    if (this.totalFailed > 0) {
      console.log('\nFailed Suites:')
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.suite} (exit code: ${r.exitCode})`)
        })
    } else {
      console.log('\nAll test suites passed!')
    }

    console.log('\n' + '='.repeat(70))
  }
}

const runner = new TestRunner()
runner.runAll().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
