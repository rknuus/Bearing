<script lang="ts">
  /**
   * TagBoardDeck Component
   *
   * Top-level container for the EisenKan tag-stacked-boards UI. Owns the
   * deck-level selection state (currently-foregrounded tag) and projects
   * the per-board task slice from a single tasks source. Renders the
   * `TagBoardStrip` selector and one foreground `TagBoardCard` whose
   * content is supplied via the `board` snippet.
   *
   * Tasks are not duplicated per board; the foreground card reads from a
   * single tasks $state; deck switches re-derive the slice. Mirroring is
   * presentational only.
   *
   * Per AD-1, slicing is presentational, not business logic. Per AD-2, the
   * tag list is `unique(task.tags)` across the supplied tasks. Per AD-3,
   * `Untagged` and `All` are synthetic identifiers (never values inside
   * `task.tags`). Per AD-6, selection persists by tag NAME.
   *
   * Walking-skeleton scope (issue #120):
   *   - foreground card only — no receded cards yet (#122 layers 3D + animation)
   *   - alphabetical strip ordering — focus-grouping arrives in #121
   *   - default-board fallback is `All` — #123 introduces the focus-aware default
   */

  import type { Snippet } from 'svelte';
  import type { TaskWithStatus } from '../lib/wails-mock';
  import { ALL_BOARD, UNTAGGED_BOARD } from '../lib/constants/tag-boards';
  import TagBoardStrip from './TagBoardStrip.svelte';
  import TagBoardCard from './TagBoardCard.svelte';

  interface Props {
    /** The single source-of-truth task list. Filtering is presentational. */
    tasks: TaskWithStatus[];
    /**
     * Currently selected board. The parent owns the persistence cadence;
     * the deck reads this prop and emits `onSelectionChange` when the user
     * picks a different tag in the strip. `null` / empty string / a name
     * no longer present in `tasks` all collapse to the default (`All` for
     * #120 — focus-aware default arrives in #123).
     */
    selectedTag?: string | null;
    /** Called when the user picks a different tag in the strip. */
    onSelectionChange?: (tag: string) => void;
    /** Foreground card content. Receives the per-board slice. */
    board: Snippet<[TaskWithStatus[]]>;
  }

  let { tasks, selectedTag, onSelectionChange, board }: Props = $props();

  // Derived alphabetical user-tag list from the tasks (AD-2, FR-10 walking
  // skeleton). Focus-group ordering layers on top in #121.
  const userTags = $derived.by(() => {
    const seen: Record<string, true> = {};
    const out: string[] = [];
    for (const t of tasks) {
      if (!t.tags) continue;
      for (const tag of t.tags) {
        if (tag && !seen[tag]) {
          seen[tag] = true;
          out.push(tag);
        }
      }
    }
    out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return out;
  });

  const hasUntagged = $derived(tasks.some(t => !t.tags || t.tags.length === 0));

  // Resolve the effective selection. An unrecognised persisted name falls
  // back to `All` until #123 introduces the focus-aware default-board rule.
  const effectiveTag = $derived.by(() => {
    if (!selectedTag) return ALL_BOARD;
    if (selectedTag === ALL_BOARD || selectedTag === UNTAGGED_BOARD) return selectedTag;
    if (userTags.includes(selectedTag)) return selectedTag;
    return ALL_BOARD;
  });

  // Per-board slice. AD-1: pure presentational projection.
  const slice = $derived.by(() => {
    if (effectiveTag === ALL_BOARD) return tasks;
    if (effectiveTag === UNTAGGED_BOARD) return tasks.filter(t => !t.tags || t.tags.length === 0);
    return tasks.filter(t => t.tags?.includes(effectiveTag));
  });

  function handleSelect(tag: string) {
    if (effectiveTag === tag) return;
    onSelectionChange?.(tag);
  }
</script>

<div class="tag-board-deck">
  <TagBoardStrip
    tags={userTags}
    selectedTag={effectiveTag}
    {hasUntagged}
    onSelect={handleSelect}
  />

  <TagBoardCard mode="foreground" label={effectiveTag}>
    {@render board(slice)}
  </TagBoardCard>
</div>

<style>
  .tag-board-deck {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
</style>
