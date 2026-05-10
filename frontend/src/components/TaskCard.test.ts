import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme, TaskWithStatus } from '../lib/wails-mock';
import TaskCard from './TaskCard.svelte';

/**
 * Regression coverage for the two-click bug on the EisenKan task-card footer
 * buttons (delete, archive, restore). The bug was caused by svelte-dnd-action
 * attaching a native mousedown listener on the draggable container that calls
 * e.preventDefault() — which suppressed the browser-generated click event for
 * inner buttons. The fix attaches a native mousedown/touchstart listener on
 * each button via a Svelte action, intercepting the event before it bubbles
 * to the dndzone listener.
 *
 * These tests assert that:
 *  1. A single click on each footer button calls its callback exactly once.
 *  2. mousedown originating from the button is stopped before bubbling, so
 *     a parent native mousedown listener (mimicking the dndzone listener) is
 *     never invoked. This is the load-bearing assertion: if it regresses, the
 *     two-click bug is back.
 */

function makeThemes(): LifeTheme[] {
  return [
    { id: 'HF', name: 'Health & Fitness', color: '#10b981', objectives: [] },
  ];
}

function makeTask(overrides: Partial<TaskWithStatus> = {}): TaskWithStatus {
  return {
    id: 'HF-T1',
    title: 'Test task',
    themeId: 'HF',
    priority: 'important-urgent',
    status: 'todo',
    ...overrides,
  };
}

describe('TaskCard', () => {
  let container: HTMLDivElement;
  let outerMouseDownSpy: ReturnType<typeof vi.fn<(ev: Event) => void>>;
  let outerTouchStartSpy: ReturnType<typeof vi.fn<(ev: Event) => void>>;

  beforeEach(() => {
    container = document.createElement('div');
    // The outer wrapper mimics the dndzone container in EisenKanView: it
    // listens for native mousedown/touchstart the same way svelte-dnd-action
    // does. If these fire when the user clicks a footer button, dnd-action
    // would also fire — and would call preventDefault, swallowing the click.
    outerMouseDownSpy = vi.fn<(ev: Event) => void>();
    outerTouchStartSpy = vi.fn<(ev: Event) => void>();
    container.addEventListener('mousedown', outerMouseDownSpy);
    container.addEventListener('touchstart', outerTouchStartSpy);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  it('fires onDelete on a single click and does not propagate to parent', async () => {
    const onDelete = vi.fn();
    render(TaskCard, {
      target: container,
      props: { task: makeTask(), themes: makeThemes(), onDelete },
    });
    await tick();

    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete task"]',
    );
    expect(button).toBeTruthy();

    await fireEvent.mouseDown(button!);
    await fireEvent.touchStart(button!);
    await fireEvent.click(button!);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(outerMouseDownSpy).not.toHaveBeenCalled();
    expect(outerTouchStartSpy).not.toHaveBeenCalled();
  });

  it('fires onArchive on a single click and does not propagate to parent', async () => {
    const onArchive = vi.fn();
    render(TaskCard, {
      target: container,
      props: { task: makeTask({ status: 'done' }), themes: makeThemes(), onArchive },
    });
    await tick();

    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Archive task"]',
    );
    expect(button).toBeTruthy();

    await fireEvent.mouseDown(button!);
    await fireEvent.touchStart(button!);
    await fireEvent.click(button!);

    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(outerMouseDownSpy).not.toHaveBeenCalled();
    expect(outerTouchStartSpy).not.toHaveBeenCalled();
  });

  it('fires onRestore on a single click and does not propagate to parent', async () => {
    const onRestore = vi.fn();
    render(TaskCard, {
      target: container,
      props: {
        task: makeTask({ status: 'archived' }),
        themes: makeThemes(),
        draggable: false,
        onRestore,
      },
    });
    await tick();

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Restore task"]');
    expect(button).toBeTruthy();

    await fireEvent.mouseDown(button!);
    await fireEvent.touchStart(button!);
    await fireEvent.click(button!);

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(outerMouseDownSpy).not.toHaveBeenCalled();
    expect(outerTouchStartSpy).not.toHaveBeenCalled();
  });

  /**
   * Single-click edit affordance (#146 / UX finding I1). When `onEdit` is
   * provided TaskCard prepends an "Edit" entry to the three-dot menu so
   * the action is discoverable without relying on the existing
   * double-click shortcut. Callers (EisenKanView) wire the same callback
   * to `ondblclick` so both gestures continue to open the editor.
   */
  describe('onEdit menu entry (#146)', () => {
    it('prepends an Edit entry to the three-dot menu when onEdit is provided and fires the handler on click', async () => {
      const onEdit = vi.fn();
      const onMoveTop = vi.fn();
      render(TaskCard, {
        target: container,
        props: {
          task: makeTask(),
          themes: makeThemes(),
          onEdit,
          actions: [{ label: 'Move to top', onSelect: onMoveTop }],
        },
      });
      await tick();

      const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
      expect(trigger).toBeTruthy();
      await fireEvent.click(trigger!);
      await tick();

      // Panel is portalled to <body>; query there for the menu items.
      const items = document.body.querySelectorAll<HTMLButtonElement>(
        '.task-action-menu-panel [role="menuitem"]',
      );
      expect(items.length).toBe(2);
      expect(items[0].textContent?.trim()).toBe('Edit');
      expect(items[1].textContent?.trim()).toBe('Move to top');

      await fireEvent.click(items[0]);
      await tick();
      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onMoveTop).not.toHaveBeenCalled();
    });

    it('still renders a single-entry menu when onEdit is provided without any other actions', async () => {
      const onEdit = vi.fn();
      render(TaskCard, {
        target: container,
        props: {
          task: makeTask(),
          themes: makeThemes(),
          onEdit,
        },
      });
      await tick();

      const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
      expect(trigger).toBeTruthy();
      await fireEvent.click(trigger!);
      await tick();

      const items = document.body.querySelectorAll<HTMLButtonElement>(
        '.task-action-menu-panel [role="menuitem"]',
      );
      expect(items.length).toBe(1);
      expect(items[0].textContent?.trim()).toBe('Edit');

      // Defensive cleanup so the portalled panel does not leak into the
      // next test's body queries.
      await fireEvent.keyDown(window, { key: 'Escape' });
      await tick();
    });

    it('omits the menu entirely when neither onEdit nor actions are provided', async () => {
      render(TaskCard, {
        target: container,
        props: { task: makeTask(), themes: makeThemes() },
      });
      await tick();
      expect(container.querySelector('.task-action-menu-btn')).toBeNull();
    });
  });

  it('renders only the variant-specific footer button per callback prop', async () => {
    const { unmount: unmount1 } = render(TaskCard, {
      target: container,
      props: { task: makeTask(), themes: makeThemes(), onDelete: vi.fn() },
    });
    await tick();
    expect(container.querySelector('button[aria-label="Delete task"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Archive task"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Restore task"]')).toBeNull();
    unmount1();

    const detached = document.createElement('div');
    document.body.appendChild(detached);
    const { unmount: unmount2 } = render(TaskCard, {
      target: detached,
      props: { task: makeTask({ status: 'done' }), themes: makeThemes(), onArchive: vi.fn() },
    });
    await tick();
    expect(detached.querySelector('button[aria-label="Archive task"]')).toBeTruthy();
    expect(detached.querySelector('button[aria-label="Delete task"]')).toBeNull();
    unmount2();
    document.body.removeChild(detached);
  });
});
