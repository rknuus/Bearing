<script lang="ts">
  /**
   * TagBoardCard Component
   *
   * One card in the EisenKan TagBoardDeck. Two render modes:
   *
   *   - `foreground` mounts full board content via the `children` snippet
   *     (the EisenKan kanban-board markup, supplied by EisenKanView).
   *   - `receded` renders only chrome (label, depth-staggered offset,
   *     subtle shadow). NO columns, NO task content (AD-5 invariant).
   *
   * Visual / 3D behaviour (issue #122):
   *   - The card's transform is driven entirely from CSS via the
   *     `--card-depth` custom property and the `foreground` / `receded`
   *     class. Transitions on `transform` and `opacity` provide the
   *     card-flip / depth-shift animation when the deck swaps boards.
   *   - `prefers-reduced-motion: reduce` disables the flip and falls back
   *     to an instant swap (CSS media query — no JS toggle).
   *   - Receded cards are non-interactive: `pointer-events: none`,
   *     `tabindex="-1"`, `aria-hidden="true"`. The strip is the only
   *     navigation surface.
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

  // Surface depth as a CSS custom property so the 3D transform is purely
  // CSS-driven (no JS-per-frame work). The transform interpolates via the
  // CSS `transition` declaration when depth or mode changes.
  const cardStyle = $derived(`--card-depth: ${depth};`);
</script>

<!--
  Receded cards: `aria-hidden="true"` removes them from the
  accessibility tree; `pointer-events: none` (via the `.receded`
  class) prevents pointer interaction. A bare <div> is not in the
  natural tab order, so no explicit tabindex is needed — the strip
  is the only navigation surface.
-->
<div
  class="tag-board-card"
  class:foreground={mode === 'foreground'}
  class:receded={mode === 'receded'}
  style={cardStyle}
  aria-hidden={mode === 'receded' ? 'true' : undefined}
>
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
    /* Each card lives in the deck's perspective container; preserve-3d
       lets nested transforms compose correctly (header + shell). */
    transform-style: preserve-3d;
    backface-visibility: hidden;
    /* Animation budget targets 60 fps in WebView on M-series Macs. The
       ease-out curve front-loads motion (incoming card "lands" quickly). */
    transition:
      transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 200ms ease-out,
      box-shadow 200ms ease-out;
    /* Hint to the compositor: only transform/opacity change. */
    will-change: transform, opacity;
  }

  /* Foreground sits at the front of the perspective stack and is the only
     interactive card. */
  .tag-board-card.foreground {
    position: relative;
    z-index: 10;
    transform: translateZ(0) translateY(0) scale(1) rotateY(0deg);
    opacity: 1;
  }

  /* Receded cards stack behind the foreground. Each successive depth
     index pushes further back, slightly down, and slightly smaller. The
     stagger remains visible through ~6 cards before opacity dominates. */
  .tag-board-card.receded {
    position: absolute;
    inset: 0;
    pointer-events: none;
    user-select: none;
    /* Depth-driven transform: each step pushes ~32px back, 6px down,
       and shrinks by 2.5%. rotateY adds a faint tilt for the 3D feel
       without obscuring the labels. */
    transform:
      translateZ(calc(var(--card-depth) * -32px))
      translateY(calc(var(--card-depth) * 6px))
      scale(calc(1 - (var(--card-depth) * 0.025)))
      rotateY(-2deg);
    opacity: calc(max(0, 0.85 - (var(--card-depth) * 0.18)));
    z-index: calc(9 - var(--card-depth));
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

  /* Stronger shadow on the foreground gives the receded cards a
     reference plane to sit "behind". */
  .tag-board-card.foreground {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
    border-radius: 8px;
  }

  /* Accessibility: honour the user's motion preference. Disable the
     flip / depth-shift transition; transforms still produce the
     stacked depth, but board swaps are instant. */
  @media (prefers-reduced-motion: reduce) {
    .tag-board-card {
      transition: none;
      will-change: auto;
    }
  }
</style>
