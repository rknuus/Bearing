/**
 * Canonical FR-10 ordering for tag-board lists.
 *
 * Front-to-back order:
 *   1. Daily-focus tags — alphabetical (case-insensitive)
 *   2. Non-focus user tags — alphabetical (case-insensitive)
 *   3. `Untagged` (penultimate, surfaced via `hasUntagged` by callers)
 *   4. `All` (last, surfaced by callers)
 *
 * This module yields only the user-tag portion (groups 1 + 2). Synthetic
 * Untagged / All identifiers are appended by the strip per its existing
 * contract. Empty groups collapse without leaving gaps.
 *
 * Implementations of this helper are pure and presentational — slicing /
 * ordering carries no business logic (AD-1).
 */

/** Case-insensitive locale comparator used for both focus and non-focus groups. */
export function compareTagCaseInsensitive(a: string, b: string): number {
  return a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase());
}

/**
 * Returns the user-tag list ordered per FR-10 groups 1 and 2.
 *
 * @param userTags - distinct, non-synthetic tag names present in the deck.
 *                   Order on input is irrelevant; this function sorts.
 * @param focusTags - today's daily-focus tags. Tags here that do not appear
 *                    in `userTags` are dropped (a focus tag with no tasks is
 *                    not a board). Order on input is irrelevant; this
 *                    function sorts.
 * @returns ordered user-tag list: focus-group first (alpha), then non-focus
 *          (alpha). Synthetic Untagged / All are NOT included; the strip
 *          appends them at fixed penultimate / last positions.
 */
export function orderUserTagsByFocus(userTags: string[], focusTags: string[]): string[] {
  const userSet = new Set(userTags);
  const focusSet = new Set(focusTags.filter(t => userSet.has(t)));

  const focusGroup = userTags.filter(t => focusSet.has(t)).sort(compareTagCaseInsensitive);
  const nonFocusGroup = userTags.filter(t => !focusSet.has(t)).sort(compareTagCaseInsensitive);

  return [...focusGroup, ...nonFocusGroup];
}

/**
 * Returns the focus tags actually present on the board (i.e., the
 * intersection of supplied focus tags and rendered user tags), sorted
 * case-insensitively. Useful for the strip's marker rendering and for
 * test assertions on the canonical focus group.
 */
export function effectiveFocusTags(userTags: string[], focusTags: string[]): string[] {
  const userSet = new Set(userTags);
  return focusTags.filter(t => userSet.has(t)).sort(compareTagCaseInsensitive);
}
