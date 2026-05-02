<script lang="ts">
  /**
   * TagEditor Component
   *
   * Reusable tag editing with pill toggles and autocomplete input.
   * Displays available tags as pill buttons (filled when selected, outline when not).
   * Provides a text input with autocomplete dropdown for filtering and adding new tags.
   */

  interface Props {
    /** Currently selected tags */
    tags: string[];
    /** All tags for pills + autocomplete */
    availableTags: string[];
    /** Callback when tags change */
    onTagsChange: (tags: string[]) => void;
    /** Input placeholder */
    placeholder?: string;
  }

  let {
    tags,
    availableTags,
    onTagsChange,
    placeholder = 'Add new tag...',
  }: Props = $props();

  // Extra tags created during this session (not in availableTags)
  let extraTags = $state<string[]>([]);

  let allKnownTags = $derived(
    [...new Set([...availableTags, ...extraTags])].sort()
  );

  // Autocomplete state
  let inputValue = $state('');
  let suggestions = $state<string[]>([]);
  let showSuggestions = $state(false);
  let highlightedIndex = $state(-1);

  // Inline error for reserved-name rejection (AD-3 in eisenkan-tag-deck epic).
  // Cleared on the next keystroke or successful commit.
  let errorMessage = $state('');

  // Reserved synthetic identifiers — display-only, never persisted as task tags.
  const RESERVED_TAG_NAMES = ['Untagged', 'All'] as const;

  function isReservedTagName(name: string): boolean {
    const lower = name.trim().toLowerCase();
    return RESERVED_TAG_NAMES.some(r => r.toLowerCase() === lower);
  }

  function reservedErrorFor(name: string): string {
    return `"${name.trim()}" is reserved and cannot be used as a tag.`;
  }

  function toggleTag(tag: string) {
    if (tags.includes(tag)) {
      onTagsChange(tags.filter(t => t !== tag));
      return;
    }
    // Defensive: a reserved name should never reach availableTags/extraTags,
    // but guard the toggle path so a leak from older data cannot persist.
    if (isReservedTagName(tag)) {
      errorMessage = reservedErrorFor(tag);
      return;
    }
    onTagsChange([...tags, tag]);
  }

  function computeSuggestions(input: string): string[] {
    const query = input.trim().toLowerCase();
    if (!query) return [];
    return allKnownTags.filter(tag =>
      tag.toLowerCase().includes(query) && !tags.includes(tag)
    );
  }

  function handleInput() {
    // Any keystroke clears stale reserved-name errors.
    errorMessage = '';
    const commaIdx = inputValue.indexOf(',');
    if (commaIdx !== -1) {
      const before = inputValue.slice(0, commaIdx);
      const after = inputValue.slice(commaIdx + 1);
      inputValue = before;
      addNewTag();
      inputValue = after.trimStart();
    }
    suggestions = computeSuggestions(inputValue);
    showSuggestions = suggestions.length > 0;
    highlightedIndex = -1;
  }

  function addNewTag() {
    const tag = inputValue.trim();
    if (!tag) {
      inputValue = '';
      showSuggestions = false;
      highlightedIndex = -1;
      return;
    }
    if (isReservedTagName(tag)) {
      errorMessage = reservedErrorFor(tag);
      // Keep the input value so the user can correct it.
      showSuggestions = false;
      highlightedIndex = -1;
      return;
    }
    if (!tags.includes(tag)) {
      onTagsChange([...tags, tag]);
      if (!availableTags.includes(tag) && !extraTags.includes(tag)) {
        extraTags = [...extraTags, tag];
      }
    }
    inputValue = '';
    showSuggestions = false;
    highlightedIndex = -1;
  }

  function selectSuggestion(tag: string) {
    if (!tags.includes(tag)) {
      onTagsChange([...tags, tag]);
    }
    inputValue = '';
    showSuggestions = false;
    highlightedIndex = -1;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (showSuggestions && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % suggestions.length;
        return;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlightedIndex = highlightedIndex <= 0 ? suggestions.length - 1 : highlightedIndex - 1;
        return;
      } else if ((event.key === 'Enter' || event.key === 'Tab') && highlightedIndex >= 0) {
        event.preventDefault();
        selectSuggestion(suggestions[highlightedIndex]);
        return;
      } else if (event.key === 'Escape') {
        showSuggestions = false;
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      addNewTag();
    }
  }

  function handleBlur() {
    addNewTag();
    setTimeout(() => { showSuggestions = false; }, 150);
  }
</script>

<div class="tag-editor">
  <div class="tag-pills">
    {#each allKnownTags as tag (tag)}
      <button
        type="button"
        class="tag-pill"
        class:active={tags.includes(tag)}
        onclick={() => toggleTag(tag)}
      >
        {tag}
      </button>
    {/each}
    {#each tags.filter(t => !allKnownTags.includes(t)) as tag (tag)}
      <button
        type="button"
        class="tag-pill active"
        onclick={() => toggleTag(tag)}
      >
        {tag}
      </button>
    {/each}
  </div>
  <div class="tag-input-wrapper">
    <input
      type="text"
      bind:value={inputValue}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onblur={handleBlur}
      {placeholder}
      class="tag-input"
      role="combobox"
      aria-expanded={showSuggestions}
      aria-controls="tag-editor-suggestions-listbox"
      aria-autocomplete="list"
      aria-activedescendant={highlightedIndex >= 0 ? `tag-editor-option-${highlightedIndex}` : undefined}
      autocomplete="off"
    />
    {#if showSuggestions && suggestions.length > 0}
      <ul
        class="tag-suggestions-dropdown"
        id="tag-editor-suggestions-listbox"
        role="listbox"
        aria-label="Tag suggestions"
      >
        {#each suggestions as suggestion, i (suggestion)}
          <li
            id="tag-editor-option-{i}"
            class="tag-suggestion-item"
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
  {#if errorMessage}
    <p class="tag-error" role="alert">{errorMessage}</p>
  {/if}
</div>

<style>
  .tag-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tag-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .tag-pill {
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-full, 9999px);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border: 1.5px solid var(--color-gray-300);
    background-color: transparent;
    color: var(--color-gray-600);
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  }

  .tag-pill:hover {
    background-color: var(--color-gray-100);
  }

  .tag-pill.active {
    background-color: var(--color-primary-600);
    color: white;
    border-color: var(--color-primary-600);
  }

  .tag-pill.active:hover {
    background-color: var(--color-primary-700);
    border-color: var(--color-primary-700);
  }

  .tag-input-wrapper {
    position: relative;
  }

  .tag-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
    box-sizing: border-box;
  }

  .tag-input:focus {
    outline: none;
    border-color: var(--color-primary-600);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }

  .tag-suggestions-dropdown {
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

  .tag-suggestion-item {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: var(--color-gray-700);
    cursor: pointer;
  }

  .tag-suggestion-item:hover,
  .tag-suggestion-item.highlighted {
    background-color: var(--color-primary-50, #eff6ff);
    color: var(--color-primary-700, #1d4ed8);
  }

  .tag-error {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-error-600, #dc2626);
  }
</style>
