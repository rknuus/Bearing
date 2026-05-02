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
   * Live-update model (AD-4 / issue #123):
   *   - View-mount re-read: every time the deck mounts (i.e., every time
   *     EisenKan becomes the active view), today's focus is snapshotted
   *     fresh from the `focusTags` prop.
   *   - Midnight rollover: a local-clock midnight timer recomputes the
   *     deck. When the user has no manual selection on the new day, the
   *     default-board rule re-applies; otherwise the persisted selection
   *     persists.
   *   - No new event bus. Cross-view focus changes propagate via
   *     view-mount only.
   */

  import { onMount, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { TaskWithStatus } from '../lib/wails-mock';
  import { ALL_BOARD, UNTAGGED_BOARD } from '../lib/constants/tag-boards';
  import {
    defaultBoard,
    effectiveFocusTags,
    effectiveSelection,
    orderUserTagsByFocus,
  } from '../lib/utils/board-order';
  import { getNow } from '../lib/utils/clock';
  import TagBoardStrip from './TagBoardStrip.svelte';
  import TagBoardCard from './TagBoardCard.svelte';

  interface Props {
    /** The single source-of-truth task list. Filtering is presentational. */
    tasks: TaskWithStatus[];
    /**
     * Currently selected board. The parent owns the persistence cadence;
     * the deck reads this prop and emits `onSelectionChange` when the user
     * picks a different tag in the strip. `null` / empty string / a name
     * no longer present in `tasks` collapse to the focus-aware default
     * board (US-1, #123): the alphabetically-first focus tag with a
     * matching board, or the synthetic `All` board when no focus tag has
     * a board. The resolved default is propagated upward via
     * `onSelectionChange` so the navigation context persists it.
     */
    selectedTag?: string | null;
    /**
     * Today's daily-focus tags (FR-10, US-7). Used to:
     *   - Surface the focus group at the front of the deck (alphabetical).
     *   - Drive the strip's focus-group visual marker.
     *   - Resolve the default-board rule on view-mount.
     * Snapshotted on view-mount and on local-clock midnight rollover
     * (AD-4, #123). Mid-mount prop changes are intentionally ignored —
     * cross-view focus changes propagate via view re-entry only.
     */
    focusTags?: string[];
    /** Called when the user picks a different tag in the strip. */
    onSelectionChange?: (tag: string) => void;
    /** Foreground card content. Receives the per-board slice. */
    board: Snippet<[TaskWithStatus[]]>;
  }

  let { tasks, selectedTag, focusTags = [], onSelectionChange, board }: Props = $props();

  // Mounted snapshot of today's focus tags. Captured on every view-mount
  // (every time EisenKan becomes the active view, since EisenKanView is
  // conditionally rendered) and re-captured on midnight rollover (AD-4).
  // Never re-read on prop change inside a single mount — that would defeat
  // AD-4's "view-mount only" propagation rule.
  let mountedFocusTags = $state<string[]>([]);

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

  // Resolve the effective selection (US-1 default-board rule). Persisted
  // selection wins whenever it is recognised; otherwise the focus-aware
  // default applies.
  const effectiveTag = $derived(
    effectiveSelection(selectedTag, mountedFocusTags, userTags, [ALL_BOARD, UNTAGGED_BOARD]),
  );

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

  /**
   * Returns the persisted selection if it is a recognised user tag or
   * synthetic identifier on the current deck; otherwise `null`. Used to
   * decide whether the default-board rule needs to be re-applied (and
   * propagated upward via `onSelectionChange` so the navigation context
   * persists the resolved choice).
   */
  function recognisedSelection(persisted: string | null | undefined, tags: readonly string[]): string | null {
    if (!persisted) return null;
    if (persisted === ALL_BOARD || persisted === UNTAGGED_BOARD) return persisted;
    if (tags.includes(persisted)) return persisted;
    return null;
  }

  // Snapshot today's focus on mount (every mount, not just first launch —
  // AD-4 view-mount re-read) and emit the resolved default selection if
  // the persisted value is empty / unrecognised. The emission persists the
  // resolved choice via the parent's `onSelectionChange` cadence, so a
  // subsequent view-switch sees a recognised selection.
  onMount(() => {
    untrack(() => {
      mountedFocusTags = [...focusTags];
      const recognised = recognisedSelection(selectedTag, userTags);
      if (recognised === null) {
        const resolved = defaultBoard(mountedFocusTags, userTags, ALL_BOARD);
        if (resolved !== selectedTag) onSelectionChange?.(resolved);
      }
    });
  });

  /** ms until next local-clock midnight at the time of call. */
  function msUntilNextMidnight(): number {
    const now = getNow();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(0, tomorrow.getTime() - now.getTime());
  }

  // Midnight rollover (FR-11). Re-evaluate today's focus and the
  // default-board rule when the local-clock day changes. The deck owns
  // its own timer (independent of the App-level day-change handler) so
  // the snapshot it presents stays in lock-step with "today" without
  // relying on prop reactivity inside a single mount.
  $effect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(() => {
        untrack(() => {
          // New day: refresh the focus snapshot from the latest prop
          // value (the parent's day-change handler updates it in the
          // same tick), then re-apply the default-board rule whenever
          // the persisted selection is empty / unrecognised. A
          // recognised persisted selection wins — US-8 acceptance:
          // "selection persists on that tag" even when focus shifts.
          mountedFocusTags = [...focusTags];

          const recognised = recognisedSelection(selectedTag, userTags);
          if (recognised === null) {
            const resolved = defaultBoard(mountedFocusTags, userTags, ALL_BOARD);
            if (resolved !== selectedTag) onSelectionChange?.(resolved);
          }
        });
        schedule();
      }, msUntilNextMidnight());
    };

    schedule();

    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  });
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
