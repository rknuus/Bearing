/**
 * Flat ID Parser
 *
 * Parses flat IDs like "THEME-01", "OBJ-02", "KR-03" by detecting type from prefix.
 * Builds breadcrumb trails by walking the nested theme/objective/key-result hierarchy.
 */

import type { main } from '../wails/wailsjs/go/models';

export type SegmentType = 'theme' | 'okr' | 'kr' | 'task';

export interface BreadcrumbSegment {
  id: string;
  type: SegmentType;
  label: string;
}

/**
 * Gets the type of a flat ID based on its prefix.
 *
 * @example
 * getIdType("THEME-01") // "theme"
 * getIdType("OBJ-02")   // "okr"
 * getIdType("KR-03")    // "kr"
 * getIdType("TASK-04")  // "task"
 */
export function getIdType(id: string): SegmentType | null {
  if (!id || typeof id !== 'string') {
    return null;
  }

  if (id.startsWith('THEME-')) return 'theme';
  if (id.startsWith('OBJ-')) return 'okr';
  if (id.startsWith('KR-')) return 'kr';
  if (id.startsWith('TASK-')) return 'task';

  return null;
}

/**
 * Display name mapping for segment types
 */
const DISPLAY_NAMES: Record<SegmentType, string> = {
  theme: 'Theme',
  okr: 'OKR',
  kr: 'KR',
  task: 'Task',
};

/**
 * Creates a label for a flat ID (e.g., "THEME-01" -> "Theme 01", "OBJ-02" -> "OBJ 02").
 */
function makeLabel(id: string, type: SegmentType): string {
  const match = id.match(/^[A-Z]+-(\d+)$/);
  if (!match) return id;
  return `${DISPLAY_NAMES[type]} ${match[1]}`;
}

/**
 * Builds a breadcrumb trail for a given entity ID by walking the nested
 * theme/objective/key-result hierarchy.
 *
 * @param id - The flat entity ID (e.g., "KR-03")
 * @param themes - The full array of LifeTheme objects
 * @returns Array of BreadcrumbSegment objects from root to the target entity
 *
 * @example
 * buildBreadcrumbs("KR-03", themes)
 * // Returns:
 * // [
 * //   { id: "THEME-01", type: "theme", label: "Theme 01" },
 * //   { id: "OBJ-02", type: "okr", label: "OBJ 02" },
 * //   { id: "KR-03", type: "kr", label: "KR 03" }
 * // ]
 */
export function buildBreadcrumbs(id: string, themes: main.LifeTheme[]): BreadcrumbSegment[] {
  if (!id || !themes) return [];

  for (const theme of themes) {
    const path = findPathInTheme(id, theme);
    if (path.length > 0) return path;
  }

  // ID not found in any theme; return a single segment if the type is recognizable
  const type = getIdType(id);
  if (type) {
    return [{ id, type, label: makeLabel(id, type) }];
  }
  return [];
}

/**
 * Searches for an entity ID within a theme and returns the breadcrumb path if found.
 */
function findPathInTheme(targetId: string, theme: main.LifeTheme): BreadcrumbSegment[] {
  const themeSeg: BreadcrumbSegment = {
    id: theme.id,
    type: 'theme',
    label: makeLabel(theme.id, 'theme'),
  };

  if (theme.id === targetId) return [themeSeg];

  if (theme.objectives) {
    for (const obj of theme.objectives) {
      const path = findPathInObjective(targetId, obj);
      if (path.length > 0) return [themeSeg, ...path];
    }
  }

  return [];
}

/**
 * Searches for an entity ID within an objective tree (including nested objectives and KRs).
 */
function findPathInObjective(targetId: string, obj: main.Objective): BreadcrumbSegment[] {
  const objSeg: BreadcrumbSegment = {
    id: obj.id,
    type: 'okr',
    label: makeLabel(obj.id, 'okr'),
  };

  if (obj.id === targetId) return [objSeg];

  if (obj.keyResults) {
    for (const kr of obj.keyResults) {
      if (kr.id === targetId) {
        return [objSeg, { id: kr.id, type: 'kr', label: makeLabel(kr.id, 'kr') }];
      }
    }
  }

  if (obj.objectives) {
    for (const nested of obj.objectives) {
      const path = findPathInObjective(targetId, nested);
      if (path.length > 0) return [objSeg, ...path];
    }
  }

  return [];
}
