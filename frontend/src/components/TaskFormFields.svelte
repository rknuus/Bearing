<script lang="ts">
  /**
   * TaskFormFields Component
   *
   * Shared form fields used by both CreateTaskDialog and EditTaskDialog.
   * Renders title, theme, description, tags, due date, and promotion date fields.
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
    disabled = false,
    idPrefix = '',
  }: Props = $props();

  const prefix = $derived(idPrefix ? `${idPrefix}-` : '');
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
<div class="form-group">
  <label for="{prefix}tags">Tags (comma-separated)</label>
  <input
    id="{prefix}tags"
    type="text"
    bind:value={tags}
    placeholder="e.g. urgent, backend, review"
    {disabled}
  />
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
</style>
