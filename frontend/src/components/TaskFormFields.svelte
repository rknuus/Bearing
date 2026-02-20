<script lang="ts">
  /**
   * TaskFormFields Component
   *
   * Shared form fields used by both CreateTaskDialog and EditTaskDialog.
   * Renders title, theme, description, tags, due date, and promotion date fields.
   * Tags input includes auto-completion from existing tags when availableTags is provided.
   */

  import type { LifeTheme } from '../lib/wails-mock';

  interface Props {
    title: string;
    themeId: string;
    description: string;
    tags: string;
    dueDate: string;
    promotionDate: string;
    themes: LifeTheme[];
    availableTags?: string[];
    disabled?: boolean;
    idPrefix?: string;
  }

  let {
    title = $bindable(),
    themeId = $bindable(),
    description = $bindable(),
    tags = $bindable(),
    dueDate = $bindable(),
    promotionDate = $bindable(),
    themes,
    availableTags = [],
    disabled = false,
    idPrefix = '',
  }: Props = $props();

  const prefix = $derived(idPrefix ? `${idPrefix}-` : '');

  // Tag autocomplete state
  let showSuggestions = $state(false);
  let highlightedIndex = $state(-1);
  let tagsInputEl: HTMLInputElement | undefined = $state();

  // Parse existing tags from the comma-separated input
  function parseTags(input: string): string[] {
    return input.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  // Get the current tag segment being typed (from last comma to cursor)
  function getCurrentSegment(input: string, cursorPos: number): { text: string; start: number } {
    const beforeCursor = input.slice(0, cursorPos);
    const lastComma = beforeCursor.lastIndexOf(',');
    const start = lastComma + 1;
    const text = beforeCursor.slice(start).trimStart();
    return { text, start };
  }

  // Compute suggestions based on current input
  function computeSuggestions(input: string, cursorPos: number): string[] {
    if (availableTags.length === 0) return [];
    const { text } = getCurrentSegment(input, cursorPos);
    if (text.length === 0) return [];
    const existing = new Set(parseTags(input).map(t => t.toLowerCase()));
    const query = text.toLowerCase();
    return availableTags.filter(tag => {
      const lower = tag.toLowerCase();
      return lower.includes(query) && !existing.has(lower);
    });
  }

  let suggestions = $state<string[]>([]);

  function handleTagsInput() {
    if (!tagsInputEl) return;
    suggestions = computeSuggestions(tags, tagsInputEl.selectionStart ?? tags.length);
    showSuggestions = suggestions.length > 0;
    highlightedIndex = -1;
  }

  function handleTagsKeydown(event: KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % suggestions.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightedIndex = highlightedIndex <= 0 ? suggestions.length - 1 : highlightedIndex - 1;
    } else if ((event.key === 'Enter' || event.key === 'Tab') && highlightedIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
    } else if (event.key === 'Escape') {
      showSuggestions = false;
    }
  }

  function selectSuggestion(tag: string) {
    if (!tagsInputEl) return;
    const cursorPos = tagsInputEl.selectionStart ?? tags.length;
    const beforeCursor = tags.slice(0, cursorPos);
    const afterCursor = tags.slice(cursorPos);
    const lastComma = beforeCursor.lastIndexOf(',');
    const prefix = lastComma >= 0 ? beforeCursor.slice(0, lastComma + 1) + ' ' : '';
    tags = prefix + tag + ', ' + afterCursor.trimStart();
    showSuggestions = false;
    highlightedIndex = -1;
    // Refocus and place cursor after the inserted tag
    requestAnimationFrame(() => {
      if (tagsInputEl) {
        tagsInputEl.focus();
        const newPos = (prefix + tag + ', ').length;
        tagsInputEl.setSelectionRange(newPos, newPos);
      }
    });
  }

  function handleTagsBlur() {
    // Delay to allow click on suggestion to register
    setTimeout(() => { showSuggestions = false; }, 150);
  }
</script>

<div class="form-group">
  <label for="{prefix}title">Title</label>
  <input
    id="{prefix}title"
    type="text"
    bind:value={title}
    placeholder="Task title"
    {disabled}
  />
</div>
<div class="form-group">
  <label for="{prefix}theme">Theme</label>
  <select id="{prefix}theme" bind:value={themeId} {disabled}>
    {#each themes as theme (theme.id)}
      <option value={theme.id}>{theme.name}</option>
    {/each}
  </select>
</div>
<div class="form-group">
  <label for="{prefix}description">Description</label>
  <textarea
    id="{prefix}description"
    bind:value={description}
    placeholder="Enter task description"
    rows="2"
    {disabled}
  ></textarea>
</div>
<div class="form-group tags-group">
  <label for="{prefix}tags">Tags (comma-separated)</label>
  <div class="tags-input-wrapper">
    <input
      id="{prefix}tags"
      type="text"
      bind:value={tags}
      bind:this={tagsInputEl}
      placeholder="e.g. urgent, backend, review"
      {disabled}
      oninput={handleTagsInput}
      onkeydown={handleTagsKeydown}
      onblur={handleTagsBlur}
      role="combobox"
      aria-expanded={showSuggestions}
      aria-controls="{prefix}tags-listbox"
      aria-autocomplete="list"
      aria-activedescendant={highlightedIndex >= 0 ? `${prefix}tag-option-${highlightedIndex}` : undefined}
      autocomplete="off"
    />
    {#if showSuggestions && suggestions.length > 0}
      <ul
        class="suggestions-dropdown"
        id="{prefix}tags-listbox"
        role="listbox"
        aria-label="Tag suggestions"
      >
        {#each suggestions as suggestion, i (suggestion)}
          <li
            id="{prefix}tag-option-{i}"
            class="suggestion-item"
            class:highlighted={i === highlightedIndex}
            role="option"
            aria-selected={i === highlightedIndex}
            onmousedown={() => selectSuggestion(suggestion)}
          >
            {suggestion}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label for="{prefix}due-date">Due Date</label>
    <input
      id="{prefix}due-date"
      type="date"
      bind:value={dueDate}
      {disabled}
    />
  </div>
  <div class="form-group">
    <label for="{prefix}promotion-date">Promotion Date</label>
    <input
      id="{prefix}promotion-date"
      type="date"
      bind:value={promotionDate}
      {disabled}
    />
  </div>
</div>

<style>
  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
    margin-bottom: 0.375rem;
  }

  .form-group input[type="text"],
  .form-group input[type="date"],
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    font-size: 0.875rem;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
  }

  .form-group input[type="text"]:focus,
  .form-group input[type="date"]:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary-600);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  /* Tag autocomplete styles */
  .tags-input-wrapper {
    position: relative;
  }

  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 0;
    padding: 0.25rem 0;
    list-style: none;
    background: white;
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 10;
    max-height: 160px;
    overflow-y: auto;
  }

  .suggestion-item {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: var(--color-gray-700);
    cursor: pointer;
  }

  .suggestion-item:hover,
  .suggestion-item.highlighted {
    background-color: var(--color-primary-50, #eff6ff);
    color: var(--color-primary-700, #1d4ed8);
  }
</style>
