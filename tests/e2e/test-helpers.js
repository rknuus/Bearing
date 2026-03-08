/**
 * Shared test utilities for Bearing true E2E tests
 *
 * Tests run against Wails dev server at http://localhost:34215 with a real Go
 * backend. File verification reads JSON files and git history from the data
 * directory specified by BEARING_DATA_DIR.
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export const TEST_CONFIG = {
  WAILS_DEV_URL: process.env.WAILS_DEV_URL || 'http://localhost:34215',
  TIMEOUT: 60000,
  HEADLESS: process.env.HEADLESS === 'true',
  SLOW_MO: 50,
  CHROME_CHANNEL: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? 'chrome',
}

/**
 * Check if Wails dev server is running and ready
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
 * Wait for Wails dev server to be ready
 */
export async function waitForServers(maxAttempts = 60, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await isServerReady()

    if (ready) {
      return true
    }

    if (i === 0) {
      console.log('Waiting for Wails dev server to be ready...')
    }
    if (i % 5 === 0 && i > 0) {
      console.log(`  Still waiting... (attempt ${i + 1}/${maxAttempts})`)
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  throw new Error('Wails dev server failed to start within timeout period')
}

// --- File verification helpers ---

/**
 * Read and parse a JSON file from the data directory
 */
export function readJSON(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  const content = fs.readFileSync(fullPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Read themes array from themes/themes.json (unwraps ThemesFile wrapper)
 */
export function readThemes(dataDir) {
  const data = readJSON(dataDir, 'themes/themes.json')
  return data.themes || []
}

/**
 * Run git log --oneline and return array of commit messages
 */
export function getGitLog(dataDir) {
  try {
    const output = execSync('git log --oneline --format=%s', { cwd: dataDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return output.trim().split('\n').filter(Boolean)
  } catch {
    // No commits yet (empty repo)
    return []
  }
}

/**
 * Return total git commit count
 */
export function getGitCommitCount(dataDir) {
  try {
    const output = execSync('git rev-list --count HEAD', { cwd: dataDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return parseInt(output.trim(), 10)
  } catch {
    // No commits yet (empty repo) — HEAD doesn't exist
    return 0
  }
}

/**
 * Assert file exists at the given relative path
 */
export function assertFileExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Expected file to exist: ${relativePath}`)
  }
}

/**
 * Assert file does NOT exist at the given relative path
 */
export function assertFileNotExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (fs.existsSync(fullPath)) {
    throw new Error(`Expected file NOT to exist: ${relativePath}`)
  }
}

/**
 * Assert directory exists at the given relative path
 */
export function assertDirExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    throw new Error(`Expected directory to exist: ${relativePath}`)
  }
}

/**
 * Assert directory does NOT exist at the given relative path
 */
export function assertDirNotExists(dataDir, relativePath) {
  const fullPath = path.join(dataDir, relativePath)
  if (fs.existsSync(fullPath)) {
    throw new Error(`Expected directory NOT to exist: ${relativePath}`)
  }
}

/**
 * List task files in a status directory
 */
export function getTaskFiles(dataDir, status) {
  const dir = path.join(dataDir, 'tasks', status)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'))
}

/**
 * Check if git working tree is clean (no unstaged changes)
 */
export function isWorkingTreeClean(dataDir) {
  try {
    // Only check tracked files (ignore untracked like .gitignore, navigation_context.json)
    const output = execSync('git diff --name-only -- ":!bearing.log" && git diff --cached --name-only -- ":!bearing.log"', { cwd: dataDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], shell: true })
    return output.trim() === ''
  } catch {
    return true
  }
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
