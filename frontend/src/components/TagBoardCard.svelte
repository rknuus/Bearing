<script lang="ts">
  /**
   * TagBoardCard Component
   *
   * One row in the EisenKan TagBoardDeck's vertical-accordion stack
   * (issue #120 redesign — replaces the earlier absolute-positioned 3D
   * stack which was visually invisible behind the foreground card).
   *
   * Three render variants:
   *
   *   - `foreground` renders a title bar PLUS the full board content
   *     supplied via the `children` snippet. Sits in flex flow with
   *     `flex: 1` so it expands to consume the available vertical
   *     space in the stack. The foreground bears a visible frame so the
   *     active board reads as a clearly-bounded container.
   *   - `receded` at depth 1 renders ONLY a clickable title bar.
   *     Intrinsic height, no expansion. Acts as a navigation surface —
   *     clicking it fires the `onclick` callback so the deck can swap
   *     selection.
   *   - `receded` at depth ≥ 2 renders a thin (~5px) sliver — no label,
   *     no interaction. Conveys "more boards stacked here" without
   *     consuming N × full-title-bar vertical space.
   *
   * Focus marker (FR-10 / US-7):
   *   When `focused` is true on a depth-1 receded title bar or on the
   *   foreground, the title bar adopts the same primary-coloured-bordered
   *   treatment used by the strip's `.focus-group-frame` so focus boards
   *   are recognisable at a glance throughout the stack. Compact slivers
   *   ignore `focused` visually — there is no border to colour at 5px tall.
   *
   * Position flag classes (issue #120):
   *   The deck applies `before-foreground` / `after-foreground` flag
   *   classes to receded cards. They convey position semantics in the
   *   DOM and are kept available for any future positional styling, but
   *   no longer drive a 3D rotateX tilt — the deck wants vertical left/
   *   right edges on every title bar (no perspective slant).
   *
   * Horizontal fan stagger (issue #120):
   *   The deck assigns each card a `--stack-x-offset` CSS custom property
   *   via the `style` prop so all cards (foreground + every receded
   *   variant, including compact slivers) translate horizontally based
   *   on their position in `visualOrder`. Title bars stay in their
   *   natural flex-flow Y positions; the body peek frames are the same
   *   size as the foreground and are translated diagonally as a unit so
   *   their L-shaped protrusions stair-step on all four corners. The
   *   foreground sits at X=0 (it is the fan centre); above-foreground
   *   cards shift left, below-foreground cards shift right.
   */

  import type { Snippet } from 'svelte';

  interface Props {
    mode: 'foreground' | 'receded';
    label: string;
    /** Apply the focus-group visual treatment to the title bar. */
    focused?: boolean;
    /** Position flag relative to the foreground card — receded only. */
    position?: 'before' | 'after';
    /**
     * Distance from the foreground in `visualOrder` (receded only).
     * Depth 1 = adjacent to the foreground → render as a full title bar.
     * Depth ≥ 2 = render as a compact non-interactive sliver.
     * Defaults to 1 (the only depth that ever renders a full title bar).
     */
    depth?: number;
    /** Required for receded depth-1 mode — invoked on title-bar click. */
    onclick?: () => void;
    /**
     * Optional inline style applied verbatim to the card root. The deck
     * uses this to project the per-card `--stack-x-offset` CSS custom
     * property that drives the horizontal fan stagger; any caller can
     * pass arbitrary CSS strings here.
     */
    style?: string;
    /**
     * Body peeks (issue #120). Foreground-only — empty board-shaped frames
     * layered behind the foreground card, one per non-selected board.
     * Each peek is the SAME SIZE as the foreground (inset: 0) and is
     * translated diagonally as a unit so all four corners stair-step
     * diagonally: above-peeks shift up-left by (negative xOffset,
     * negative yOffset), below-peeks shift down-right by (positive
     * xOffset, positive yOffset). Each entry carries a `depth` (1 =
     * nearest neighbour, larger = further back) plus signed `xOffset`
     * and `yOffset` in pixels mirroring the deck's
     * `(i - foregroundIndex) * step` formula on both axes. Receded
     * modes ignore this prop.
     */
    peekData?: Array<{ depth: number; xOffset: number; yOffset: number }>;
    /** Foreground board content. NOT rendered when mode === 'receded'. */
    children?: Snippet;
  }

  let {
    mode,
    label,
    focused = false,
    position,
    depth = 1,
    onclick,
    style,
    peekData = [],
    children,
  }: Props = $props();

  const compact = $derived(mode === 'receded' && depth > 1);
</script>

<div
  class="tag-board-card"
  class:foreground={mode === 'foreground'}
  class:receded={mode === 'receded'}
  class:compact
  class:before-foreground={mode === 'receded' && position === 'before'}
  class:after-foreground={mode === 'receded' && position === 'after'}
  aria-hidden={compact ? 'true' : undefined}
  style={style}
