import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskActionMenu from './TaskActionMenu.svelte';

describe('TaskActionMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
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

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('.task-action-menu-overlay')).toBeNull();
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

    const panel = container.querySelector('[role="menu"]');
    expect(panel).toBeTruthy();
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(items.length).toBe(3);
    expect(items[0].textContent?.trim()).toBe('Move to top');
    expect(items[1].textContent?.trim()).toBe('Move to bottom');
    expect(items[2].textContent?.trim()).toBe('Delete');
  });

  it('closes the menu without invoking any action when the overlay is clicked', async () => {
    const onSelect = vi.fn();
    renderMenu([{ label: 'Move to top', onSelect }]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    const overlay = container.querySelector<HTMLDivElement>('.task-action-menu-overlay');
    expect(overlay).toBeTruthy();

    await fireEvent.click(overlay!);
    await tick();

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes the menu without invoking any action when Escape is pressed', async () => {
    const onSelect = vi.fn();
    renderMenu([{ label: 'Move to top', onSelect }]);
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    await fireEvent.click(trigger!);
    await tick();

    expect(container.querySelector('[role="menu"]')).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();

    expect(container.querySelector('[role="menu"]')).toBeNull();
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

    const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    await fireEvent.click(items[1]);
    await tick();

    expect(onBottom).toHaveBeenCalledTimes(1);
    expect(onTop).not.toHaveBeenCalled();
    expect(container.querySelector('[role="menu"]')).toBeNull();
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
    expect(wrapper.querySelector('[role="menu"]')).toBeTruthy();
  });

  it('uses a custom ariaLabel when provided', async () => {
    renderMenu([{ label: 'Move to top', onSelect: () => {} }], 'Open task menu');
    await tick();

    const trigger = container.querySelector<HTMLButtonElement>('.task-action-menu-btn');
    expect(trigger?.getAttribute('aria-label')).toBe('Open task menu');
  });
});
