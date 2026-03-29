<script lang="ts">
  /**
   * TaskFormFields Component
   *
   * Shared form fields used by both CreateTaskDialog and EditTaskDialog.
   * Renders title, theme, and description fields with a Markdown/Preview toggle.
   * Tags are handled separately via the TagEditor component.
   */

  import { tick, untrack } from 'svelte';
  import type { LifeTheme } from '../lib/wails-mock';
  import { renderInlineMarkdown, renderMarkdown } from '../lib/utils/markdown';

  interface Props {
    title: string;
    themeId: string;
    description: string;
    themes: LifeTheme[];
    disabled?: boolean;
    idPrefix?: string;
    focusTrigger?: number;
  }

  let {
    title = $bindable(),
    themeId = $bindable(),
    description = $bindable(),
    themes,
    disabled = false,
    idPrefix = '',
    focusTrigger = 0,
  }: Props = $props();

  const prefix = $derived(idPrefix ? `${idPrefix}-` : '');

  let titleInput = $state<HTMLInputElement | undefined>(undefined);
  let previewMode = $state(false);

  $effect(() => {
    if (focusTrigger > 0) {
      tick().then(() => titleInput?.focus());
    }
  });

  $effect(() => {
    const _ft = focusTrigger;
    untrack(() => { previewMode = false; });
  });
</script>

<div class="mode-tabs">
  <button
    type="button"
    class="mode-tab"
    class:active={!previewMode}
    onclick={() => { previewMode = false; }}
  >Markdown</button>
  <button
    type="button"
    class="mode-tab"
    class:active={previewMode}
    onclick={() => { previewMode = true; }}
  >Preview</button>
</div>

<div class="form-group">
  <label for="{prefix}title">Title</label>
  {#if previewMode}
    <div class="preview-field preview-title">
      {#if title.trim()}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
        {@html renderInlineMarkdown(title)}
      {:else}
        <span class="preview-placeholder">No title</span>
      {/if}
    </div>
  {:else}
    <input
      id="{prefix}title"
      type="text"
      bind:value={title}
      placeholder="Task title"
      {disabled}
      bind:this={titleInput}
    />
  {/if}
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
  {#if previewMode}
    <div class="preview-field preview-description markdown-preview">
      {#if description.trim()}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
        {@html renderMarkdown(description)}
      {:else}
        <span class="preview-placeholder">No description</span>
      {/if}
    </div>
  {:else}
    <textarea
      id="{prefix}description"
      bind:value={description}
      placeholder="Enter task description"
      rows="2"
      {disabled}
    ></textarea>
  {/if}
</div>
<style>
  .mode-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 0.75rem;
  }

  .mode-tab {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--color-gray-300);
    background: var(--color-gray-50);
    color: var(--color-gray-600);
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
  }

  .mode-tab:first-child {
    border-radius: 6px 0 0 6px;
  }

  .mode-tab:last-child {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }

  .mode-tab.active {
    background: var(--color-primary-600);
    color: white;
    border-color: var(--color-primary-600);
  }

  .mode-tab:hover:not(.active) {
    background: var(--color-gray-100);
  }

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
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary-600);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
  }

  .preview-field {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    font-size: 0.875rem;
    font-family: inherit;
    box-sizing: border-box;
    background: var(--color-gray-50);
  }

  .preview-title {
    min-height: 2.125rem;
    display: flex;
    align-items: center;
  }

  .preview-description {
    min-height: 3.5rem;
  }

  .preview-placeholder {
    color: var(--color-gray-400);
    font-style: italic;
  }

  /* Markdown preview content styles */
  .markdown-preview :global(h1),
  .markdown-preview :global(h2),
  .markdown-preview :global(h3),
  .markdown-preview :global(h4),
  .markdown-preview :global(h5),
  .markdown-preview :global(h6) {
    margin: 0.5rem 0 0.25rem;
    color: var(--color-gray-900);
    line-height: 1.3;
  }
  .markdown-preview :global(h1) { font-size: 1.25rem; }
  .markdown-preview :global(h2) { font-size: 1.125rem; }
  .markdown-preview :global(h3) { font-size: 1rem; }
  .markdown-preview :global(h4) { font-size: 0.875rem; }

  .markdown-preview :global(p) {
    margin: 0 0 0.5rem;
  }
  .markdown-preview :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-preview :global(ul),
  .markdown-preview :global(ol) {
    margin: 0 0 0.5rem;
    padding-left: 1.5rem;
  }

  .markdown-preview :global(li) {
    margin-bottom: 0.125rem;
  }

  .markdown-preview :global(a) {
    color: var(--color-primary-500);
    text-decoration: underline;
    cursor: pointer;
  }
  .markdown-preview :global(a:hover) {
    color: var(--color-primary-600);
  }

  .markdown-preview :global(blockquote) {
    margin: 0.5rem 0;
    padding: 0.25rem 0.75rem;
    border-left: 3px solid var(--color-primary-300);
    color: var(--color-gray-600);
    font-style: italic;
  }

  .markdown-preview :global(code) {
    background-color: var(--color-gray-100);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-size: 0.8125rem;
  }

  .markdown-preview :global(pre) {
    background-color: var(--color-gray-50);
    padding: 0.5rem;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .markdown-preview :global(pre code) {
    background-color: transparent;
    padding: 0;
  }

  .markdown-preview :global(strong) {
    font-weight: 600;
  }

  .markdown-preview :global(hr) {
    border: none;
    border-top: 1px solid var(--color-gray-200);
    margin: 0.75rem 0;
  }
</style>
