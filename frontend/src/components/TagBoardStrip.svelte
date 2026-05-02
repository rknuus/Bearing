<script lang="ts">
  /**
   * TagBoardStrip Component
   *
   * Single-select tag selector for the EisenKan TagBoardDeck. Renders the
   * provided user tags (already alphabetically ordered by the deck), then
   * the synthetic `Untagged` and `All` boards at fixed penultimate / last
   * positions. Emits `select(tag)` on click. Visual treatment is intentionally
   * minimal — focus-group marker (#121) and depth styling (#122) layer on top.
   */

  import { UNTAGGED_BOARD, ALL_BOARD } from '../lib/constants/tag-boards';

  interface Props {
    /** Alphabetical user tags (excluding the synthetic Untagged / All identifiers). */
    tags: string[];
    /** Currently selected board identifier. */
    selectedTag: string;
    /** Whether to show the `Untagged` button. Hidden when no untagged tasks exist. */
    hasUntagged?: boolean;
    onSelect: (tag: string) => void;
  }

  let { tags, selectedTag, hasUntagged = true, onSelect }: Props = $props();
</script>

<div class="tag-board-strip" role="radiogroup" aria-label="Tag boards">
  {#each tags as tag (tag)}
    <button
      type="button"
      role="radio"
      class="tag-board-strip-item"
      class:active={selectedTag === tag}
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
</style>
