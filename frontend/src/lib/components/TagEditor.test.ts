import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TagEditor from './TagEditor.svelte';

describe('TagEditor', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderEditor(props: {
    tags: string[];
    availableTags: string[];
    onTagsChange: (tags: string[]) => void;
    placeholder?: string;
  }) {
    const result = render(TagEditor, { target: container, props });
    await tick();
    return result;
  }

  function getAllPills(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('.tag-pill'));
  }

  function getActivePills(): HTMLButtonElement[] {
    return getAllPills().filter(p => p.classList.contains('active'));
  }

  function getInput(): HTMLInputElement {
    return container.querySelector<HTMLInputElement>('.tag-input')!;
  }

  function getSuggestionItems(): HTMLLIElement[] {
    return Array.from(container.querySelectorAll<HTMLLIElement>('.tag-suggestion-item'));
  }

  it('renders available tags as pills', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['backend', 'frontend', 'urgent'],
      onTagsChange,
    });

    const pills = getAllPills();
    expect(pills.length).toBe(3);
    expect(pills.map(p => p.textContent?.trim())).toEqual(['backend', 'frontend', 'urgent']);
  });

  it('shows selected tags as visually distinct (filled/active)', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: ['frontend'],
      availableTags: ['backend', 'frontend', 'urgent'],
      onTagsChange,
    });

    const active = getActivePills();
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('frontend');

    // Non-selected pills should not have active class
    const allPills = getAllPills();
    const inactive = allPills.filter(p => !p.classList.contains('active'));
    expect(inactive.length).toBe(2);
  });

  it('clicking an unselected pill calls onTagsChange to add the tag', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: ['frontend'],
      availableTags: ['backend', 'frontend', 'urgent'],
      onTagsChange,
    });

    const backendPill = getAllPills().find(p => p.textContent?.trim() === 'backend')!;
    await fireEvent.click(backendPill);

    expect(onTagsChange).toHaveBeenCalledWith(['frontend', 'backend']);
  });

  it('clicking a selected pill calls onTagsChange to remove the tag', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: ['frontend', 'backend'],
      availableTags: ['backend', 'frontend', 'urgent'],
      onTagsChange,
    });

    const frontendPill = getAllPills().find(p => p.textContent?.trim() === 'frontend')!;
    await fireEvent.click(frontendPill);

    expect(onTagsChange).toHaveBeenCalledWith(['backend']);
  });

  it('autocomplete filters suggestions by substring match', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['backend', 'frontend', 'urgent'],
      onTagsChange,
    });

    const input = getInput();
    await fireEvent.input(input, { target: { value: 'end' } });
    // Need to set the bound value manually in test
    input.value = 'end';
    await fireEvent.input(input);
    await tick();

    const items = getSuggestionItems();
    expect(items.length).toBe(2);
    expect(items.map(i => i.textContent?.trim())).toEqual(['backend', 'frontend']);
  });

  it('autocomplete excludes already-selected tags', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: ['backend'],
      availableTags: ['backend', 'frontend', 'urgent'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'end';
    await fireEvent.input(input);
    await tick();

    const items = getSuggestionItems();
    expect(items.length).toBe(1);
    expect(items[0].textContent?.trim()).toBe('frontend');
  });

  it('keyboard navigation: ArrowDown highlights next suggestion', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['alpha', 'beta'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'a';
    await fireEvent.input(input);
    await tick();

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await tick();

    const items = getSuggestionItems();
    expect(items[0].classList.contains('highlighted')).toBe(true);
  });

  it('keyboard navigation: ArrowUp highlights previous suggestion', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['alpha', 'beta'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'a';
    await fireEvent.input(input);
    await tick();

    // ArrowDown twice to highlight second item, then ArrowUp
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await tick();

    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    await tick();

    const items = getSuggestionItems();
    expect(items[0].classList.contains('highlighted')).toBe(true);
    expect(items[1].classList.contains('highlighted')).toBe(false);
  });

  it('keyboard navigation: Enter selects highlighted suggestion', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['alpha', 'beta'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'a';
    await fireEvent.input(input);
    await tick();

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await tick();
    await fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    expect(onTagsChange).toHaveBeenCalledWith(['alpha']);
  });

  it('keyboard navigation: Escape closes dropdown', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['alpha', 'beta'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'a';
    await fireEvent.input(input);
    await tick();

    expect(getSuggestionItems().length).toBeGreaterThan(0);

    await fireEvent.keyDown(input, { key: 'Escape' });
    await tick();

    expect(getSuggestionItems().length).toBe(0);
  });

  it('Enter on non-matching input creates new tag', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['backend', 'frontend'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'newtag';
    await fireEvent.input(input);
    await tick();

    await fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    expect(onTagsChange).toHaveBeenCalledWith(['newtag']);
  });

  it('new tags appear in available pills after creation', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: ['backend'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'newtag';
    await fireEvent.input(input);
    await tick();

    await fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    // After creating a new tag, it should appear as a pill in the editor
    const pills = getAllPills();
    const pillTexts = pills.map(p => p.textContent?.trim());
    expect(pillTexts).toContain('backend');
    expect(pillTexts).toContain('newtag');
  });

  it('renders with custom placeholder', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: [],
      onTagsChange,
      placeholder: 'Type a tag...',
    });

    const input = getInput();
    expect(input.placeholder).toBe('Type a tag...');
  });

  it('uses default placeholder when none provided', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: [],
      availableTags: [],
      onTagsChange,
    });

    const input = getInput();
    expect(input.placeholder).toBe('Add new tag...');
  });

  it('does not add duplicate tags', async () => {
    const onTagsChange = vi.fn();
    await renderEditor({
      tags: ['existing'],
      availableTags: ['existing'],
      onTagsChange,
    });

    const input = getInput();
    input.value = 'existing';
    await fireEvent.input(input);
    await tick();

    await fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    // onTagsChange should not be called since tag already exists
    expect(onTagsChange).not.toHaveBeenCalled();
  });
});
