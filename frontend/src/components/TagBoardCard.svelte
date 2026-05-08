<script lang="ts">
  /**
   * TagBoardCard Component
   *
   * Renders the foreground tag board inside the EisenKan TagBoardDeck.
   * The strip above (`TagBoardStrip`) is the canonical navigation
   * surface; this card simply hosts the title bar plus the children
   * snippet that paints the kanban board content for the selected
   * tag.
   *
   * Focus marker (FR-10 / US-7):
   *   When `focused` is true the title bar adopts the same primary-
   *   coloured-bordered treatment used by the strip's
   *   `.focus-group-frame`, so a focus board reads consistently
   *   throughout the UI.
   */

  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** Apply the focus-group visual treatment to the title bar. */
    focused?: boolean;
    /** Foreground board content. */
    children?: Snippet;
  }

  let { label, focused = false, children }: Props = $props();
</script>

<div class="tag-board-card foreground">
  <div
    class="tag-board-card-title-bar"
    class:focused
    aria-current="true"
  >
    <span class="tag-board-card-label">{label}</span>
  </div>
  <div class="tag-board-card-content">
    <div class="foreground-body">
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  /* Foreground expands to fill the remaining vertical space in the
     deck. The visible frame around the foreground reads as a clearly-
     bounded container.
     No internal padding: the title bar's outer rectangle sits flush
     against the frame on all four sides at the top. The kanban content
     below carries its own padding (see `.tag-board-card-content`). */
  .tag-board-card.foreground {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    border: 1.5px solid var(--color-gray-400);
    border-radius: 8px;
    background: var(--color-gray-100);
  }

  /* Title bar visual chrome. Tag names render with their original
     casing — no transform, no letter-spacing — so the deck mirrors
     the strip. */
  .tag-board-card-title-bar {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--color-gray-300);
    background: var(--color-gray-200);
    color: var(--color-gray-700);
    font-size: 0.8125rem;
    font-weight: 600;
    text-align: left;
    width: 100%;
    /* Pinned title bar height (issue #120): constant 36px so the
       bar reads the same regardless of font-size / padding / border
       variation in any caller theme. */
    height: 36px;
    box-sizing: border-box;
  }

  /*
   * Focus marker — mirrors the strip's `.focus-group-frame` (#121, US-7).
   * A 1.5px primary-coloured border plus a tinted background so the
   * focus signature is consistent between strip and deck.
   */
  .tag-board-card-title-bar.focused {
    border: 1.5px solid var(--color-primary-500);
    background: color-mix(in srgb, var(--color-primary-500) 4%, var(--color-gray-200));
  }

  /* When the foreground board is in today's focus the frame around the
     active card adopts the primary-coloured treatment as well, keeping
     the focus signature consistent with the inner title bar. */
  .tag-board-card.foreground:has(.tag-board-card-title-bar.focused) {
    border-color: var(--color-primary-500);
  }

  .tag-board-card-label {
    display: inline-block;
  }

  /*
   * Foreground content area. Hosts the live `.foreground-body` (the
   * children-bearing wrapper) and supplies the kanban breathing room.
   */
  .tag-board-card-content {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 0.5rem;
  }

  /*
   * The actual foreground body content. Inherits the flex-column
   * layout that the `.tag-board-card-content` previously hosted
   * directly so the kanban board (the children snippet) continues to
   * fill the available space.
   */
  .foreground-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
