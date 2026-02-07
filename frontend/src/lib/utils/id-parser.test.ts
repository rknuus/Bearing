/**
 * Unit tests for id-parser utility
 */

import { describe, it, expect } from 'vitest';
import {
  getIdType,
  getThemeAbbr,
  buildBreadcrumbs,
} from './id-parser';
import { main } from '../wails/wailsjs/go/models';

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

describe('getIdType', () => {
  // Theme IDs: 1-3 uppercase letters
  it('returns "theme" for single letter theme', () => {
    expect(getIdType('H')).toBe('theme');
  });

  it('returns "theme" for two letter theme', () => {
    expect(getIdType('CF')).toBe('theme');
  });

  it('returns "theme" for three letter theme', () => {
    expect(getIdType('LRN')).toBe('theme');
  });

  // Objective IDs: <abbr>-O<n>
  it('returns "okr" for single letter objective', () => {
    expect(getIdType('H-O1')).toBe('okr');
  });

  it('returns "okr" for two letter objective', () => {
    expect(getIdType('CF-O42')).toBe('okr');
  });

  it('returns "okr" for three letter objective', () => {
    expect(getIdType('LRN-O3')).toBe('okr');
  });

  // Key Result IDs: <abbr>-KR<n>
  it('returns "kr" for single letter KR', () => {
    expect(getIdType('H-KR1')).toBe('kr');
  });

  it('returns "kr" for two letter KR', () => {
    expect(getIdType('CF-KR12')).toBe('kr');
  });

  it('returns "kr" for three letter KR', () => {
    expect(getIdType('LRN-KR3')).toBe('kr');
  });

  // Task IDs: <abbr>-T<n>
  it('returns "task" for single letter task', () => {
    expect(getIdType('H-T1')).toBe('task');
  });

  it('returns "task" for two letter task', () => {
    expect(getIdType('CF-T7')).toBe('task');
  });

  it('returns "task" for three letter task', () => {
    expect(getIdType('LRN-T99')).toBe('task');
  });

  // Invalid IDs
  it('returns null for empty string', () => {
    expect(getIdType('')).toBe(null);
  });

  it('returns null for four+ letter string', () => {
    expect(getIdType('INVALID')).toBe(null);
  });

  it('returns null for lowercase abbreviation', () => {
    expect(getIdType('h-O1')).toBe(null);
  });

  it('returns null for unknown type prefix', () => {
    expect(getIdType('H-X1')).toBe(null);
  });

  it('returns null for old format', () => {
    expect(getIdType('THEME-1')).toBe(null);
  });
});

describe('getThemeAbbr', () => {
  it('returns itself for single-letter theme ID', () => {
    expect(getThemeAbbr('H')).toBe('H');
  });

  it('returns itself for two-letter theme ID', () => {
    expect(getThemeAbbr('CF')).toBe('CF');
  });

  it('returns theme abbr from objective ID', () => {
    expect(getThemeAbbr('H-O1')).toBe('H');
  });

  it('returns theme abbr from KR ID', () => {
    expect(getThemeAbbr('CF-KR2')).toBe('CF');
  });

  it('returns theme abbr from task ID', () => {
    expect(getThemeAbbr('LRN-T5')).toBe('LRN');
  });

  it('returns null for empty string', () => {
    expect(getThemeAbbr('')).toBe(null);
  });

  it('returns null for invalid ID', () => {
    expect(getThemeAbbr('INVALID')).toBe(null);
  });
});

describe('buildBreadcrumbs', () => {
  it('returns single breadcrumb for theme itself', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('H', themes)).toEqual([
      { id: 'H', type: 'theme', label: 'H' },
    ]);
  });

  it('returns theme + objective breadcrumbs for objective under a theme', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('H-O1', themes)).toEqual([
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
    ]);
  });

  it('returns full breadcrumb path for key result under an objective', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('H-KR1', themes)).toEqual([
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
      { id: 'H-KR1', type: 'kr', label: 'KR 1' },
    ]);
  });

  it('returns correct path for key result in second theme', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('C-KR1', themes)).toEqual([
      { id: 'C', type: 'theme', label: 'C' },
      { id: 'C-O1', type: 'okr', label: 'OKR 1' },
      { id: 'C-KR1', type: 'kr', label: 'KR 1' },
    ]);
  });

  it('returns full path through parent for nested objective', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('H-O2', themes)).toEqual([
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
      { id: 'H-O2', type: 'okr', label: 'OKR 2' },
    ]);
  });

  it('returns full path for KR under nested objective', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('H-KR3', themes)).toEqual([
      { id: 'H', type: 'theme', label: 'H' },
      { id: 'H-O1', type: 'okr', label: 'OKR 1' },
      { id: 'H-O2', type: 'okr', label: 'OKR 2' },
      { id: 'H-KR3', type: 'kr', label: 'KR 3' },
    ]);
  });

  it('returns single segment for unknown ID with valid pattern', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('X-O99', themes)).toEqual([
      { id: 'X-O99', type: 'okr', label: 'OKR 99' },
    ]);
  });

  it('returns empty array for completely unknown ID', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('INVALID', themes)).toEqual([]);
  });

  it('returns empty array for empty ID', () => {
    const themes = makeThemes();
    expect(buildBreadcrumbs('', themes)).toEqual([]);
  });

  it('returns single fallback segment for valid pattern with empty themes', () => {
    expect(buildBreadcrumbs('H', [])).toEqual([
      { id: 'H', type: 'theme', label: 'H' },
    ]);
  });
});
