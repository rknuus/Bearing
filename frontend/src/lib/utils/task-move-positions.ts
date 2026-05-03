/**
 * Task Move Position Helpers
 *
 * Pure helpers that compute the new ordered task-id list(s) needed to move a
 * task to the top or bottom of its current section/column in the
 * Eisenhower-Kanban view. The output is intended to feed `apiMoveTask` /
 * `apiReorderTasks` `positions` arguments — this module does not perform the
 * call itself.
 *
 * Two scopes are covered:
 *
 *   1. Same-zone moves — within a single ordered list (`moveToTopOfZone`,
 *      `moveToBottomOfZone`). Used for top/bottom-of-section in the Todo
 *      column and for top/bottom of the flat Doing/Done/Archived columns.
 *
 *   2. Cross-section moves — across the sections of the Todo column
 *      (`moveToTopOfColumn`, `moveToBottomOfColumn`). Returns a per-section
 *      `Record<string, string[]>` containing only the affected zones (source
 *      with the task removed, destination with the task at the appropriate
 *      end).
 *
 * Error-handling discipline
 * -------------------------
 * Cross-section helpers throw a typed `TaskMovePositionsError` when invariants
 * are violated (unknown `taskId`, unknown `currentSectionName`, or empty
 * sections list). The discipline is "throw a typed error" consistently across
 * the module — there is no tagged-union return shape. Callers that need to
 * tolerate failures should wrap the call in `try/catch` and inspect
 * `error.code`.
 *
 * No-change semantics
 * -------------------
 * Same-zone helpers are idempotent: moving a task already at the target end
 * returns a new array deep-equal to the input.
 *
 * Cross-section helpers return an **empty record** (`{}`) when the move is a
 * no-op (the task is already in the target section's target slot). This keeps
 * the caller's reorder payload minimal — no zones are touched when nothing
 * needs to change.
 */

/**
 * A section descriptor for the Todo column. The `orderedIds` array is treated
 * as readonly so callers can pass through Svelte $state proxies without copy.
 */
export interface ColumnSection {
  readonly name: string;
  readonly orderedIds: readonly string[];
}

/**
 * Discriminator for `TaskMovePositionsError` to allow callers to branch on
 * the failure mode without parsing message strings.
 */
export type TaskMovePositionsErrorCode =
  | 'TASK_NOT_FOUND'
  | 'SECTION_NOT_FOUND'
  | 'NO_SECTIONS';

/**
 * Typed error raised by the cross-section helpers when a precondition is
 * violated.
 */
export class TaskMovePositionsError extends Error {
  public readonly code: TaskMovePositionsErrorCode;

  constructor(code: TaskMovePositionsErrorCode, message: string) {
    super(message);
    this.name = 'TaskMovePositionsError';
    this.code = code;
    // Restore prototype chain when transpiled to ES5-ish targets.
    Object.setPrototypeOf(this, TaskMovePositionsError.prototype);
  }
}

/**
 * Returns a new array with `taskId` moved to the front of `orderedIds`.
 * If `taskId` is not in the list, the input is returned unchanged (as a copy)
 * — same-zone helpers are tolerant to allow chained calls without a guard.
 *
 * Idempotent: if `taskId` is already at index 0, the result is deep-equal to
 * the input.
 */
export function moveToTopOfZone(
  orderedIds: readonly string[],
  taskId: string,
): string[] {
  const index = orderedIds.indexOf(taskId);
  if (index <= 0) {
    return [...orderedIds];
  }
  const without = orderedIds.filter((id) => id !== taskId);
  return [taskId, ...without];
}

/**
 * Returns a new array with `taskId` moved to the end of `orderedIds`.
 * If `taskId` is not in the list, the input is returned unchanged (as a copy).
 *
 * Idempotent: if `taskId` is already at the last index, the result is
 * deep-equal to the input.
 */
export function moveToBottomOfZone(
  orderedIds: readonly string[],
  taskId: string,
): string[] {
  const index = orderedIds.indexOf(taskId);
  if (index === -1 || index === orderedIds.length - 1) {
    return [...orderedIds];
  }
  const without = orderedIds.filter((id) => id !== taskId);
  return [...without, taskId];
}

/**
 * Locates `taskId` across all `sections` and returns the section that
 * contains it. Returns `undefined` if not found.
 */
function findSectionContaining(
  sections: readonly ColumnSection[],
  taskId: string,
): ColumnSection | undefined {
  return sections.find((s) => s.orderedIds.includes(taskId));
}

