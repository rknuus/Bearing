import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import TagFilterBar from './TagFilterBar.svelte';

describe('TagFilterBar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderBar(props: {
    availableTags: string[];
    activeTagIds: string[];
    onToggle?: (tag: string) => void;
    onClear?: () => void;
    counts?: Record<string, number>;
    untaggedActive?: boolean;
  }) {
    const result = render(TagFilterBar, {
      target: container,
      props: {
        availableTags: props.availableTags,
        activeTagIds: props.activeTagIds,
        onToggle: props.onToggle ?? (() => {}),
        onClear: props.onClear ?? (() => {}),
        counts: props.counts,
        untaggedActive: props.untaggedActive,
      },
    });
    await tick();
    return result;
  }

  it('renders tag pills from availableTags', async () => {
    await renderBar({ availableTags: ['backend', 'api', 'urgent'], activeTagIds: [] });

    const pills = container.querySelectorAll('.filter-pill');
    // 3 tag pills + 1 "All" pill
    expect(pills.length).toBe(4);

    const allPill = container.querySelector('.all-pill');
    expect(allPill?.textContent?.trim()).toBe('All');

    const tagPills = container.querySelectorAll('.tag-pill');
    expect(tagPills.length).toBe(3);
  });

  it('renders nothing when availableTags is empty', async () => {
    await renderBar({ availableTags: [], activeTagIds: [] });

    const bar = container.querySelector('.tag-filter-bar');
    expect(bar).toBeNull();
  });

  it('"All" pill active when no tags selected', async () => {
    await renderBar({ availableTags: ['backend', 'api'], activeTagIds: [] });

    const allPill = container.querySelector('.all-pill');
    expect(allPill?.classList.contains('active')).toBe(true);
  });

  it('clicking tag pill calls onToggle', async () => {
    const onToggle = vi.fn();
    await renderBar({ availableTags: ['backend', 'api'], activeTagIds: [], onToggle });

    const tagPills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
    tagPills[0].click();
    await tick();

    expect(onToggle).toHaveBeenCalledWith('backend');
  });

  it('active tag pills show filled style', async () => {
    await renderBar({ availableTags: ['backend', 'api'], activeTagIds: ['backend'] });

    const tagPills = container.querySelectorAll('.tag-pill');
    // First pill is 'backend' and should be active
    expect(tagPills[0].classList.contains('active')).toBe(true);
    // Second pill is 'api' and should not be active
    expect(tagPills[1].classList.contains('active')).toBe(false);
  });

  it('shows count badges on pills when counts prop is provided', async () => {
    await renderBar({
      availableTags: ['backend', 'api'],
      activeTagIds: [],
      counts: { '__all__': 10, 'backend': 5, 'api': 3, '__untagged__': 2 },
    });

    const allBadge = container.querySelector('.all-pill .count-badge');
    expect(allBadge?.textContent).toBe('10');

    const tagPills = container.querySelectorAll('.tag-pill:not(.untagged-pill)');
    expect(tagPills[0].querySelector('.count-badge')?.textContent).toBe('5');
    expect(tagPills[1].querySelector('.count-badge')?.textContent).toBe('3');
  });

  it('renders Untagged pill when untagged count > 0', async () => {
    await renderBar({
      availableTags: ['backend'],
      activeTagIds: [],
      counts: { '__all__': 5, 'backend': 3, '__untagged__': 2 },
    });

    const untaggedPill = container.querySelector('.untagged-pill');
    expect(untaggedPill).not.toBeNull();
    expect(untaggedPill?.textContent).toContain('Untagged');
    expect(untaggedPill?.querySelector('.count-badge')?.textContent).toBe('2');
  });

  it('clicking Untagged pill calls onToggle with sentinel', async () => {
    const onToggle = vi.fn();
    await renderBar({
      availableTags: ['backend'],
      activeTagIds: [],
      onToggle,
      counts: { '__all__': 5, 'backend': 3, '__untagged__': 2 },
    });

    const untaggedPill = container.querySelector<HTMLButtonElement>('.untagged-pill');
    untaggedPill?.click();
    await tick();

    expect(onToggle).toHaveBeenCalledWith('__untagged__');
  });

  it('Untagged pill shows active state when untaggedActive is true', async () => {
    await renderBar({
      availableTags: ['backend'],
      activeTagIds: ['__untagged__'],
      untaggedActive: true,
      counts: { '__all__': 5, 'backend': 3, '__untagged__': 2 },
    });

    const untaggedPill = container.querySelector('.untagged-pill');
    expect(untaggedPill?.classList.contains('active')).toBe(true);
  });

  it('renders when no tags but untagged tasks exist', async () => {
    await renderBar({
      availableTags: [],
      activeTagIds: [],
      counts: { '__all__': 3, '__untagged__': 3 },
    });

    const bar = container.querySelector('.tag-filter-bar');
    expect(bar).not.toBeNull();

    const untaggedPill = container.querySelector('.untagged-pill');
    expect(untaggedPill).not.toBeNull();
  });

  it('does not show counts when counts prop is not provided', async () => {
    await renderBar({ availableTags: ['backend'], activeTagIds: [] });

    const allPill = container.querySelector('.all-pill');
    expect(allPill?.textContent?.trim()).toBe('All');
  });
});
