import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskFormFields from './TaskFormFields.svelte';

describe('TaskFormFields tag autocomplete', () => {
  let container: HTMLDivElement;

  const themes = [
    { id: 'HF', name: 'Health', color: '#22c55e', objectives: [] },
  ];

  const availableTags = ['backend', 'frontend', 'api', 'urgent', 'review'];

  function defaultProps() {
    return {
      title: '',
      themeId: 'HF',
      description: '',
      tags: '',
      dueDate: '',
      promotionDate: '',
      themes,
      availableTags,
    };
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function getTagsInput(): HTMLInputElement {
    return container.querySelector('input[id$="tags"]') as HTMLInputElement;
  }

  function getSuggestions(): HTMLLIElement[] {
    return Array.from(container.querySelectorAll('.suggestion-item'));
  }

  async function typeInTags(input: HTMLInputElement, value: string) {
    // Set value and cursor position, then dispatch input event
    input.value = value;
    input.setSelectionRange(value.length, value.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
  }

  it('shows suggestions when typing matches available tags', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'back');

    const suggestions = getSuggestions();
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].textContent).toBe('backend');
  });

  it('filters suggestions case-insensitively', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'FRONT');

    const suggestions = getSuggestions();
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].textContent).toBe('frontend');
  });

  it('excludes tags already in the input', async () => {
    render(TaskFormFields, { target: container, props: { ...defaultProps(), tags: 'backend, ' } });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'backend, back');

    const suggestions = getSuggestions();
    // 'backend' already in input, should not appear
    expect(suggestions.length).toBe(0);
  });

  it('shows no suggestions when no matches', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'xyz');

    const suggestions = getSuggestions();
    expect(suggestions.length).toBe(0);
  });

  it('shows no suggestions when availableTags is empty', async () => {
    render(TaskFormFields, { target: container, props: { ...defaultProps(), availableTags: [] } });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'back');

    const suggestions = getSuggestions();
    expect(suggestions.length).toBe(0);
  });

  it('inserts tag on suggestion click', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'back');

    const suggestion = getSuggestions()[0];
    suggestion.dispatchEvent(new Event('mousedown', { bubbles: true }));
    await tick();

    // Input should have the tag inserted with trailing comma
    expect(input.value).toBe('backend, ');
  });

  it('navigates suggestions with keyboard and selects with Enter', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'e');

    // Should show 'backend', 'frontend', 'urgent', 'review' (all contain 'e')
    const suggestions = getSuggestions();
    expect(suggestions.length).toBe(4);

    // Arrow down to first item
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await tick();

    // First item should be highlighted
    expect(getSuggestions()[0].classList.contains('highlighted')).toBe(true);

    // Press Enter to select
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();

    // Dropdown should be dismissed
    expect(getSuggestions().length).toBe(0);
  });

  it('dismisses suggestions on Escape', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();
    input.focus();

    await typeInTags(input, 'back');
    expect(getSuggestions().length).toBe(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();

    expect(getSuggestions().length).toBe(0);
  });

  it('shows multiple matching suggestions', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();
    input.focus();

    // 'en' matches 'backend', 'frontend', 'urgent' (all contain 'en')
    await typeInTags(input, 'en');

    const suggestions = getSuggestions();
    expect(suggestions.length).toBe(3);
    const texts = suggestions.map(s => s.textContent);
    expect(texts).toContain('backend');
    expect(texts).toContain('frontend');
    expect(texts).toContain('urgent');
  });

  it('has correct ARIA attributes on input', async () => {
    render(TaskFormFields, { target: container, props: defaultProps() });
    const input = getTagsInput();

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('autocomplete')).toBe('off');
  });
});
