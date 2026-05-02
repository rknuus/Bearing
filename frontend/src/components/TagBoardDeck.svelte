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

  import { onMount, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { TaskWithStatus } from '../lib/wails-mock';
  import { ALL_BOARD, UNTAGGED_BOARD } from '../lib/constants/tag-boards';
  import { effectiveFocusTags, orderUserTagsByFocus } from '../lib/utils/board-order';
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
    /**
     * Today's daily-focus tags (FR-10, US-7). Used to:
     *   - Surface the focus group at the front of the deck (alphabetical).
     *   - Drive the strip's focus-group visual marker.
     * Snapshotted once on view-mount per the #121 spec — live recomputation
     * on focus change arrives in #123. Passing a fresh array later is
     * intentionally ignored to avoid mid-session re-orderings here.
     */
    focusTags?: string[];
    /** Called when the user picks a different tag in the strip. */
    onSelectionChange?: (tag: string) => void;
    /** Foreground card content. Receives the per-board slice. */
    board: Snippet<[TaskWithStatus[]]>;
  }

  let { tasks, selectedTag, focusTags = [], onSelectionChange, board }: Props = $props();

  // Mounted snapshot of today's focus tags. Captured once on view-mount;
  // never re-read after that. #123 will replace this with a live binding.
  let mountedFocusTags = $state<string[]>([]);
  onMount(() => {
    untrack(() => {
      mountedFocusTags = [...focusTags];
    });
  });

  // Distinct user-tag set present in the tasks (AD-2). Order does not
  // matter at this stage — the FR-10 ordering helper sorts.
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
    return out;
  });

  // Focus tags actually present on the board (intersection with userTags),
  // sorted case-insensitively. Drives the strip marker and the canonical
  // ordering. A focus tag with no tasks is not a board, so it drops out.
  const focusGroup = $derived(effectiveFocusTags(userTags, mountedFocusTags));

  // FR-10 canonical user-tag ordering: focus group first (alpha), then
  // non-focus user tags (alpha). Synthetic Untagged / All are appended by
  // the strip at fixed penultimate / last positions.
  const orderedUserTags = $derived(orderUserTagsByFocus(userTags, mountedFocusTags));

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
    tags={orderedUserTags}
    selectedTag={effectiveTag}
    {hasUntagged}
    focusTags={focusGroup}
    onSelect={handleSelect}
  />

  <!--
    3D stack container (issue #122). The `perspective` / `preserve-3d`
    declarations in the stylesheet make `translateZ` produce real depth
    on the cards. Receded cards are absolutely-positioned siblings of
    the foreground card; their `--card-depth` drives the staggered
    transform (see TagBoardCard.svelte).

    Depth ordering: receded cards iterate the deck's canonical order
    (focus-group user tags first, then non-focus user tags, then
    Untagged, then All — see orderedUserTags / hasUntagged in the
    script block) and SKIP the currently-foregrounded tag. The closest
    receded card (depth 0) is the first non-foreground entry; each
    subsequent receded card steps back one depth slot. AD-5 holds:
    receded cards render chrome only, so DOM growth stays at
    ~1× foreground content + N × chrome regardless of N.

    EditTaskDialog is mounted at the EisenKanView level (outside this
    deck), so dialog state survives any board swap without needing
    content-mount gating here.
  -->
  <div class="tag-board-stack">
    {#each orderedUserTags as tag, i (tag)}
      {#if tag !== effectiveTag}
        {@const earlierForeground = orderedUserTags.slice(0, i).includes(effectiveTag)}
        <TagBoardCard mode="receded" label={tag} depth={earlierForeground ? i - 1 : i} />
      {/if}
    {/each}
    {#if hasUntagged && effectiveTag !== UNTAGGED_BOARD}
      {@const untaggedDepth = orderedUserTags.filter(t => t !== effectiveTag).length}
      <TagBoardCard mode="receded" label={UNTAGGED_BOARD} depth={untaggedDepth} />
    {/if}
    {#if effectiveTag !== ALL_BOARD}
      {@const allDepth = orderedUserTags.filter(t => t !== effectiveTag).length + (hasUntagged && effectiveTag !== UNTAGGED_BOARD ? 1 : 0)}
      <TagBoardCard mode="receded" label={ALL_BOARD} depth={allDepth} />
    {/if}

    <!-- Foreground card: only this card mounts full board content (AD-5). -->
    <TagBoardCard mode="foreground" label={effectiveTag}>
      {@render board(slice)}
    </TagBoardCard>
  </div>
</div>

<style>
  .tag-board-deck {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /* 3D stage. `perspective` makes `translateZ` produce real depth on
     descendants; `preserve-3d` lets nested transforms compose. The
     stack is a positioning context for the absolutely-positioned
     receded cards; the foreground card sits on top via z-index. */
  .tag-board-stack {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    perspective: 1200px;
    perspective-origin: 50% 30%;
    transform-style: preserve-3d;
  }
</style>
