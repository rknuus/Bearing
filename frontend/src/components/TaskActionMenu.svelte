<script lang="ts">
  /**
   * TaskActionMenu Component
   *
   * Reusable three-dot trigger button + overlay-backed menu panel. The component
   * is content-agnostic: callers pass an `actions` array of { label, onSelect }
   * pairs and the menu renders one button per action.
   *
   * Visual + interaction language matches the existing `column-menu` pattern in
   * `EisenKanView.svelte`. The relevant CSS rules are duplicated below (see
   * comment in the style block) and should be unified into a shared stylesheet
   * as a follow-up DRY task.
   *
   * Behaviour:
   * - Trigger click toggles the menu and stops propagation so the host card's
   *   click/drag/double-click/contextmenu handlers do NOT fire.
   * - Overlay click closes the menu (no action invoked).
   * - Escape key closes the menu (no action invoked) — listener is gated on
   *   open state to avoid swallowing events when closed.
   * - Action click closes the menu, then invokes the action's callback.
   */

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

  function toggleOpen() {
    open = !open;
  }

  function closeMenu() {
    open = false;
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
   */
  function nativeClick(node: HTMLElement, handler: () => void) {
    let current = handler;
    const wrapped = (e: Event) => {
      e.stopPropagation();
      current();
    };
    node.addEventListener('click', wrapped);
    return {
      update(next: () => void) {
        current = next;
      },
      destroy() {
        node.removeEventListener('click', wrapped);
      },
    };
  }
</script>

<svelte:window onkeydown={handleKey} />

<div class="task-action-menu-wrapper">
  <button
    type="button"
    class="task-action-menu-btn"
    use:nativeClick={toggleOpen}
    aria-haspopup="true"
    aria-expanded={open}
    aria-label={ariaLabel}
  >
    ⋯
  </button>
  {#if open}
    <div
      class="task-action-menu-overlay"
      onclick={closeMenu}
      role="presentation"
    ></div>
    <div class="task-action-menu" role="menu">
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

  .task-action-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .task-action-menu {
    position: absolute;
    right: 0;
    top: 100%;
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
