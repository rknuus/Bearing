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

  /**
   * Visual top-to-bottom order in the vertical-accordion stack
   * (issue #120 redesign).
   *
   * The strip orders tags leftmost-first as `[focus alpha, non-focus
   * alpha, Untagged, All]`. The user's mental model places the
   * rightmost-strip tag at the TOP of the stack and the leftmost-strip
   * tag at the BOTTOM, with the selected board expanded inline at its
   * position in that reversed sequence. We reverse the strip order
   * here and render each entry in turn — selected as foreground,
   * everything else as a receded title bar.
   */
  const visualOrder = $derived.by(() => {
    const arr: string[] = [...orderedUserTags];
    if (hasUntagged) arr.push(UNTAGGED_BOARD);
    arr.push(ALL_BOARD);
    return arr.reverse();
  });

  // Index of the foreground card in the visual order — used to flag
  // whether a receded card sits above or below it (drives the
  // before-foreground / after-foreground position-flag classes).
  const foregroundIndex = $derived(visualOrder.indexOf(effectiveTag));

  /**
   * Horizontal fan stagger (issue #120). Symmetric fan centered on the
   * foreground: the foreground card sits at X=0, cards above it shift
   * left by 2px per index distance, cards below shift right by the same
   * step. So a typical 7-board deck with the foreground in the middle
   * spans ~±6px horizontally. Foreground participates in the fan
   * trivially (it's always at offset 0). Title bars stay in their
   * natural flex-flow Y positions — there is no Y stagger on the cards;
   * only the peek frames translate diagonally (see `peekData`).
   */
  const STACK_X_OFFSET_STEP_PX = 2;
  function stackXOffsetPx(index: number): number {
    return (index - foregroundIndex) * STACK_X_OFFSET_STEP_PX;
  }

  /**
   * Vertical translation step per depth (issue #120). All non-selected
   * boards render as stair-stepped peek frames behind the foreground.
   * Each peek is the SAME SIZE as the foreground (inset: 0) and is
   * SHIFTED diagonally as a unit via translate(): above-peeks move up-
   * left by (-N×2px, -N×5px), below-peeks move down-right by
   * (+N×2px, +N×5px). This ensures all four corners stair-step
   * diagonally — extending the frame on one edge would flatten the
   * opposing corner.
   */
  const PEEK_STEP_PX = 5;

  /**
   * Body peeks (issue #120). For every non-selected board, emit one
   * empty board-shaped frame behind the foreground CARD. Each peek is
   * the SAME SIZE as the foreground and translated diagonally by
   * `(signedDist * STACK_X_OFFSET_STEP_PX, signedDist * PEEK_STEP_PX)`
   * — above-foreground entries shift up-left, below-foreground entries
   * shift down-right. Depth = absolute distance from the foreground in
   * `visualOrder` — drives z-index and opacity so deeper peeks layer
   * further back and fade out gradually.
   */
  const peekData = $derived.by(() => {
    if (foregroundIndex < 0) {
      return [] as Array<{ depth: number; xOffset: number; yOffset: number }>;
    }
    const result: Array<{ depth: number; xOffset: number; yOffset: number }> = [];
    for (let i = 0; i < visualOrder.length; i++) {
      if (i === foregroundIndex) continue;
      const signedDist = i - foregroundIndex;
      const dist = Math.abs(signedDist);
      result.push({
        depth: dist,
        xOffset: signedDist * STACK_X_OFFSET_STEP_PX,
        yOffset: signedDist * PEEK_STEP_PX,
      });
    }
    return result;
  });

  /**
   * Dynamic vertical padding on the stack (issue #120). Body peek frames
   * are translated up by `N × PEEK_STEP_PX` (above) or down by the same
   * (below) for the deepest above- / below-foreground entry. Without
   * matching padding, those translations visually overlap the tag-
   * selector strip above (or any sibling below). Add per-side padding
   * equal to the worst-case translation so all peek frames stay inside
   * the stack.
   */
  const stackPaddingTopPx = $derived.by(() => {
    if (foregroundIndex < 0) return 0;
    const maxAboveDepth = foregroundIndex;
    return Math.max(0, maxAboveDepth * PEEK_STEP_PX);
  });

  const stackPaddingBottomPx = $derived.by(() => {
    if (foregroundIndex < 0) return 0;
    const maxBelowDepth = visualOrder.length - 1 - foregroundIndex;
    return Math.max(0, maxBelowDepth * PEEK_STEP_PX);
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
    Vertical-accordion stack (issue #120 redesign).

    The strip above is the canonical navigation surface; the stack
    expands the selected board inline. Every non-selected board is
    indicated only by a stair-stepped peek frame edge behind the
    foreground card — there are no title bars in the deck.

    Only the foreground card mounts the `board` snippet (AD-5
    invariant preserved through DOM rather than positional layering).

    EditTaskDialog is mounted at the EisenKanView level (outside this
    deck), so dialog state survives any board swap without needing
    content-mount gating here.
  -->
  <div
    class="tag-board-stack"
    style="--stack-padding-top: {stackPaddingTopPx}px; --stack-padding-bottom: {stackPaddingBottomPx}px;"
  >
    {#each visualOrder as tag, i (tag)}
      {#if tag === effectiveTag}
        <TagBoardCard
          mode="foreground"
          label={tag}
          focused={focusGroup.includes(tag)}
          style="--stack-x-offset: {stackXOffsetPx(i)}px;"
          {peekData}
        >
          {@render board(slice)}
        </TagBoardCard>
      {/if}
      <!--
        Non-selected boards (issue #120): no TagBoardCard rendered in
        the flex stack. The body peek frames behind the foreground
        already extend past it toward each non-selected board's title-
        bar position in the strip; their stair-stepped top / bottom
        edges visually convey the presence of every other board without
        consuming layout space.
      -->
    {/each}
  </div>
</div>

<style>
  .tag-board-deck {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /*
   * Vertical-accordion stack. Plain flex column — the foreground card
   * uses `flex: 1` to consume remaining space. The horizontal fan
   * stagger is a translateX on each card (driven by the
   * `--stack-x-offset` CSS variable projected by this component).
   * Title bars stay in their natural flex-flow Y positions; the body
   * peek frames are translated diagonally as a unit (see
   * `.board-body-peek` in TagBoardCard) so their L-shaped protrusions
   * stair-step on all four corners.
   *
   * The fan is symmetric around the foreground (cards above shift left,
   * below shift right). The horizontal padding here absorbs the worst-
   * case absolute offset so negative-X cards don't get clipped on the
   * left edge nor pushed past the deck on the right. Body peeks (issue
   * #120) translate past the foreground frame by up to N × 2px
   * horizontally — at N=10 that's 20px — so 20px comfortably covers
   * any realistic deck depth.
   */
  .tag-board-stack {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /*
     * Zero flex gap (issue #120). The deck only renders the foreground
     * card, so the gap value is academic — kept at 0 to make any future
     * additions (e.g. an optional toolbar above / below the foreground)
     * sit flush against the foreground frame by default.
     */
    gap: 0;
    /*
     * Horizontal padding (20 px each side) absorbs the symmetric fan's
     * worst-case X offset. Vertical padding is dynamic (issue #120):
     * matches the worst-case body-peek translation on each side so peek
     * frames at depth ≥ 2 do not overflow the stack into the tag-
     * selector strip above (nor a sibling element below). See
     * `stackPaddingTopPx` / `stackPaddingBottomPx` in the script.
     */
    padding: var(--stack-padding-top, 0) 20px var(--stack-padding-bottom, 0);
  }
</style>
