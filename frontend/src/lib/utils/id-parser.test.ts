/**
 * Unit tests for id-parser utility
 *
 * These are simple runtime tests that can be run in the browser console
 * or with a test runner like Vitest.
 */

import {
  parseHierarchicalId,
  getParentId,
  getIdType,
  type BreadcrumbSegment,
} from './id-parser';

// Simple test runner for browser console
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

// Test parseHierarchicalId
export function testParseHierarchicalId(): void {
  // Test single segment
  const single = parseHierarchicalId('THEME-01');
  assertEqual(single.length, 1, 'Single segment should return array of length 1');
  assertEqual(single[0].id, 'THEME-01', 'Single segment ID should match');
  assertEqual(single[0].type, 'theme', 'Single segment type should be theme');
  assertEqual(single[0].label, 'Theme 01', 'Single segment label should be formatted');

  // Test two segments
  const two = parseHierarchicalId('THEME-01.OKR-02');
  assertEqual(two.length, 2, 'Two segments should return array of length 2');
  assertEqual(two[0].id, 'THEME-01', 'First segment ID');
  assertEqual(two[1].id, 'THEME-01.OKR-02', 'Second segment ID should include full path');
  assertEqual(two[1].type, 'okr', 'Second segment type should be okr');
  assertEqual(two[1].label, 'OKR 02', 'Second segment label');

  // Test full hierarchy
  const full = parseHierarchicalId('THEME-01.OKR-02.KR-03.TASK-04');
  assertEqual(full.length, 4, 'Full hierarchy should have 4 segments');
  assertEqual(full[0].type, 'theme', 'First type is theme');
  assertEqual(full[1].type, 'okr', 'Second type is okr');
  assertEqual(full[2].type, 'kr', 'Third type is kr');
  assertEqual(full[3].type, 'task', 'Fourth type is task');
  assertEqual(full[3].id, 'THEME-01.OKR-02.KR-03.TASK-04', 'Last segment has full ID');

  // Test empty/invalid input
  assertEqual(parseHierarchicalId(''), [], 'Empty string returns empty array');
  assertEqual(parseHierarchicalId('INVALID'), [], 'Invalid format returns empty array');
  assertEqual(parseHierarchicalId('THEME'), [], 'Missing number returns empty array');

  console.log('parseHierarchicalId tests passed');
}

// Test getParentId
export function testGetParentId(): void {
  assertEqual(getParentId('THEME-01'), null, 'Single segment has no parent');
  assertEqual(getParentId('THEME-01.OKR-02'), 'THEME-01', 'Parent of OKR is THEME');
  assertEqual(
    getParentId('THEME-01.OKR-02.KR-03'),
    'THEME-01.OKR-02',
    'Parent of KR is THEME.OKR'
  );
  assertEqual(getParentId(''), null, 'Empty string returns null');

  console.log('getParentId tests passed');
}

// Test getIdType
export function testGetIdType(): void {
  assertEqual(getIdType('THEME-01'), 'theme', 'Type of THEME-01 is theme');
  assertEqual(getIdType('THEME-01.OKR-02'), 'okr', 'Type of OKR is okr');
  assertEqual(getIdType('THEME-01.OKR-02.KR-03'), 'kr', 'Type of KR is kr');
  assertEqual(getIdType('THEME-01.OKR-02.KR-03.TASK-04'), 'task', 'Type of TASK is task');
  assertEqual(getIdType(''), null, 'Empty string returns null');
  assertEqual(getIdType('INVALID'), null, 'Invalid format returns null');

  console.log('getIdType tests passed');
}

// Run all tests
export function runAllTests(): void {
  console.log('Running id-parser tests...');
  testParseHierarchicalId();
  testGetParentId();
  testGetIdType();
  console.log('All id-parser tests passed!');
}

// Auto-run if this module is executed directly
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runIdParserTests = runAllTests;
  console.log('ID parser tests loaded. Run window.runIdParserTests() to execute.');
}
