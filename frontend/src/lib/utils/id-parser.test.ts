/**
 * Unit tests for id-parser utility
 *
 * These are simple runtime tests that can be run in the browser console
 * or with a test runner like Vitest.
 */

import {
  getIdType,
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
  assertEqual(getIdType('THEME-01'), 'theme', 'THEME- prefix returns theme');
  assertEqual(getIdType('THEME-99'), 'theme', 'THEME- prefix with any number returns theme');
  assertEqual(getIdType('OBJ-01'), 'okr', 'OBJ- prefix returns okr');
  assertEqual(getIdType('OBJ-42'), 'okr', 'OBJ- prefix with any number returns okr');
  assertEqual(getIdType('KR-01'), 'kr', 'KR- prefix returns kr');
  assertEqual(getIdType('KR-123'), 'kr', 'KR- prefix with any number returns kr');
  assertEqual(getIdType('TASK-01'), 'task', 'TASK- prefix returns task');
  assertEqual(getIdType('TASK-007'), 'task', 'TASK- prefix with any number returns task');
  assertEqual(getIdType(''), null, 'Empty string returns null');
  assertEqual(getIdType('INVALID'), null, 'Unknown prefix returns null');
  assertEqual(getIdType('FOO-01'), null, 'Unrecognized prefix returns null');

  console.log('getIdType tests passed');
}

// Helper to create test theme data
function makeThemes(): main.LifeTheme[] {
  return [
    new main.LifeTheme({
      id: 'THEME-01',
      name: 'Health',
      color: '#ff0000',
      objectives: [
        new main.Objective({
          id: 'OBJ-01',
          title: 'Get fit',
          keyResults: [
            new main.KeyResult({ id: 'KR-01', description: 'Run 5k' }),
            new main.KeyResult({ id: 'KR-02', description: 'Lose weight' }),
          ],
          objectives: [
            new main.Objective({
              id: 'OBJ-03',
              title: 'Nested objective',
              keyResults: [
                new main.KeyResult({ id: 'KR-04', description: 'Nested KR' }),
              ],
              objectives: [],
            }),
          ],
        }),
      ],
    }),
    new main.LifeTheme({
      id: 'THEME-02',
      name: 'Career',
      color: '#00ff00',
      objectives: [
        new main.Objective({
          id: 'OBJ-02',
          title: 'Get promoted',
          keyResults: [
            new main.KeyResult({ id: 'KR-03', description: 'Ship project' }),
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
    buildBreadcrumbs('THEME-01', themes),
    [{ id: 'THEME-01', type: 'theme', label: 'Theme 01' }],
    'Theme returns single breadcrumb'
  );

  // Objective under a theme
  assertEqual(
    buildBreadcrumbs('OBJ-01', themes),
    [
      { id: 'THEME-01', type: 'theme', label: 'Theme 01' },
      { id: 'OBJ-01', type: 'okr', label: 'OBJ 01' },
    ],
    'Objective returns theme + objective breadcrumbs'
  );

  // Key result under an objective
  assertEqual(
    buildBreadcrumbs('KR-01', themes),
    [
      { id: 'THEME-01', type: 'theme', label: 'Theme 01' },
      { id: 'OBJ-01', type: 'okr', label: 'OBJ 01' },
      { id: 'KR-01', type: 'kr', label: 'KR 01' },
    ],
    'Key result returns full breadcrumb path'
  );

  // Key result in second theme
  assertEqual(
    buildBreadcrumbs('KR-03', themes),
    [
      { id: 'THEME-02', type: 'theme', label: 'Theme 02' },
      { id: 'OBJ-02', type: 'okr', label: 'OBJ 02' },
      { id: 'KR-03', type: 'kr', label: 'KR 03' },
    ],
    'Key result in second theme returns correct path'
  );

  // Nested objective
  assertEqual(
    buildBreadcrumbs('OBJ-03', themes),
    [
      { id: 'THEME-01', type: 'theme', label: 'Theme 01' },
      { id: 'OBJ-01', type: 'okr', label: 'OBJ 01' },
      { id: 'OBJ-03', type: 'okr', label: 'OBJ 03' },
    ],
    'Nested objective returns full path through parent objective'
  );

  // Key result under nested objective
  assertEqual(
    buildBreadcrumbs('KR-04', themes),
    [
      { id: 'THEME-01', type: 'theme', label: 'Theme 01' },
      { id: 'OBJ-01', type: 'okr', label: 'OBJ 01' },
      { id: 'OBJ-03', type: 'okr', label: 'OBJ 03' },
      { id: 'KR-04', type: 'kr', label: 'KR 04' },
    ],
    'KR under nested objective returns full path'
  );

  // ID not in any theme but has recognizable type
  assertEqual(
    buildBreadcrumbs('OBJ-99', themes),
    [{ id: 'OBJ-99', type: 'okr', label: 'OBJ 99' }],
    'Unknown ID with valid prefix returns single segment'
  );

  // Completely unknown ID
  assertEqual(
    buildBreadcrumbs('INVALID', themes),
    [],
    'Unknown ID with no valid prefix returns empty array'
  );

  // Empty inputs
  assertEqual(buildBreadcrumbs('', themes), [], 'Empty ID returns empty array');
  assertEqual(
    buildBreadcrumbs('THEME-01', []),
    [{ id: 'THEME-01', type: 'theme', label: 'Theme 01' }],
    'Empty themes with valid prefix returns single fallback segment'
  );

  console.log('buildBreadcrumbs tests passed');
}

// Run all tests
export function runAllTests(): void {
  console.log('Running id-parser tests...');
  testGetIdType();
  testBuildBreadcrumbs();
  console.log('All id-parser tests passed!');
}

// Auto-run if this module is executed directly
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runIdParserTests = runAllTests;
  console.log('ID parser tests loaded. Run window.runIdParserTests() to execute.');
}