>
  {#if mode === 'foreground'}
    <!--
      Body peeks (issue #120). Empty board-shaped frames layered BEHIND
      the foreground card (siblings of the title bar so each peek spans
      both the title-bar height AND the body — its left/right edge then
      reads as one continuous line with the adjacent receded title bar).
      Frames are non-interactive, faded with depth, and aria-hidden —
      purely a visual cue. Rendered before the title bar / content so
      paint order plus z-index keeps them behind the live foreground.
    -->
    {#each peekData as peek (peek.depth + ':' + peek.xOffset)}
      <div
        class="board-body-peek"
        class:shift-positive={peek.xOffset > 0}
        class:shift-negative={peek.xOffset < 0}
        style="--peek-x-offset: {peek.xOffset}px; --peek-y-offset: {peek.yOffset}px; --peek-abs-x-offset: {Math.abs(peek.xOffset)}px; --peek-abs-y-offset: {Math.abs(peek.yOffset)}px; --peek-depth: {peek.depth};"
        aria-hidden="true"
      ></div>
    {/each}
    <div
      class="tag-board-card-title-bar foreground"
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
  {:else if !compact}
    <button
      type="button"
      class="tag-board-card-title-bar receded"
      class:focused
      role="radio"
      aria-checked="false"
      onclick={() => onclick?.()}
    >
      <span class="tag-board-card-label">{label}</span>
    </button>
  {/if}
</div>

<style>
  .tag-board-card {
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* Horizontal fan stagger (issue #120). The deck projects a
       `--stack-x-offset` CSS custom property per card; cards translate
       horizontally based on their position relative to the foreground.
       Default 0 keeps the layout flat for any caller that does not
       project the variable. Title bars stay in their natural flex-flow
       Y positions; the body peek frames are translated diagonally as a
       unit (see `.board-body-peek`) so their L-shaped protrusions
       stair-step on all four corners. */
    transform: translateX(var(--stack-x-offset, 0));
  }

  /* Foreground expands to fill the remaining vertical space in the
     accordion. Receded rows take their intrinsic height (the title bar
     plus its padding). The foreground also bears a visible frame so the
     active board reads as a clearly-bounded container — the frame
     dominates the gray-bar treatment shared with receded rows.
     No internal padding: the title bar's outer rectangle sits flush
     against the frame on all four sides at the top. The kanban content
     below carries its own padding (see `.tag-board-card-content`). */
  .tag-board-card.foreground {
    flex: 1;
    border: 1.5px solid var(--color-gray-400);
    border-radius: 8px;
    background: var(--color-gray-100);
    /* Positioning anchor for body peeks (issue #120). The peeks are
       absolute siblings of the title bar inside this card so they span
       the full card rectangle — title bar AND body — making each
       receded board's title bar (in the vertical stack) read as one
       unit with its peek frame behind the foreground. */
    position: relative;
  }

  /* Title bars share their visual chrome between foreground and receded
     so the stack reads as a single continuous list. The receded variant
     adds button affordances (cursor + hover); the foreground variant is
     a static container. Tag names render with their original casing —
     no transform, no letter-spacing — so the deck mirrors the strip. */
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
    /*
     * Pinned title bar height (issue #120). Constant 36px so the
     * foreground bar reads the same regardless of font-size / padding /
     * border variation in any caller theme.
     */
    height: 36px;
    box-sizing: border-box;
  }

  /* Foreground title bar paints above the peek frames (which sit behind
     the live card via lower z-index). Peeks have `z-index: calc(50 -
     depth)` so any value ≥ 50 wins; 100 keeps headroom. */
  .tag-board-card-title-bar.foreground {
    position: relative;
    z-index: 100;
  }

  .tag-board-card-title-bar.receded {
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
  }

  .tag-board-card-title-bar.receded:hover {
    background: var(--color-gray-300);
  }

  /* The foreground title bar sits flush against the frame: no outer
     margin needed. Vertical separation from the kanban content is
     supplied by the content padding below. */

  /*
   * Focus marker — mirrors the strip's `.focus-group-frame` (#121, US-7).
   * A 1.5px primary-coloured border plus a tinted background. No caption
   * inside individual title bars (would be noise); the colored border is
   * the same visual signature as the strip frame, so the user learns it
   * once and recognises it in the stack as well.
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
   * NO `overflow: hidden` here — peeks (siblings of the title bar at
   * the foreground-card level) intentionally extend beyond the left/
   * right edges so their vertical strips show through.
   */
  .tag-board-card-content {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 0.5rem;
    z-index: 100;
  }

  /*
   * Body peek (issue #120). One absolutely-positioned empty frame per
   * non-selected board, behind the live foreground card. The peek is
   * the SAME SIZE as the foreground (inset: 0) and is translated
   * diagonally as a unit via `--peek-x-offset` / `--peek-y-offset` so
   * all four corners stair-step. Above-peeks translate up-left by
   * (-N×2px, -N×5px); below-peeks translate down-right by
   * (+N×2px, +N×5px). The visible portion of each peek is the L-shape
   * that protrudes past the foreground on its facing side; the rest is
   * occluded by the foreground. Faded with depth — depth 1 ≈ 0.85,
   * each step subtracts 0.15, clamped at 0.30 so deep peeks stay
   * visible. Z-index decreases with depth so depth-1 peeks sit closest
   * to the foreground card and deeper peeks layer further behind.
   *
   * Issue #126: occlusion by the foreground's z-index alone is not
   * enough — the foreground's `border-radius: 8px` carves a recession
   * out of each corner, and a translated peek's straight edge or its
   * own rounded corner shows through that recession as a small "ear"
   * just inside-and-below the foreground's bottom-left corner (for a
   * down-right peek) or inside-and-above the foreground's top-right
   * corner (for an up-left peek). Hard-clip every peek to the L-shape
   * that lies STRICTLY outside the foreground rectangle. The peek's
   * translation `(xOffset, yOffset)` defines the foreground rectangle
   * in peek-relative coordinates as `(-xOffset, -yOffset, W, H)`; the
   * visible L equals the peek box minus that overlap. For a positive
   * shift (down-right) the overlap sits at the peek's top-left, so
   * the L wraps the bottom + right edges; for a negative shift
   * (up-left) the overlap sits at the peek's bottom-right, so the L
   * wraps the top + left edges. `--peek-abs-x-offset` and
   * `--peek-abs-y-offset` carry the unsigned magnitudes for use in
   * the polygon vertices below.
   */
  .board-body-peek {
    position: absolute;
    inset: 0;
    pointer-events: none;
    user-select: none;
    background: var(--color-gray-100);
    border: 1px solid var(--color-gray-400);
    border-radius: 8px;
    transform: translateX(var(--peek-x-offset, 0)) translateY(var(--peek-y-offset, 0));
    z-index: calc(50 - var(--peek-depth, 0));
    opacity: max(0.30, calc(1 - var(--peek-depth, 0) * 0.15));
  }

  /*
   * Down-right peek (positive shift). Foreground overlaps the peek's
   * top-left rectangle `[0..W-xOffset, 0..H-yOffset]`. Visible L =
   * right strip ∪ bottom strip. Polygon vertices, clockwise from the
   * top of the right strip:
   *   (W-x, 0) → (W, 0) → (W, H) → (0, H) → (0, H-y) → (W-x, H-y) → close.
   * Where W = 100% of the peek box, x = `--peek-abs-x-offset`,
   * y = `--peek-abs-y-offset`.
   */
  .board-body-peek.shift-positive {
    clip-path: polygon(
      calc(100% - var(--peek-abs-x-offset, 0px)) 0%,
      100% 0%,
      100% 100%,
      0% 100%,
      0% calc(100% - var(--peek-abs-y-offset, 0px)),
      calc(100% - var(--peek-abs-x-offset, 0px)) calc(100% - var(--peek-abs-y-offset, 0px))
    );
  }

  /*
   * Up-left peek (negative shift). Foreground overlaps the peek's
   * bottom-right rectangle `[|x|..W, |y|..H]`. Visible L = top strip ∪
   * left strip. Polygon vertices, clockwise from the peek's top-left:
   *   (0, 0) → (W, 0) → (W, |y|) → (|x|, |y|) → (|x|, H) → (0, H) → close.
   */
  .board-body-peek.shift-negative {
    clip-path: polygon(
      0% 0%,
      100% 0%,
      100% var(--peek-abs-y-offset, 0px),
      var(--peek-abs-x-offset, 0px) var(--peek-abs-y-offset, 0px),
      var(--peek-abs-x-offset, 0px) 100%,
      0% 100%
    );
  }

  /*
   * The actual foreground body content. Sits above all body peeks via
   * its higher z-index. Inherits the flex-column layout that the
   * `.tag-board-card-content` previously hosted directly so the kanban
   * board (the children snippet) continues to fill the available space.
   */
  .foreground-body {
    position: relative;
    z-index: 100;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /*
   * Compact sliver — depth ≥ 2 receded card. ~5px tall, non-interactive,
   * no label. Conveys "stack of cards behind" without consuming N ×
   * full-title-bar height. Consecutive slivers overlap by 1px so they
   * read as a stack rather than separated rectangles.
   */
  .tag-board-card.receded.compact {
    height: 5px;
    background: var(--color-gray-200);
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    margin-top: 2px;
    pointer-events: none;
    user-select: none;
  }

  /* Consecutive compact slivers overlap by 1px so multiple slivers read
     as a stack. Svelte's CSS scoping cannot see the sibling at compile
     time (only one card per component instance), so we use :global on
     the second selector — the deck composes multiple TagBoardCard
     instances as flex children, which is where the adjacency lives. */
  :global(.tag-board-card.receded.compact) + .tag-board-card.receded.compact {
    margin-top: -1px;
    box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.05);
  }
</style>
