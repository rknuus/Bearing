<script lang="ts">
  /**
   * TagBoardCard Component
   *
   * One card in the EisenKan TagBoardDeck. Two render modes:
   *
   *   - `foreground` mounts full board content via the `children` snippet
   *     (the EisenKan kanban-board markup, supplied by EisenKanView).
   *   - `receded` renders only chrome (label, depth-staggered offset
   *     placeholder, shadow). NO columns, NO task content (AD-5 invariant).
   *
   * Issue #120 only exercises the `foreground` mode — receded cards arrive
   * with the 3D rendering work in #122. The prop signature is established
   * here so #122 can extend without changing the API.
   */

  import type { Snippet } from 'svelte';

  interface Props {
    mode: 'foreground' | 'receded';
    label: string;
    /** Depth offset index for receded cards (0 = closest behind foreground). Unused for foreground. */
    depth?: number;
    /** Foreground board content. NOT rendered when mode === 'receded'. */
    children?: Snippet;
  }

  let { mode, label, depth = 0, children }: Props = $props();

  // Reserved for #122: surface the depth as a CSS custom property so the
  // animation work can drive transforms purely from CSS.
  const cardStyle = $derived(`--card-depth: ${depth};`);
</script>

<div class="tag-board-card" class:foreground={mode === 'foreground'} class:receded={mode === 'receded'} style={cardStyle}>
  <div class="tag-board-card-header">
    <span class="tag-board-card-label">{label}</span>
  </div>
  {#if mode === 'foreground'}
    <div class="tag-board-card-content">
      {@render children?.()}
    </div>
  {:else}
    <!-- AD-5: receded cards render chrome only — no columns, no task content. -->
    <div class="tag-board-card-receded-shell" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .tag-board-card {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .tag-board-card-header {
    display: flex;
    align-items: center;
    padding: 0 0.25rem 0.5rem;
  }

  .tag-board-card-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tag-board-card-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .tag-board-card.receded .tag-board-card-receded-shell {
    flex: 1;
    border-radius: 8px;
    background: var(--color-gray-100);
    border: 1px solid var(--color-gray-200);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  }
</style>