/**
 * Builds the affected-zones record for a cross-section move.
 *
 * @param sections - The full list of sections in the column (top-most first).
 * @param taskId - The task being moved.
 * @param currentSectionName - The section the task currently lives in.
 *        Must match one of `sections[*].name`.
 * @param targetSectionName - The destination section name (must be in
 *        `sections`).
 * @param insertAt - 'start' to prepend in the destination, 'end' to append.
 *
 * @returns `{}` when no change is required (task already at the target slot
 *          of the target section); otherwise an object containing only the
 *          two affected zones (source and destination), or just the
 *          destination zone if source === destination.
 */
function buildCrossSectionPositions(
  sections: readonly ColumnSection[],
  taskId: string,
  currentSectionName: string,
  targetSectionName: string,
  insertAt: 'start' | 'end',
): Record<string, string[]> {
  if (sections.length === 0) {
    throw new TaskMovePositionsError(
      'NO_SECTIONS',
      'sections must contain at least one entry',
    );
  }

  const currentSection = sections.find((s) => s.name === currentSectionName);
  if (!currentSection) {
    throw new TaskMovePositionsError(
      'SECTION_NOT_FOUND',
      `currentSectionName "${currentSectionName}" is not in sections`,
    );
  }

  const targetSection = sections.find((s) => s.name === targetSectionName);
  if (!targetSection) {
    // Defensive: the caller picks the target from `sections`, but keep the
    // invariant explicit.
    throw new TaskMovePositionsError(
      'SECTION_NOT_FOUND',
      `targetSectionName "${targetSectionName}" is not in sections`,
    );
  }

  const owningSection = findSectionContaining(sections, taskId);
  if (!owningSection) {
    throw new TaskMovePositionsError(
      'TASK_NOT_FOUND',
      `taskId "${taskId}" was not found in any section`,
    );
  }

  // No-op detection: task already at the target slot of the target section.
  if (owningSection.name === targetSection.name) {
    const ids = targetSection.orderedIds;
    const atTarget =
      insertAt === 'start'
        ? ids[0] === taskId
        : ids[ids.length - 1] === taskId;
    if (atTarget) {
      return {};
    }

    // Same-section move (e.g. middle → top within the target section).
    const reordered =
      insertAt === 'start'
        ? moveToTopOfZone(ids, taskId)
        : moveToBottomOfZone(ids, taskId);
    return { [targetSection.name]: reordered };
  }

  // Cross-section move: remove from source, insert into destination.
  const sourceWithout = owningSection.orderedIds.filter((id) => id !== taskId);
  const destinationWith =
    insertAt === 'start'
      ? [taskId, ...targetSection.orderedIds]
      : [...targetSection.orderedIds, taskId];

  return {
    [owningSection.name]: sourceWithout,
    [targetSection.name]: destinationWith,
  };
}

/**
 * Computes the per-section position payload to move `taskId` to the top of
 * the entire column — i.e. the first slot of `sections[0]`.
 *
 * @throws {TaskMovePositionsError} when `sections` is empty, when
 * `currentSectionName` does not match any section, or when `taskId` is not
 * present in any section.
 */
export function moveToTopOfColumn(
  sections: readonly ColumnSection[],
  taskId: string,
  currentSectionName: string,
): Record<string, string[]> {
  if (sections.length === 0) {
    throw new TaskMovePositionsError(
      'NO_SECTIONS',
      'sections must contain at least one entry',
    );
  }
  return buildCrossSectionPositions(
    sections,
    taskId,
    currentSectionName,
    sections[0].name,
    'start',
  );
}

/**
 * Computes the per-section position payload to move `taskId` to the bottom of
 * the entire column — i.e. the last slot of `sections[sections.length - 1]`.
 *
 * @throws {TaskMovePositionsError} when `sections` is empty, when
 * `currentSectionName` does not match any section, or when `taskId` is not
 * present in any section.
 */
export function moveToBottomOfColumn(
  sections: readonly ColumnSection[],
  taskId: string,
  currentSectionName: string,
): Record<string, string[]> {
  if (sections.length === 0) {
    throw new TaskMovePositionsError(
      'NO_SECTIONS',
      'sections must contain at least one entry',
    );
  }
  return buildCrossSectionPositions(
    sections,
    taskId,
    currentSectionName,
    sections[sections.length - 1].name,
    'end',
  );
}
