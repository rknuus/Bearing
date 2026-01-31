/**
 * Hierarchical ID Parser
 *
 * Parses hierarchical IDs like "THEME-01.OKR-02.KR-03" into breadcrumb segments.
 * Each segment contains the full ID path up to that point, the type, and a display label.
 */

export type SegmentType = 'theme' | 'okr' | 'kr' | 'task';

export interface BreadcrumbSegment {
  id: string;      // Full ID up to this point (e.g., "THEME-01.OKR-02")
  type: SegmentType;
  label: string;   // Display name (e.g., "OKR 02")
}

/**
 * Mapping of ID prefixes to their types and display names
 */
const SEGMENT_TYPE_MAP: Record<string, { type: SegmentType; displayName: string }> = {
  'THEME': { type: 'theme', displayName: 'Theme' },
  'OKR': { type: 'okr', displayName: 'OKR' },
  'KR': { type: 'kr', displayName: 'KR' },
  'TASK': { type: 'task', displayName: 'Task' },
};

/**
 * Parses a single segment string like "THEME-01" into type and number parts
 */
function parseSegmentPart(segment: string): { prefix: string; number: string } | null {
  const match = segment.match(/^([A-Z]+)-(\d+)$/);
  if (!match) return null;
  return { prefix: match[1], number: match[2] };
}

/**
 * Parses a hierarchical ID into an array of breadcrumb segments.
 *
 * @param id - The hierarchical ID (e.g., "THEME-01.OKR-02.KR-03")
 * @returns Array of BreadcrumbSegment objects
 *
 * @example
 * parseHierarchicalId("THEME-01.OKR-02.KR-03")
 * // Returns:
 * // [
 * //   { id: "THEME-01", type: "theme", label: "Theme 01" },
 * //   { id: "THEME-01.OKR-02", type: "okr", label: "OKR 02" },
 * //   { id: "THEME-01.OKR-02.KR-03", type: "kr", label: "KR 03" }
 * // ]
 */
export function parseHierarchicalId(id: string): BreadcrumbSegment[] {
  if (!id || typeof id !== 'string') {
    return [];
  }

  const parts = id.split('.');
  const segments: BreadcrumbSegment[] = [];
  const idParts: string[] = [];

  for (const part of parts) {
    const parsed = parseSegmentPart(part);
    if (!parsed) {
      // Invalid segment format, skip or handle gracefully
      continue;
    }

    const typeInfo = SEGMENT_TYPE_MAP[parsed.prefix];
    if (!typeInfo) {
      // Unknown prefix, skip
      continue;
    }

    idParts.push(part);

    segments.push({
      id: idParts.join('.'),
      type: typeInfo.type,
      label: `${typeInfo.displayName} ${parsed.number}`,
    });
  }

  return segments;
}

/**
 * Gets the parent ID from a hierarchical ID.
 * Returns null if the ID has no parent.
 *
 * @example
 * getParentId("THEME-01.OKR-02.KR-03") // "THEME-01.OKR-02"
 * getParentId("THEME-01") // null
 */
export function getParentId(id: string): string | null {
  if (!id || typeof id !== 'string') {
    return null;
  }

  const lastDotIndex = id.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return null;
  }

  return id.substring(0, lastDotIndex);
}

/**
 * Gets the type of a hierarchical ID based on its last segment.
 *
 * @example
 * getIdType("THEME-01.OKR-02") // "okr"
 */
export function getIdType(id: string): SegmentType | null {
  if (!id || typeof id !== 'string') {
    return null;
  }

  const parts = id.split('.');
  const lastPart = parts[parts.length - 1];
  const parsed = parseSegmentPart(lastPart);

  if (!parsed) return null;

  const typeInfo = SEGMENT_TYPE_MAP[parsed.prefix];
  return typeInfo?.type ?? null;
}
