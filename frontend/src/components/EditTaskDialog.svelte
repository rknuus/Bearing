<script lang="ts">
  /**
   * EditTaskDialog Component
   *
   * A modal dialog for editing task properties: title, description, priority,
   * tags, due date, and promotion date. Follows the same modal pattern as the
   * create dialog in EisenKanView.
   */

  import type { Task } from '../lib/wails-mock';

  interface Props {
    task: Task | null;
    onSave: (updatedTask: Task) => Promise<void>;
    onCancel: () => void;
  }

  let { task, onSave, onCancel }: Props = $props();

  // Form state
  let editTitle = $state('');
  let editDescription = $state('');
  let editPriority = $state('important-urgent');
  let editTags = $state('');
  let editDueDate = $state('');
  let editPromotionDate = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state('');

  // Populate form when task changes
  $effect(() => {
    if (task) {
      editTitle = task.title;
      editDescription = task.description ?? '';
      editPriority = task.priority;
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
        description: editDescription.trim() || undefined,
        priority: editPriority,
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

      <div class="form-group">
        <label for="edit-task-title">Title</label>
        <input
          id="edit-task-title"
          type="text"
          bind:value={editTitle}
          placeholder="Enter task title"
        />
      </div>

      <div class="form-group">
        <label for="edit-task-description">Description</label>
        <textarea
          id="edit-task-description"
          bind:value={editDescription}
          placeholder="Enter task description"
          rows="3"
        ></textarea>
      </div>

      <div class="form-group" role="radiogroup" aria-labelledby="edit-priority-group-label">
        <span id="edit-priority-group-label" class="group-label">Priority (Eisenhower Matrix)</span>
        <div class="priority-options">
          <label class="priority-option">
            <input type="radio" bind:group={editPriority} value="important-urgent" />
            <span class="priority-label q1">Q1 - Important & Urgent</span>
          </label>
          <label class="priority-option">
            <input type="radio" bind:group={editPriority} value="important-not-urgent" />
            <span class="priority-label q2">Q2 - Important, Not Urgent</span>
          </label>
          <label class="priority-option">
            <input type="radio" bind:group={editPriority} value="not-important-urgent" />
            <span class="priority-label q3">Q3 - Not Important, Urgent</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="edit-task-tags">Tags (comma-separated)</label>
        <input
          id="edit-task-tags"
          type="text"
          bind:value={editTags}
          placeholder="e.g. urgent, backend, review"
        />
      </div>

      <div class="form-group">
        <label for="edit-task-due-date">Due Date</label>
        <input
          id="edit-task-due-date"
          type="date"
          bind:value={editDueDate}
        />
      </div>

      <div class="form-group">
        <label for="edit-task-promotion-date">Promotion Date</label>
        <input
          id="edit-task-promotion-date"
          type="date"
          bind:value={editPromotionDate}
        />
      </div>

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

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label,
  .form-group .group-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.375rem;
  }

  .form-group input[type="text"],
  .form-group input[type="date"],
  .form-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
  }

  .form-group input[type="text"]:focus,
  .form-group input[type="date"]:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
  }

  .priority-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .priority-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .priority-option input[type="radio"] {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .priority-label {
    font-size: 0.875rem;
    color: #374151;
  }

  .priority-label.q1 {
    color: #dc2626;
  }

  .priority-label.q2 {
    color: #2563eb;
  }

  .priority-label.q3 {
    color: #f59e0b;
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
