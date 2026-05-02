import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TagBoardStrip from './TagBoardStrip.svelte';

describe('TagBoardStrip', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function makeProps(over: Partial<{
    tags: string[];
    selectedTag: string;
    hasUntagged: boolean;
    onSelect: (tag: string) => void;
  }> = {}) {
    return {
      tags: ['alpha', 'beta', 'gamma'],
      selectedTag: 'All',
      hasUntagged: true,
      onSelect: vi.fn(),
      ...over,
    };
  }

  it('renders user tags in the order supplied', async () => {
    render(TagBoardStrip, { target: container, props: makeProps() });
    await tick();

    const items = container.querySelectorAll('.tag-board-strip-item');
    // 3 user tags + Untagged + All
    expect(items.length).toBe(5);
    expect(items[0].textContent?.trim()).toBe('alpha');
    expect(items[1].textContent?.trim()).toBe('beta');
    expect(items[2].textContent?.trim()).toBe('gamma');
  });

  it('places Untagged at the penultimate position and All last', async () => {
    render(TagBoardStrip, { target: container, props: makeProps() });
    await tick();

    const items = container.querySelectorAll('.tag-board-strip-item');
    expect(items[items.length - 2].textContent?.trim()).toBe('Untagged');
    expect(items[items.length - 1].textContent?.trim()).toBe('All');
  });

  it('omits the Untagged button when hasUntagged is false', async () => {
    render(TagBoardStrip, { target: container, props: makeProps({ hasUntagged: false }) });
    await tick();

    const untagged = container.querySelector('.tag-board-strip-item.untagged');
    expect(untagged).toBeNull();

    const items = container.querySelectorAll('.tag-board-strip-item');
    expect(items.length).toBe(4);
    expect(items[items.length - 1].textContent?.trim()).toBe('All');
  });

  it('marks the selected board as active and aria-checked', async () => {
    render(TagBoardStrip, { target: container, props: makeProps({ selectedTag: 'beta' }) });
    await tick();

    const active = container.querySelectorAll('.tag-board-strip-item.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('beta');
    expect(active[0].getAttribute('aria-checked')).toBe('true');
  });

  it('emits onSelect with the user tag name when clicked', async () => {
    const onSelect = vi.fn();
    render(TagBoardStrip, { target: container, props: makeProps({ onSelect }) });
    await tick();

    const beta = Array.from(container.querySelectorAll('.tag-board-strip-item')).find(
      b => b.textContent?.trim() === 'beta'
    ) as HTMLButtonElement;
    await fireEvent.click(beta);
    expect(onSelect).toHaveBeenCalledWith('beta');
  });

  it('emits onSelect with Untagged / All for synthetic clicks', async () => {
    const onSelect = vi.fn();
    render(TagBoardStrip, { target: container, props: makeProps({ onSelect }) });
    await tick();

    await fireEvent.click(container.querySelector('.tag-board-strip-item.untagged') as HTMLButtonElement);
    await fireEvent.click(container.querySelector('.tag-board-strip-item.all') as HTMLButtonElement);

    expect(onSelect).toHaveBeenCalledWith('Untagged');
    expect(onSelect).toHaveBeenCalledWith('All');
  });

  it('exposes radiogroup semantics for screen readers', async () => {
    render(TagBoardStrip, { target: container, props: makeProps() });
    await tick();

    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios.length).toBeGreaterThan(0);
  });
});
