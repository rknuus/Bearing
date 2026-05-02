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
    focusTags: string[];
    onSelect: (tag: string) => void;
  }> = {}) {
    return {
      tags: ['alpha', 'beta', 'gamma'],
      selectedTag: 'All',
      hasUntagged: true,
      focusTags: [] as string[],
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

  // --- Focus-group marker (#121, US-7) ---

  it('renders no focus frame when focusTags is empty', async () => {
    render(TagBoardStrip, { target: container, props: makeProps({ focusTags: [] }) });
    await tick();

    expect(container.querySelector('.focus-group-frame')).toBeNull();
    expect(container.querySelectorAll('.tag-board-strip-item.focus-group').length).toBe(0);
  });

  it('renders the focus frame when at least one focus tag is in the prefix', async () => {
    render(TagBoardStrip, {
      target: container,
      props: makeProps({ tags: ['alpha', 'beta', 'gamma'], focusTags: ['alpha'] }),
    });
    await tick();

    expect(container.querySelector('.focus-group-frame')).not.toBeNull();
    const focusChips = container.querySelectorAll('.tag-board-strip-item.focus-group');
    expect(focusChips.length).toBe(1);
    expect(focusChips[0].textContent?.trim()).toBe('alpha');
  });

  it('focus frame exposes accessible label and visible "Today\'s focus" caption (#120 Issue 4)', async () => {
    render(TagBoardStrip, {
      target: container,
      props: makeProps({ tags: ['alpha', 'beta'], focusTags: ['alpha'] }),
    });
    await tick();

    const frame = container.querySelector('.focus-group-frame');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('role')).toBe('group');
    expect(frame?.getAttribute('aria-label')).toBe("Today's focus");

    const caption = container.querySelector('.focus-group-label');
    expect(caption?.textContent?.trim()).toBe("Today's focus");
  });

  it('marks every contiguous focus chip at the head of the strip (multiple focus tags)', async () => {
    // Deck guarantees focus prefix matches focusTags in order.
    render(TagBoardStrip, {
      target: container,
      props: makeProps({
        tags: ['alpha', 'beta', 'gamma', 'delta'],
        focusTags: ['alpha', 'beta'],
      }),
    });
    await tick();

    const focusChips = Array.from(container.querySelectorAll('.tag-board-strip-item.focus-group'));
    expect(focusChips.map(c => c.textContent?.trim())).toEqual(['alpha', 'beta']);

    // gamma / delta must not be in the focus group, even when supplied
    // out-of-alpha-order in focusTags by an unsanitised caller.
    const nonFocus = Array.from(container.querySelectorAll('.tag-board-strip-item:not(.focus-group):not(.synthetic)'));
    expect(nonFocus.map(c => c.textContent?.trim())).toEqual(['gamma', 'delta']);
  });

  it('does not extend the focus group past the first non-focus tag', async () => {
    // If `tags` puts a non-focus chip between two focus chips, only the
    // contiguous prefix counts. Defensive guard — the deck will normally
    // sort focus first, but the strip must not over-mark.
    render(TagBoardStrip, {
      target: container,
      props: makeProps({
        tags: ['alpha', 'gamma', 'beta'],
        focusTags: ['alpha', 'beta'],
      }),
    });
    await tick();

    const focusChips = Array.from(container.querySelectorAll('.tag-board-strip-item.focus-group'));
    expect(focusChips.map(c => c.textContent?.trim())).toEqual(['alpha']);
  });

  it('preserves selection when the selected tag sits outside the focus group (US-2)', async () => {
    // gamma is selected and is NOT in focus; the strip must still mark it
    // active without losing the focus marker on alpha/beta.
    render(TagBoardStrip, {
      target: container,
      props: makeProps({
        tags: ['alpha', 'beta', 'gamma'],
        focusTags: ['alpha', 'beta'],
        selectedTag: 'gamma',
      }),
    });
    await tick();

    const active = container.querySelectorAll('.tag-board-strip-item.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('gamma');
    expect(active[0].classList.contains('focus-group')).toBe(false);

    expect(container.querySelector('.focus-group-frame')).not.toBeNull();
  });

  it('renders tags in the supplied order (FR-10 ordering is the deck\'s job; the strip never re-sorts)', async () => {
    // Strip simply renders what the deck supplies. This guards the
    // contract: deck owns FR-10, strip owns chips + marker.
    render(TagBoardStrip, {
      target: container,
      props: makeProps({
        tags: ['zeta', 'alpha', 'mango'],
        focusTags: ['zeta'],
      }),
    });
    await tick();

    const userChips = Array.from(container.querySelectorAll('.tag-board-strip-item:not(.synthetic)'));
    expect(userChips.map(c => c.textContent?.trim())).toEqual(['zeta', 'alpha', 'mango']);
  });
});
