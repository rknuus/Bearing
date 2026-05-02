/**
 * Reserved synthetic identifiers for the EisenKan TagBoardDeck. These are
 * presentation-only identifiers — they never appear as values inside
 * `task.tags`. The reserved-name guard in TagEditor.svelte and the manager
 * validator (issue #118) prevents users from creating tags with these names.
 */
export const UNTAGGED_BOARD = 'Untagged';
export const ALL_BOARD = 'All';

/** Returns true if `tag` is one of the synthetic board identifiers. */
export function isSyntheticBoard(tag: string): boolean {
  return tag === UNTAGGED_BOARD || tag === ALL_BOARD;
}
