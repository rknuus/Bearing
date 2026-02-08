<script lang="ts">
  /**
   * CreateTaskDialog Component
   *
   * A dialog for batch-creating tasks using an Eisenhower matrix.
   * Tasks are entered into a staging quadrant (Q4) and dragged to priority
   * quadrants before committing. Only Q1/Q2/Q3 tasks are created via the API;
   * Q4 (staging) tasks are discarded on Done.
   */

  import { untrack } from 'svelte';
  import EisenhowerQuadrant, { type PendingTask } from './EisenhowerQuadrant.svelte';
  import type { LifeTheme, Task } from '../lib/wails-mock';

  type QuadrantId = 'important-urgent' | 'important-not-urgent' | 'not-important-urgent' | 'staging';

  interface Props {
    open: boolean;
    themes: LifeTheme[];
    onDone: () => void;
    onCancel: () => void;
    createTask: (title: string, themeId: string, dayDate: string, priority: string, description: string, tags: string, dueDate: string, promotionDate: string) => Promise<Task>;
  }

  let { open, themes, onDone, onCancel, createTask }: Props = $props();

  // Quadrant configuration
  const quadrants: { id: QuadrantId; title: string; color: string; priority: string; isStaging: boolean }[] = [
    { id: 'important-urgent', title: 'Q1 - Important & Urgent', color: '#dc2626', priority: 'important-urgent', isStaging: false },
    { id: 'important-not-urgent', title: 'Q2 - Important, Not Urgent', color: '#2563eb', priority: 'important-not-urgent', isStaging: false },
    { id: 'not-important-urgent', title: 'Q3 - Urgent, Not Important', color: '#f59e0b', priority: 'not-important-urgent', isStaging: false },
    { id: 'staging', title: 'Q4 - Staging', color: '#6b7280', priority: '', isStaging: true },
  ];

  // State
  let tasksByQuadrant = $state<Record<QuadrantId, PendingTask[]>>({
    'important-urgent': [],
    'important-not-urgent': [],
    'not-important-urgent': [],
    'staging': [],
  });
  let newTaskTitle = $state('');
  let newTaskDescription = $state('');
  let newTaskTags = $state('');
  let newTaskDueDate = $state('');
  let newTaskPromotionDate = $state('');
  let selectedThemeId = $state('');
  let dayDate = $state(new Date().toISOString().split('T')[0]);
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);
  let nextId = $state(1);

  // Set default theme when themes change
  $effect(() => {
    if (themes.length > 0) {
      untrack(() => {
        if (!selectedThemeId) {
          selectedThemeId = themes[0].id;
        }
      });
    }
  });

  // Reset state when dialog opens
  $effect(() => {
    if (open) {
      untrack(() => {
        tasksByQuadrant = {
          'important-urgent': [],
          'important-not-urgent': [],
          'not-important-urgent': [],
          'staging': [],
        };
        newTaskTitle = '';
        newTaskDescription = '';
        newTaskTags = '';
        newTaskDueDate = '';
        newTaskPromotionDate = '';
        dayDate = new Date().toISOString().split('T')[0];
        isSubmitting = false;
        error = null;
        nextId = 1;
        if (themes.length > 0) {
          selectedThemeId = themes[0].id;
        }
      });
    }
  });

  // Total tasks across Q1/Q2/Q3 (non-staging)
  const creatableTaskCount = $derived(
    tasksByQuadrant['important-urgent'].length +
    tasksByQuadrant['important-not-urgent'].length +
    tasksByQuadrant['not-important-urgent'].length
  );

  function handleAddTask() {
    const title = newTaskTitle.trim();
    if (!title) return;

    const task: PendingTask = {
      id: `pending-${nextId}`,
      title,
      themeId: selectedThemeId,
      description: newTaskDescription.trim() || undefined,
      tags: newTaskTags.trim() || undefined,
      dueDate: newTaskDueDate || undefined,
      promotionDate: newTaskPromotionDate || undefined,
    };
    nextId++;
    tasksByQuadrant = {
      ...tasksByQuadrant,
      staging: [...tasksByQuadrant.staging, task],
    };
    newTaskTitle = '';
    newTaskDescription = '';
    newTaskTags = '';
    newTaskDueDate = '';
    newTaskPromotionDate = '';
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddTask();
    }
  }

  function handleQuadrantTasksChange(quadrantId: QuadrantId, tasks: PendingTask[]) {
    tasksByQuadrant = {
      ...tasksByQuadrant,
      [quadrantId]: tasks,
    };
  }

  async function handleDone() {
    isSubmitting = true;
    error = null;

    try {
      // Create tasks from Q1, Q2, Q3 sequentially; skip Q4 (staging)
      for (const quadrant of quadrants) {
        if (quadrant.isStaging) continue;

        const tasks = tasksByQuadrant[quadrant.id];
        for (const task of tasks) {
          await createTask(task.title, task.themeId ?? selectedThemeId, dayDate, quadrant.priority, task.description ?? '', task.tags ?? '', task.dueDate ?? '', task.promotionDate ?? '');
        }
      }

      onDone();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create tasks';
      isSubmitting = false;
    }
  }

  function handleCancel() {
    onCancel();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog-overlay" onclick={handleCancel} role="presentation">
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="create-dialog-title">
      <h2 id="create-dialog-title">Create Tasks</h2>

      {#if error}
        <div class="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onclick={() => error = null}>Dismiss</button>
        </div>
      {/if}

      <!-- Day date picker -->
      <div class="form-group">
        <label for="day-date-input">Day Date</label>
        <input
          id="day-date-input"
          type="date"
          bind:value={dayDate}
          disabled={isSubmitting}
        />
      </div>

      <!-- Task entry form -->
      <fieldset class="task-entry" disabled={isSubmitting}>
        <legend>New Task</legend>
        <div class="form-group">
          <label for="new-task-input">Title</label>
          <input
            id="new-task-input"
            type="text"
            bind:value={newTaskTitle}
            onkeydown={handleKeyDown}
            placeholder="Enter task title, press Enter to add"
            disabled={isSubmitting}
          />
        </div>
        <div class="form-group">
          <label for="theme-select">Theme</label>
          <select id="theme-select" bind:value={selectedThemeId} disabled={isSubmitting}>
            {#each themes as theme (theme.id)}
              <option value={theme.id}>{theme.name}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label for="new-task-description">Description</label>
          <textarea
            id="new-task-description"
            bind:value={newTaskDescription}
            placeholder="Enter task description"
            rows="2"
            disabled={isSubmitting}
          ></textarea>
        </div>
        <div class="form-group">
          <label for="new-task-tags">Tags (comma-separated)</label>
          <input
            id="new-task-tags"
            type="text"
            bind:value={newTaskTags}
            placeholder="e.g. urgent, backend, review"
            disabled={isSubmitting}
          />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="new-task-due-date">Due Date</label>
            <input
              id="new-task-due-date"
              type="date"
              bind:value={newTaskDueDate}
              disabled={isSubmitting}
            />
          </div>
          <div class="form-group">
            <label for="new-task-promotion-date">Promotion Date</label>
            <input
              id="new-task-promotion-date"
              type="date"
              bind:value={newTaskPromotionDate}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </fieldset>

      <!-- Eisenhower grid -->
      <div class="eisenhower-grid" data-testid="eisenhower-grid">
        <div class="grid-row">
          {#each quadrants.slice(0, 2) as q (q.id)}
            <EisenhowerQuadrant
              quadrantId={q.id}
              title={q.title}
              color={q.color}
              tasks={tasksByQuadrant[q.id]}
              onTasksChange={(tasks) => handleQuadrantTasksChange(q.id, tasks)}
              isStaging={q.isStaging}
            />
          {/each}
        </div>
        <div class="grid-row">
          {#each quadrants.slice(2, 4) as q (q.id)}
            <EisenhowerQuadrant
              quadrantId={q.id}
              title={q.title}
              color={q.color}
              tasks={tasksByQuadrant[q.id]}
              onTasksChange={(tasks) => handleQuadrantTasksChange(q.id, tasks)}
              isStaging={q.isStaging}
            />
          {/each}
        </div>
      </div>

      {#if tasksByQuadrant.staging.length > 0}
        <p class="staging-hint">
          Tasks in staging (Q4) will be discarded. Drag them to a priority quadrant to save them.
        </p>
      {/if}

      <!-- Actions -->
      <div class="dialog-actions">
        <button type="button" class="btn-secondary" onclick={handleCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button
          type="button"
          class="btn-primary"
          onclick={handleDone}
          disabled={isSubmitting || creatableTaskCount === 0}
        >
          {isSubmitting ? 'Creating...' : 'Done'}
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
    max-width: 700px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .dialog h2 {
    font-size: 1.25rem;
    color: #1f2937;
    margin: 0 0 1rem 0;
  }

  .error-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #991b1b;
    margin-bottom: 1rem;
  }

  .error-banner button {
    background: none;
    border: none;
    color: #991b1b;
    cursor: pointer;
    font-weight: 500;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.375rem;
  }

  .form-group input[type="text"],
  .form-group input[type="date"],
  .form-group textarea,
  .form-group select {
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
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
  }

  .task-entry {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .task-entry legend {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    padding: 0 0.25rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .eisenhower-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .grid-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .staging-hint {
    margin: 0 0 1rem 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    color: #92400e;
    background-color: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: 4px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1rem;
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

  .btn-secondary:hover:not(:disabled) {
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

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
