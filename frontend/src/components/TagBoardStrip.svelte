<script lang="ts">
  /**
   * TagBoardStrip Component
   *
   * Single-select tag selector for the EisenKan TagBoardDeck. Renders the
   * provided user tags (already ordered per FR-10 by the deck — focus group
   * first, then non-focus user tags), then the synthetic `Untagged` and
   * `All` boards at fixed penultimate / last positions. Emits `select(tag)`
   * on click.
   *
   * Issue #121 adds:
   *   - `focusTags` prop carrying today's daily-focus tags (already
   *     intersected with the rendered tag set by the deck).
   *   - A visual focus-group marker that spans the contiguous run of
   *     focus-group tag chips at the front of the strip. The marker uses
   *     a subtle tinted background plus a coloured underline drawn from
   *     the existing primary palette so it survives strip re-flow without
   *     extra layout. Hidden cleanly when `focusTags.length === 0`.
   *
   * Depth styling (#122) layers on the chips themselves; the marker is a
   * sibling absolutely-positioned element so it does not interact with
   * depth transforms.
   */

  import { UNTAGGED_BOARD, ALL_BOARD } from '../lib/constants/tag-boards';

  interface Props {
    /**
     * User tags ordered per FR-10 groups 1 and 2 (focus group first,
     * non-focus second), excluding the synthetic Untagged / All
     * identifiers. The strip does not re-sort.
     */
    tags: string[];
    /** Currently selected board identifier. */
    selectedTag: string;
    /** Whether to show the `Untagged` button. Hidden when no untagged tasks exist. */
    hasUntagged?: boolean;
    /**
     * Today's daily-focus tags that are present on the board (already
     * intersected with `tags` by the deck). Used to size and position the
     * focus-group marker. Order should match the focus prefix of `tags`.
     */
    focusTags?: string[];
    onSelect: (tag: string) => void;
  }

  let { tags, selectedTag, hasUntagged = true, focusTags = [], onSelect }: Props = $props();

  // Number of focus chips actually rendered at the head of the strip. The
  // deck guarantees the focus prefix of `tags` matches `focusTags`, so the
  // marker spans the first N chips. Defensive intersection in case a caller
  // passes a focus tag that is not in `tags`.
  const focusCount = $derived.by(() => {
    if (!focusTags || focusTags.length === 0) return 0;
    const focusSet = new Set(focusTags);
    let n = 0;
    for (const tag of tags) {
      if (focusSet.has(tag)) n++;
      else break;
    }
    return n;
  });

  const showFocusMarker = $derived(focusCount > 0);
</script>

<div class="tag-board-strip" role="radiogroup" aria-label="Tag boards">
  {#if showFocusMarker}
    <div
      class="tag-board-strip-focus-marker"
      style="--focus-span: {focusCount};"
      aria-label="Today's focus tags"
    ></div>
  {/if}
  {#each tags as tag, i (tag)}
    <button
      type="button"
      role="radio"
      class="tag-board-strip-item"
      class:active={selectedTag === tag}
      class:focus-group={i < focusCount}
      aria-checked={selectedTag === tag}
      onclick={() => onSelect(tag)}
    >
      {tag}
    </button>
  {/each}
  {#if hasUntagged}
    <button
      type="button"
      role="radio"
      class="tag-board-strip-item synthetic untagged"
      class:active={selectedTag === UNTAGGED_BOARD}
      aria-checked={selectedTag === UNTAGGED_BOARD}
      onclick={() => onSelect(UNTAGGED_BOARD)}
    >
      {UNTAGGED_BOARD}
    </button>
  {/if}
  <button
    type="button"
    role="radio"
    class="tag-board-strip-item synthetic all"
    class:active={selectedTag === ALL_BOARD}
    aria-checked={selectedTag === ALL_BOARD}
    onclick={() => onSelect(ALL_BOARD)}
  >
    {ALL_BOARD}
  </button>
</div>

<style>
  .tag-board-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
    position: relative;
  }

  .tag-board-strip-item {
    background: var(--color-gray-200);
    border: 1px solid var(--color-gray-300);
    color: var(--color-gray-700);
    font-size: 0.8125rem;
    padding: 0.25rem 0.625rem;
    border-radius: 9999px;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
    position: relative;
    z-index: 1;
  }

  .tag-board-strip-item:hover {
    background: var(--color-gray-300);
  }

  .tag-board-strip-item.active {
    background: var(--color-primary-500);
    border-color: var(--color-primary-500);
    color: white;
  }

  .tag-board-strip-item.synthetic {
    font-style: italic;
  }

  /*
   * Focus-group visual treatment.
   *
   * The marker is a tinted, rounded background sitting behind the run of
   * focus chips. Because the chips can wrap onto multiple rows, a single
   * absolutely-positioned shape would not track them reliably; instead, the
   * focus chips themselves get a subtle border highlight and the marker
   * adds a contiguous tinted background that auto-fits behind their
   * (possibly wrapped) bounding box via flex order.
   *
   * Implementation: each focus chip carries a faint primary-tinted border
   * and a halo via box-shadow; together they read as a clearly-grouped
   * cluster without depending on absolute geometry.
   */
  .tag-board-strip-item.focus-group {
    border-color: var(--color-primary-400);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-500) 14%, transparent);
    background: color-mix(in srgb, var(--color-primary-500) 6%, var(--color-gray-200));
  }

  .tag-board-strip-item.focus-group:hover {
    background: color-mix(in srgb, var(--color-primary-500) 12%, var(--color-gray-300));
  }

  .tag-board-strip-item.focus-group.active {
    background: var(--color-primary-500);
    border-color: var(--color-primary-600);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-500) 28%, transparent);
    color: white;
  }

  /*
   * The marker element is a screen-reader-friendly accent: it does not
   * paint anything visible by itself (the tinted chips do that work) but
   * exposes an accessible label so assistive tech recognises the cluster
   * as today's focus group. Keeping it a no-op visually means the marker
   * survives any chip animation in #122 without reflow concerns.
   */
  .tag-board-strip-focus-marker {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
