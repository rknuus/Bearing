/**
 * Unit tests for id-parser utility
 *
 * These are simple runtime tests that can be run in the browser console
 * or with a test runner like Vitest.
 */

import {
  getIdType,
  getThemeAbbr,
  buildBreadcrumbs,
} from './id-parser';
import { main } from '../wails/wailsjs/go/models';

// Simple test runner for browser console
function assertEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

// Test getIdType
export function testGetIdType(): void {
  // Theme IDs: 1-3 uppercase letters
  assertEqual(getIdType('H'), 'theme', 'Single letter theme');
  assertEqual(getIdType('CF'), 'theme', 'Two letter theme');
  assertEqual(getIdType('LRN'), 'theme', 'Three letter theme');

  // Objective IDs: <abbr>-O<n>
  assertEqual(getIdType('H-O1'), 'okr', 'Single letter objective');
  assertEqual(getIdType('CF-O42'), 'okr', 'Two letter objective');
  assertEqual(getIdType('LRN-O3'), 'okr', 'Three letter objective');

  // Key Result IDs: <abbr>-KR<n>
  assertEqual(getIdType('H-KR1'), 'kr', 'Single letter KR');
  assertEqual(getIdType('CF-KR12'), 'kr', 'Two letter KR');
  assertEqual(getIdType('LRN-KR3'), 'kr', 'Three letter KR');

  // Task IDs: <abbr>-T<n>
  assertEqual(getIdType('H-T1'), 'task', 'Single letter task');
  assertEqual(getIdType('CF-T7'), 'task', 'Two letter task');
  assertEqual(getIdType('LRN-T99'), 'task', 'Three letter task');

  // Invalid IDs
  assertEqual(getIdType(''), null, 'Empty string returns null');
  assertEqual(getIdType('INVALID'), null, 'Four+ letter string returns null');
  assertEqual(getIdType('h-O1'), null, 'Lowercase abbreviation returns null');
  assertEqual(getIdType('H-X1'), null, 'Unknown type prefix returns null');
  assertEqual(getIdType('THEME-1'), null, 'Old format returns null');

  console.log('getIdType tests passed');
}

// Test getThemeAbbr
export function testGetThemeAbbr(): void {
  assertEqual(getThemeAbbr('H'), 'H', 'Theme ID returns itself');
  assertEqual(getThemeAbbr('CF'), 'CF', 'Two-letter theme returns itself');
  assertEqual(getThemeAbbr('H-O1'), 'H', 'Objective returns theme abbr');
  assertEqual(getThemeAbbr('CF-KR2'), 'CF', 'KR returns theme abbr');
  assertEqual(getThemeAbbr('LRN-T5'), 'LRN', 'Task returns theme abbr');
  assertEqual(getThemeAbbr(''), null, 'Empty string returns null');
  assertEqual(getThemeAbbr('INVALID'), null, 'Invalid ID returns null');

  console.log('getThemeAbbr tests passed');
}

// Helper to create test theme data
function makeThemes(): main.LifeTheme[] {
  return [
    new main.LifeTheme({
      id: 'H',
      name: 'Health',
      color: '#ff0000',
      objectives: [
        new main.Objective({
          id: 'H-O1',
          parentId: 'H',
          title: 'Get fit',
          keyResults: [
            new main.KeyResult({ id: 'H-KR1', parentId: 'H-O1', description: 'Run 5k' }),
            new main.KeyResult({ id: 'H-KR2', parentId: 'H-O1', description: 'Lose weight' }),
          ],
          objectives: [
            new main.Objective({
              id: 'H-O2',
              parentId: 'H-O1',
              title: 'Nested objective',
              keyResults: [
                new main.KeyResult({ id: 'H-KR3', parentId: 'H-O2', description: 'Nested KR' }),
              ],
              objectives: [],
            }),
          ],
        }),
      ],
    }),
    new main.LifeTheme({
      id: 'C',
      name: 'Career',
      color: '#00ff00',
      objectives: [
        new main.Objective({
          id: 'C-O1',
          parentId: 'C',
          title: 'Get promoted',
          keyResults: [
            new main.KeyResult({ id: 'C-KR1', parentId: 'C-O1', description: 'Ship project' }),
          ],
          objectives: [],
        }),
      ],
    }),
  ];
}

// Test buildBreadcrumbs
export function testBuildBreadcrumbs(): void {
  const themes = makeThemes();

  // Theme itself
  assertEqual(
    buildBreadcrumbs('H', themes),
    [{ id: 'H', type: 'theme', label: 'H' }],
    'Theme returns single breadcrumb'
  );

  // Objective under a theme
  assertEqual(
    buildBreadcrumbs('H-O1', themes),
    [
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
    ],
    'Objective returns theme + objective breadcrumbs'
  );

  // Key result under an objective
  assertEqual(
    buildBreadcrumbs('H-KR1', themes),
    [
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
      { id: 'H-KR1', type: 'kr', label: 'KR 1' },
    ],
    'Key result returns full breadcrumb path'
  );

  // Key result in second theme
  assertEqual(
    buildBreadcrumbs('C-KR1', themes),
    [
      { id: 'C', type: 'theme', label: 'C' },
      { id: 'C-O1', type: 'okr', label: 'OKR 1' },
      { id: 'C-KR1', type: 'kr', label: 'KR 1' },
    ],
    'Key result in second theme returns correct path'
  );

  // Nested objective
  assertEqual(
    buildBreadcrumbs('H-O2', themes),
    [
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
      { id: 'H-O2', type: 'okr', label: 'OKR 2' },
    ],
    'Nested objective returns full path through parent objective'
  );

  // Key result under nested objective
  assertEqual(
    buildBreadcrumbs('H-KR3', themes),
    [
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
      { id: 'H-O2', type: 'okr', label: 'OKR 2' },
      { id: 'H-KR3', type: 'kr', label: 'KR 3' },
    ],
    'KR under nested objective returns full path'
  );

  // ID not in any theme but has recognizable type
  assertEqual(
    buildBreadcrumbs('X-O99', themes),
    [{ id: 'X-O99', type: 'okr', label: 'OKR 99' }],
    'Unknown ID with valid pattern returns single segment'
  );

  // Completely unknown ID
  assertEqual(
    buildBreadcrumbs('INVALID', themes),
    [],
    'Unknown ID with no valid pattern returns empty array'
  );

  // Empty inputs
  assertEqual(buildBreadcrumbs('', themes), [], 'Empty ID returns empty array');
  assertEqual(
    buildBreadcrumbs('H', []),
    [{ id: 'H', type: 'theme', label: 'H' }],
    'Empty themes with valid pattern returns single fallback segment'
  );

  console.log('buildBreadcrumbs tests passed');
}

// Run all tests
export function runAllTests(): void {
  console.log('Running id-parser tests...');
  testGetIdType();
  testGetThemeAbbr();
  testBuildBreadcrumbs();
  console.log('All id-parser tests passed!');
}

// Auto-run if this module is executed directly
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runIdParserTests = runAllTests;
  console.log('ID parser tests loaded. Run window.runIdParserTests() to execute.');
}
