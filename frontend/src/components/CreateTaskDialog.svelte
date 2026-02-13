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
  import TaskFormFields from './TaskFormFields.svelte';
  import { Dialog, Button, ErrorBanner } from '../lib/components';
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
    { id: 'important-urgent', title: 'Q1 - Important & Urgent', color: '#ef4444', priority: 'important-urgent', isStaging: false },
    { id: 'not-important-urgent', title: 'Q2 - Not Important & Urgent', color: '#f59e0b', priority: 'not-important-urgent', isStaging: false },
    { id: 'important-not-urgent', title: 'Q3 - Important & Not Urgent', color: '#3b82f6', priority: 'important-not-urgent', isStaging: false },
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
      const today = new Date().toISOString().split('T')[0];
      for (const quadrant of quadrants) {
        if (quadrant.isStaging) continue;

        const tasks = tasksByQuadrant[quadrant.id];
        for (const task of tasks) {
          await createTask(task.title, task.themeId ?? selectedThemeId, today, quadrant.priority, task.description ?? '', task.tags ?? '', task.dueDate ?? '', task.promotionDate ?? '');
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
  <Dialog title="Create Tasks" id="create-dialog-title" maxWidth="700px" onclose={handleCancel}>
    {#if error}
      <ErrorBanner message={error} ondismiss={() => error = null} />
    {/if}

    <!-- Task entry form -->
    <fieldset class="task-entry" disabled={isSubmitting}>
      <legend>New Task</legend>
      <TaskFormFields
        bind:title={newTaskTitle}
        bind:themeId={selectedThemeId}
        bind:description={newTaskDescription}
        bind:tags={newTaskTags}
        bind:dueDate={newTaskDueDate}
        bind:promotionDate={newTaskPromotionDate}
        {themes}
        disabled={isSubmitting}
        idPrefix="new-task"
      />
      <button
        type="button"
        class="btn-add"
        onclick={handleAddTask}
        disabled={isSubmitting || !newTaskTitle.trim()}
      >Stage Task to Q4</button>
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
            {themes}
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
            {themes}
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

    {#snippet actions()}
      <Button variant="secondary" onclick={handleCancel} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onclick={handleDone}
        disabled={isSubmitting || creatableTaskCount === 0}
      >
        {isSubmitting ? 'Committing...' : 'Commit to Todo'}
      </Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .task-entry {
    border: 1px solid var(--color-gray-200);
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .task-entry legend {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
    padding: 0 0.25rem;
  }

  .btn-add {
    padding: 0.5rem 1rem;
    background-color: var(--color-success-600);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-add:hover:not(:disabled) {
    background-color: #047857;
  }

  .btn-add:disabled {
    background-color: #6ee7b7;
    cursor: not-allowed;
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
    background-color: var(--color-warning-100);
    border: 1px solid var(--color-warning-400);
    border-radius: 4px;
  }

</style>
