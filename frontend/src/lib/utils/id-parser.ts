/**
 * Theme-Scoped ID Parser
 *
 * Parses theme-scoped IDs like "H", "H-O1", "H-KR1", "H-T1" by detecting type from pattern.
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
 * Gets the type of a theme-scoped ID based on its pattern.
 *
 * @example
 * getIdType("H")      // "theme"
 * getIdType("CF-O1")  // "okr"
 * getIdType("H-KR2")  // "kr"
 * getIdType("H-T1")   // "task"
 */
export function getIdType(id: string): SegmentType | null {
  if (!id || typeof id !== 'string') {
    return null;
  }

  if (/^[A-Z]{1,3}$/.test(id)) return 'theme';
  if (/^[A-Z]{1,3}-O\d+$/.test(id)) return 'okr';
  if (/^[A-Z]{1,3}-KR\d+$/.test(id)) return 'kr';
  if (/^[A-Z]{1,3}-T\d+$/.test(id)) return 'task';

  return null;
}

/**
 * Extracts the theme abbreviation from any theme-scoped ID.
 *
 * @example
 * getThemeAbbr("H")      // "H"
 * getThemeAbbr("CF-O1")  // "CF"
 * getThemeAbbr("LRN-T5") // "LRN"
 */
export function getThemeAbbr(id: string): string | null {
  if (!id || typeof id !== 'string') return null;
  if (/^[A-Z]{1,3}$/.test(id)) return id;
  const match = id.match(/^([A-Z]{1,3})-(?:O|KR|T)\d+$/);
  return match ? match[1] : null;
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
 * Creates a label for a theme-scoped ID.
 * Theme: abbreviation itself (e.g., "H" -> "H")
 * Others: type + number (e.g., "H-O1" -> "OKR 1", "CF-KR2" -> "KR 2")
 */
function makeLabel(id: string, type: SegmentType): string {
  if (type === 'theme') return id;

  const match = id.match(/^[A-Z]{1,3}-(?:O|KR|T)(\d+)$/);
  if (!match) return id;
  return `${DISPLAY_NAMES[type]} ${match[1]}`;
}

/**
 * Builds a breadcrumb trail for a given entity ID by walking the nested
 * theme/objective/key-result hierarchy.
 *
 * @param id - The entity ID (e.g., "H-KR1")
 * @param themes - The full array of LifeTheme objects
 * @returns Array of BreadcrumbSegment objects from root to the target entity
 *
 * @example
 * buildBreadcrumbs("H-KR1", themes)
 * // Returns:
 * // [
 * //   { id: "H", type: "theme", label: "H" },
 * //   { id: "H-O1", type: "okr", label: "OKR 1" },
 * //   { id: "H-KR1", type: "kr", label: "KR 1" }
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
