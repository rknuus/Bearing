<script lang="ts">
  /**
   * TaskActionMenu Component
   *
   * Reusable three-dot trigger button + menu panel. The component is content-
   * agnostic: callers pass an `actions` array of { label, onSelect } pairs and
   * the menu renders one button per action.
   *
   * Visual + interaction language matches the existing `column-menu` pattern in
   * `EisenKanView.svelte`. The relevant CSS rules are duplicated below (see
   * comment in the style block) and should be unified into a shared stylesheet
   * as a follow-up DRY task.
   *
   * Behaviour:
   * - Trigger click toggles the menu and stops propagation so the host card's
   *   click/drag/double-click/contextmenu handlers do NOT fire.
   * - Outside-pointerdown closes the menu (no action invoked).
   * - Escape key closes the menu (no action invoked) — listener is gated on
   *   open state to avoid swallowing events when closed.
   * - Action click closes the menu, then invokes the action's callback.
   *
   * Why a document-level pointerdown listener instead of a viewport-covering
   * overlay: an overlay (pre-fix) intercepted the very click that targeted
   * another card's trigger, so opening menu A and then clicking task B's
   * trigger produced "A closes, B does nothing" — the overlay swallowed the
   * click before it reached B. With a document-level listener, B's trigger
   * receives the click natively, opens its own menu, and that menu's listener
   * (in turn) closes any other open menu within the same event sequence.
   *
   * Why the panel is portalled to `document.body` with `position: fixed`:
   * EisenKanView's Todo column nests two `overflow-y: auto` containers (the
   * outer `.section-container` and each section's `.column-content`). The
   * CSS spec computes `overflow-x` for an `overflow-y: auto` container as
   * `auto` too, so any descendant whose painted box pokes past the
   * container's content edge — including a normal-flow absolutely-positioned
   * panel with `min-width: 140px` and a soft `box-shadow` — flashed a
   * horizontal scrollbar. A naive `position: fixed` is not enough on its
   * own: TagBoardCard (an ancestor of every task card) uses
   * `transform: translateX(...)`, which creates a new containing block for
   * fixed descendants — so the panel ends up positioned relative to the
   * card's stacking context rather than the viewport. The fix is to
   * physically move the panel out of every ancestor by attaching it to
   * `document.body` via a portal action while it is open, and computing its
   * top/left from `triggerEl.getBoundingClientRect()`. That fully decouples
   * the panel from every ancestor's overflow AND every ancestor's stacking
   * context. The portalled panel still carries the `task-action-menu-panel`
   * class so the outside-pointerdown handler can identify "inside" clicks
   * (it now checks `wrapper.contains(target) || panel.contains(target)`).
   */

  import { tick, untrack } from 'svelte';

  interface Action {
    label: string;
    onSelect: () => void;
  }

  interface Props {
    /** Menu actions, in display order. Must contain at least one entry. */
    actions: Action[];
    /** Accessible label for the trigger button. */
    ariaLabel?: string;
  }

  let { actions, ariaLabel = 'Task actions' }: Props = $props();

  let open = $state<boolean>(false);
  let wrapperEl: HTMLDivElement | undefined = $state();
  let triggerEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();

  // Viewport-anchored panel coordinates. `panelTop` is the panel's top edge
  // in viewport CSS pixels; `panelRight` is the distance from the viewport's
  // right edge to the panel's right edge. We anchor on the right by default
  // so the panel grows leftward from the trigger — matching the previous
  // `right: 0; top: 100%` absolute layout. If anchoring on the right would
  // push the panel past the left viewport edge (very narrow window), we flip
  // to a left anchor.
  let panelTop = $state<number>(0);
  let panelRight = $state<number | null>(0);
  let panelLeft = $state<number | null>(null);

  function toggleOpen() {
    if (!open) {
      // Compute panel coordinates BEFORE the panel mounts so it never paints
      // at the default (0, 0) origin — that would briefly overlay the
      // top-right of the viewport, causing pointer-event interception in
      // tools like Playwright (and a real visual glitch in slower paint
      // pipelines such as WebView2).
      reposition();
    }
    open = !open;
  }

  function handleAction(action: Action) {
    open = false;
    action.onSelect();
  }

  function handleKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      open = false;
    }
  }

  /**
   * Compute the panel's viewport coordinates from the trigger's bounding
   * rect. Called on open, on scroll, and on resize while open. Reads the
   * panel's actual width on the second pass to support the rare flip-to-
   * left-anchor case on very narrow viewports.
   */
  function reposition() {
    const trigger = untrack(() => triggerEl);
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Default: right-anchored so the panel grows leftward from the trigger.
    // The panel's right edge aligns with the trigger's right edge.
    const rightFromViewport = viewportWidth - rect.right;

    // Detect if the right-anchored panel would clip the left viewport edge.
    // We need the panel's actual width, which is only available after it
    // has rendered once. On the first pass `panelEl` is undefined, so we
    // assume the right anchor is fine (140px min-width fits virtually any
    // viewport). On subsequent passes we re-measure and flip if necessary.
    const panel = untrack(() => panelEl);
    if (panel) {
      const panelWidth = panel.offsetWidth;
      if (rect.right - panelWidth < 0) {
        // Flip to left anchor so the panel grows rightward from the trigger.
        panelLeft = Math.max(0, rect.left);
        panelRight = null;
      } else {
        panelLeft = null;
        panelRight = rightFromViewport;
      }
    } else {
      panelLeft = null;
      panelRight = rightFromViewport;
    }

    panelTop = rect.bottom;
  }

  // Outside-pointerdown closes the menu; reposition listeners track the
  // trigger as the user scrolls or resizes the viewport. All listeners are
  // attached on open and torn down on close via the same effect.
  $effect(() => {
    if (!open) return;
    const wrapper = untrack(() => wrapperEl);
    if (!wrapper) return;

    // A second pass runs after `tick()` to catch the narrow-viewport flip
    // once the portalled panel has measured its real width. The first pass
    // already ran synchronously inside `toggleOpen` so the panel never
    // paints at a stale (0, 0) origin.
    tick().then(() => {
      if (untrack(() => open)) reposition();
    });

    const onDocPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      // Pointerdowns that land inside this menu's wrapper (the trigger
      // button) OR inside the portalled panel are intentional and must not
      // close. Anything outside — including another card's trigger —
      // closes this menu.
      if (wrapper.contains(target)) return;
      const panel = untrack(() => panelEl);
      if (panel && panel.contains(target)) return;
      open = false;
    };
    const onScrollOrResize = () => reposition();
    document.addEventListener('pointerdown', onDocPointerDown, true);
    // `capture: true` on scroll catches scrolls on any ancestor (the section
    // container, the column-content drop zone, the page). `passive: true`
    // because we never preventDefault the scroll.
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  });

  /**
   * Svelte action that physically moves `node` to `document.body` on mount.
   * Used on the menu panel so that ancestor `transform` rules
   * (TagBoardCard uses `translateX`) cannot trap our `position: fixed`
   * panel inside their containing block, and so that ancestor
   * `overflow-y: auto` rules (.section-container, .column-content) cannot
   * detect overflow caused by the panel's painted box.
   *
   * Teardown deliberately does not reattach the node anywhere: the panel
   * only exists while `open === true`, so a fresh open builds a fresh
   * node — there is nothing to put back.
   */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        // Svelte's unmount of the surrounding `{#if open}` block removes
        // the node from its current parent (document.body) before this
        // destroy runs. We only need to handle the corner case where the
        // node is still attached — if so, detach it. We deliberately do
        // NOT reattach the node to its original wrapper: the panel only
        // exists while `open === true`, so a fresh open builds a fresh
        // node. Reattaching here would leave a stray panel in the DOM.
        if (node.parentNode === document.body) {
          document.body.removeChild(node);
        }
      },
    };
  }

  /*
   * Svelte 5 attaches delegated event listeners high up in the DOM, so an
   * `onclick={...}` attribute on a button cannot stopPropagation in time —
   * the host card's native click handler (and any drag/dnd handlers) already
   * see the bubbling event before the delegated handler runs. The same
   * problem is documented in TaskCard for mousedown/touchstart on footer
   * buttons, where the fix is to attach a native (non-delegated) listener
   * directly to the node via a Svelte action and stop the event at the
   * source. We apply the same approach for click here, but to keep the
   * activation logic running we both stop propagation AND invoke the
   * handler from inside the native listener (a delegated onclick attribute
   * would never fire because we stopped the bubble).
   *
   * In addition we stop `mousedown`, `touchstart`, and `pointerdown`
   * propagation at the trigger and at every menu item. svelte-dnd-action
   * registers `mousedown`/`touchstart` listeners on the draggable card root
   * (see node_modules/svelte-dnd-action/src/pointerAction.js around line
   * 646). If those listeners see a pointerdown originating inside the menu,
   * dnd registers a drag candidate and on the immediately-following
   * mousemove/mouseup pair fires a brief "false alarm" cycle that visibly
   * wobbles the card. Stopping the source events at the trigger / item nodes
   * keeps dnd unaware that any input occurred.
   */
  function nativeClick(node: HTMLElement, handler: () => void) {
    let current = handler;
    const onClick = (e: Event) => {
      e.stopPropagation();
      current();
    };
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener('click', onClick);
    node.addEventListener('mousedown', stop);
    // touchstart needs `passive: true` so the browser can keep the click
    // synthesis path; stopPropagation works regardless of passive.
    node.addEventListener('touchstart', stop, { passive: true });
    node.addEventListener('pointerdown', stop);
    return {
      update(next: () => void) {
        current = next;
      },
      destroy() {
        node.removeEventListener('click', onClick);
        node.removeEventListener('mousedown', stop);
        node.removeEventListener('touchstart', stop);
        node.removeEventListener('pointerdown', stop);
      },
    };
  }
