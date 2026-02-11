<script lang="ts">
  /**
   * EditTaskDialog Component
   *
   * A modal dialog for editing task properties: title, theme, description,
   * tags, due date, and promotion date. Uses shared TaskFormFields component.
   */

  import type { Task, LifeTheme } from '../lib/wails-mock';
  import TaskFormFields from './TaskFormFields.svelte';

  interface Props {
    task: Task | null;
    themes: LifeTheme[];
    onSave: (updatedTask: Task) => Promise<void>;
    onCancel: () => void;
  }

  let { task, themes, onSave, onCancel }: Props = $props();

  // Form state
  let editTitle = $state('');
  let editThemeId = $state('');
  let editDescription = $state('');
  let editTags = $state('');
  let editDueDate = $state('');
  let editPromotionDate = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state('');

  // Populate form when task changes
  $effect(() => {
    if (task) {
      editTitle = task.title;
      editThemeId = task.themeId;
      editDescription = task.description ?? '';
      editTags = (task.tags ?? []).join(', ');
      editDueDate = task.dueDate ?? '';
      editPromotionDate = task.promotionDate ?? '';
      errorMessage = '';
    }
  });

  function parseTags(input: string): string[] {
    return input
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  async function handleSave() {
    if (!task || !editTitle.trim()) return;

    isSubmitting = true;
    errorMessage = '';

    try {
      const updatedTask: Task = {
        ...task,
        title: editTitle.trim(),
        themeId: editThemeId,
        description: editDescription.trim() || undefined,
        priority: task.priority,
        tags: parseTags(editTags),
        dueDate: editDueDate || undefined,
        promotionDate: editPromotionDate || undefined,
      };
      await onSave(updatedTask);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to save task';
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onCancel();
    }
  }
</script>

{#if task}
  <div
    class="dialog-overlay"
    onclick={onCancel}
    onkeydown={handleKeydown}
    role="presentation"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      class="dialog"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
      role="dialog"
      aria-labelledby="edit-dialog-title"
    >
      <h2 id="edit-dialog-title">Edit Task</h2>

      {#if errorMessage}
        <div class="error-area" role="alert">
          {errorMessage}
        </div>
      {/if}

      <TaskFormFields
        bind:title={editTitle}
        bind:themeId={editThemeId}
        bind:description={editDescription}
        bind:tags={editTags}
        bind:dueDate={editDueDate}
        bind:promotionDate={editPromotionDate}
        {themes}
        idPrefix="edit-task"
      />

      <div class="dialog-actions">
        <button type="button" class="btn-secondary" onclick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          class="btn-primary"
          onclick={handleSave}
          disabled={isSubmitting || !editTitle.trim()}
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .dialog {
    background-color: white;
    border-radius: 8px;
    padding: 1.5rem;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    max-height: 90vh;
    overflow-y: auto;
  }

  .dialog h2 {
    font-size: 1.25rem;
    color: #1f2937;
    margin: 0 0 1.5rem 0;
  }

  .error-area {
    padding: 0.75rem 1rem;
    background-color: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #991b1b;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .btn-secondary {
    padding: 0.5rem 1rem;
    background-color: white;
    color: #374151;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-secondary:hover {
    background-color: #f9fafb;
  }

  .btn-primary {
    padding: 0.5rem 1rem;
    background-color: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #1d4ed8;
  }

  .btn-primary:disabled {
    background-color: #93c5fd;
    cursor: not-allowed;
  }
</style>
