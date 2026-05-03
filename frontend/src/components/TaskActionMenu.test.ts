import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskActionMenu from './TaskActionMenu.svelte';

/**
 * The menu panel is portalled to `document.body` while open (#129 follow-up
 * #2 — see the component's header comment for the rationale). The tests
 * therefore look up the panel via `document.body.querySelector(...)` rather
 * than the local render container — the trigger button stays inside the
 * render container, but the panel does not.
 */
function findOpenPanel(): HTMLDivElement | null {
  return document.body.querySelector<HTMLDivElement>(
    '.task-action-menu-panel[role="menu"]',
  );
}

function findOpenPanels(): HTMLDivElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLDivElement>(
      '.task-action-menu-panel[role="menu"]',
    ),
  );
}

describe('TaskActionMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    // Defensive: if a panel slipped past component teardown (e.g. a test
    // forgot to close the menu), strip it from body so it cannot leak into
    // the next test's assertions.
    findOpenPanels().forEach((p) => p.remove());
  });

  function renderMenu(actions: { label: string; onSelect: () => void }[], ariaLabel?: string) {
    return render(TaskActionMenu, {
      target: container,
      props: ariaLabel === undefined ? { actions } : { actions, ariaLabel },
    });
  }

  it('initially renders the trigger button only and the menu is closed', async () => {
    renderMenu([
      { label: 'Move to top', onSelect: () => {} },
      { label: 'Move to bottom', onSelect: () => {} },
    ]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    expect(trigger).toBeTruthy();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('true');
    expect(trigger?.getAttribute('aria-label')).toBe('Task actions');

    expect(findOpenPanel()).toBeNull();
    // The overlay element no longer exists (#129 fix Bug A): the menu uses
    // a document-level pointerdown listener instead, so other triggers can
    // receive their own clicks naturally.
    expect(document.querySelector('.task-action-menu-overlay')).toBeNull();
  });

  it('opens the menu and renders all action labels when the trigger is clicked', async () => {
    renderMenu([
      { label: 'Move to top', onSelect: () => {} },
      { label: 'Move to bottom', onSelect: () => {} },
      { label: 'Delete', onSelect: () => {} },
    ]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    const panel = findOpenPanel();
    expect(panel).toBeTruthy();
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    const items = panel!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(items.length).toBe(3);
    expect(items[0].textContent?.trim()).toBe('Move to top');
    expect(items[1].textContent?.trim()).toBe('Move to bottom');
    expect(items[2].textContent?.trim()).toBe('Delete');
  });

  it('portals the open panel to document.body with position: fixed (decouples from ancestor overflow & stacking context)', async () => {
    // Regression coverage for #129 follow-up #2 (the horizontal scrollbar
    // in Todo sections). The panel previously used `position: absolute`
    // and therefore participated in every ancestor's overflow context.
    // With two stacked `overflow-y: auto` ancestors in the Todo column
    // and a `transform: translateX(...)` ancestor in TagBoardCard, neither
    // a naive `position: fixed` nor `position: absolute` works in place —
    // the transform creates a new containing block for fixed descendants.
    // The component physically moves the panel out via a portal action
    // while it is open.
    renderMenu([{ label: 'Move to top', onSelect: () => {} }]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    const panel = findOpenPanel();
    expect(panel).toBeTruthy();
    // The panel is a direct child of <body>, not a descendant of the
    // component's render container.
    expect(panel!.parentElement).toBe(document.body);
    expect(container.contains(panel)).toBe(false);
    // Inline `position: fixed` so that no ancestor's normal-flow layout
    // applies (this is belt-and-braces — even body-level layout would not
    // pull the panel out of place).
    expect(getComputedStyle(panel!).position).toBe('fixed');
    // Inline top is set from the trigger's getBoundingClientRect().bottom.
    expect(panel!.style.top).toMatch(/^-?\d+(\.\d+)?px$/);
    // Either right or left is a px value; the other is the literal "auto".
    const rightSet = /^-?\d+(\.\d+)?px$/.test(panel!.style.right);
    const leftSet = /^-?\d+(\.\d+)?px$/.test(panel!.style.left);
    expect(rightSet || leftSet).toBe(true);
  });

  it('closes the menu without invoking any action when a pointerdown lands outside the panel', async () => {
    const onSelect = vi.fn();
    renderMenu([{ label: 'Move to top', onSelect }]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    expect(findOpenPanel()).toBeTruthy();

    // A pointerdown anywhere outside the menu's wrapper AND outside the
    // portalled panel closes the menu. We dispatch on a fresh element
    // appended to body so it is neither inside the trigger's wrapper nor
    // inside the panel.
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await tick();

    expect(findOpenPanel()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    document.body.removeChild(outside);
  });

  it('does NOT close the menu when a pointerdown lands inside the panel itself', async () => {
    const onSelect = vi.fn();
    renderMenu([{ label: 'Move to top', onSelect }]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    const panel = findOpenPanel();
    expect(panel).toBeTruthy();

    // A pointerdown that lands on the portalled panel itself (e.g., the
    // user is about to click an action item but the press lands on the
    // panel background between items) must NOT close the menu — even
    // though the panel sits at <body> level rather than inside the
    // trigger's wrapper, the inside-detection check covers both.
    panel!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await tick();

    expect(findOpenPanel()).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes the menu without invoking any action when Escape is pressed', async () => {
    const onSelect = vi.fn();
    renderMenu([{ label: 'Move to top', onSelect }]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    expect(findOpenPanel()).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();

    expect(findOpenPanel()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('invokes the action callback exactly once and closes the menu when an action item is clicked', async () => {
    const onTop = vi.fn();
    const onBottom = vi.fn();
    renderMenu([
      { label: 'Move to top', onSelect: onTop },
      { label: 'Move to bottom', onSelect: onBottom },
    ]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    const items = findOpenPanel()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    await fireEvent.click(items[1]);
    await tick();

    expect(onBottom).toHaveBeenCalledTimes(1);
    expect(onTop).not.toHaveBeenCalled();
    expect(findOpenPanel()).toBeNull();
  });

  it('does not propagate the trigger click to ancestor click handlers', async () => {
    const parentClick = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.addEventListener('click', parentClick);
    container.appendChild(wrapper);

    render(TaskActionMenu, {
      target: wrapper,
      props: { actions: [{ label: 'Move to top', onSelect: () => {} }] },
    });
    await tick();

    const trigger = wrapper.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    expect(trigger).toBeTruthy();

    await fireEvent.click(trigger!);
    await tick();

    expect(parentClick).not.toHaveBeenCalled();
    expect(findOpenPanel()).toBeTruthy();
  });

  it('does not propagate mousedown/touchstart/pointerdown on the trigger to ancestor listeners', async () => {
    // Regression coverage for #129 Bug B (the "wobble"): svelte-dnd-action
    // attaches mousedown/touchstart listeners on the draggable card root.
    // If pointerdown/mousedown/touchstart from the trigger button bubble to
    // the card root, dnd registers a drag candidate and the card wobbles.
    // The trigger's nativeClick action stops all three at the source.
    const parentMouseDown = vi.fn<(ev: Event) => void>();
    const parentTouchStart = vi.fn<(ev: Event) => void>();
    const parentPointerDown = vi.fn<(ev: Event) => void>();
    const wrapper = document.createElement('div');
    wrapper.addEventListener('mousedown', parentMouseDown);
    wrapper.addEventListener('touchstart', parentTouchStart);
    wrapper.addEventListener('pointerdown', parentPointerDown);
    container.appendChild(wrapper);

    render(TaskActionMenu, {
      target: wrapper,
      props: { actions: [{ label: 'Move to top', onSelect: () => {} }] },
    });
    await tick();

    const trigger = wrapper.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    expect(trigger).toBeTruthy();

    await fireEvent.mouseDown(trigger!);
    await fireEvent.touchStart(trigger!);
    trigger!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentTouchStart).not.toHaveBeenCalled();
    expect(parentPointerDown).not.toHaveBeenCalled();
  });

  it('opening one menu closes any previously-open menu without requiring a second click', async () => {
    // Regression coverage for #129 Bug A: prior to the fix the open menu
    // covered the viewport with an overlay that swallowed the click meant
    // for another card's trigger. With the document-level pointerdown
    // listener, clicking trigger B closes A AND opens B in the same gesture.
    const onSelectA = vi.fn();
    const onSelectB = vi.fn();

    const wrapperA = document.createElement('div');
    const wrapperB = document.createElement('div');
    container.appendChild(wrapperA);
    container.appendChild(wrapperB);

    render(TaskActionMenu, {
      target: wrapperA,
      props: {
        actions: [{ label: 'Top of A', onSelect: onSelectA }],
        ariaLabel: 'Card A menu',
      },
    });
    render(TaskActionMenu, {
      target: wrapperB,
      props: {
        actions: [{ label: 'Top of B', onSelect: onSelectB }],
        ariaLabel: 'Card B menu',
      },
    });
    await tick();

    const triggerA = wrapperA.querySelector<HTMLButtonElement>('button[aria-label="Card A menu"]');
    const triggerB = wrapperB.querySelector<HTMLButtonElement>('button[aria-label="Card B menu"]');
    expect(triggerA).toBeTruthy();
    expect(triggerB).toBeTruthy();

    // Identify panels by the unique label of their first menu item, since
    // both panels live as siblings under <body> when both are open.
    function panelOf(label: string): HTMLDivElement | null {
      const items = Array.from(
        document.body.querySelectorAll<HTMLButtonElement>(
          '.task-action-menu-panel [role="menuitem"]',
        ),
      );
      const match = items.find((b) => b.textContent?.trim() === label);
      return (match?.closest('.task-action-menu-panel') as HTMLDivElement | null) ?? null;
    }

    // Open A.
    await fireEvent.click(triggerA!);
    await tick();
    expect(panelOf('Top of A')).toBeTruthy();
    expect(panelOf('Top of B')).toBeNull();

    // Now simulate the real-world gesture on trigger B: pointerdown lands
    // first (closes A through the document listener), then click fires
    // (opens B). Both happen within the same user gesture; no second click.
    triggerB!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await tick();
    // A must already be closed by this point — the document-level
    // pointerdown listener fires synchronously.
    expect(panelOf('Top of A')).toBeNull();
    expect(panelOf('Top of B')).toBeNull();

    await fireEvent.click(triggerB!);
    await tick();
    expect(panelOf('Top of A')).toBeNull();
    expect(panelOf('Top of B')).toBeTruthy();
    // Neither action was invoked — the click was on the trigger, not an item.
    expect(onSelectA).not.toHaveBeenCalled();
    expect(onSelectB).not.toHaveBeenCalled();
  });

  it('uses a custom ariaLabel when provided', async () => {
    renderMenu([{ label: 'Move to top', onSelect: () => {} }], 'Open task menu');
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    expect(trigger?.getAttribute('aria-label')).toBe('Open task menu');
  });
});