</script>

<svelte:window onkeydown={handleKey} />

<div class="task-action-menu-wrapper" bind:this={wrapperEl}>
  <button
    type="button"
    class="task-action-menu-btn"
    bind:this={triggerEl}
    use:nativeClick={toggleOpen}
    aria-haspopup="true"
    aria-expanded={open}
    aria-label={ariaLabel}
  >
    ⋯
  </button>
  {#if open}
    <div
      class="task-action-menu task-action-menu-panel"
      role="menu"
      bind:this={panelEl}
      use:portal
      style:position="fixed"
      style:top="{panelTop}px"
      style:right={panelRight !== null ? `${panelRight}px` : 'auto'}
      style:left={panelLeft !== null ? `${panelLeft}px` : 'auto'}
    >
      {#each actions as action (action.label)}
        <button
          type="button"
          class="task-action-menu-item"
          role="menuitem"
          use:nativeClick={() => handleAction(action)}
        >
          {action.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /*
   * NOTE: These rules are intentionally duplicated from the `.column-menu*`
   * styles in `frontend/src/views/EisenKanView.svelte` (search for
   * "Column menu styles"). Keep them in lockstep until the follow-up DRY task
   * extracts them into a shared stylesheet (e.g.
   * `frontend/src/lib/styles/menu.css`) consumed by both call sites.
   */
  .task-action-menu-wrapper {
    position: relative;
  }

  .task-action-menu-btn {
    background: none;
    border: none;
    color: var(--color-gray-400);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
    border-radius: 4px;
    transition: color 0.15s, background-color 0.15s;
  }

  .task-action-menu-btn:hover {
    color: var(--color-gray-700);
    background-color: var(--color-gray-300);
  }

  /*
   * The panel is anchored to the viewport via `position: fixed` plus inline
   * top/left/right driven from the trigger's getBoundingClientRect(). This
   * takes the panel out of every ancestor's overflow context — the Todo
   * column's nested `overflow-y: auto` wrappers (the section-container and
   * each section's column-content) used to flash a horizontal scrollbar
   * when the panel's painted box poked past the section's content edge.
   */
  .task-action-menu {
    position: fixed;
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    z-index: 1000;
    overflow: hidden;
  }

  .task-action-menu-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    text-align: left;
    font-size: 0.8125rem;
    color: var(--color-gray-700);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .task-action-menu-item:hover {
    background-color: var(--color-gray-100);
  }
</style>
