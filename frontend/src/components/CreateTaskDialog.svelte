<script lang="ts">
  /**
   * CreateTaskDialog Component
   *
   * A dialog for batch-creating tasks using an Eisenhower matrix.
   * Tasks are added directly to a priority quadrant via color-coded buttons.
   * All quadrant tasks are created via the API on commit; unsaved tasks
   * persist as drafts across dialog close and app restart.
   */

  import { onMount, onDestroy, untrack } from 'svelte';
  import EisenhowerQuadrant, { type PendingTask } from './EisenhowerQuadrant.svelte';
  import TaskFormFields from './TaskFormFields.svelte';
  import { Dialog, Button, ErrorBanner, TagEditor } from '../lib/components';
  import { getBindings, extractError } from '../lib/utils/bindings';

  import type { LifeTheme, Task } from '../lib/wails-mock';

  type QuadrantId = 'important-urgent' | 'important-not-urgent' | 'not-important-urgent';

  interface Props {
    open: boolean;
    themes: LifeTheme[];
    availableTags?: string[];
    onDone: () => void;
    onClose: () => void;
    createTask: (title: string, themeId: string, priority: string, description: string, tags: string) => Promise<Task>;
  }

  let { open, themes, availableTags = [], onDone, onClose, createTask }: Props = $props();

  // Quadrant configuration
  const quadrants: { id: QuadrantId; title: string; color: string; priority: string }[] = [
    { id: 'important-urgent', title: 'Important & Urgent', color: '#ef4444', priority: 'important-urgent' },
    { id: 'not-important-urgent', title: 'Not Important & Urgent', color: '#f59e0b', priority: 'not-important-urgent' },
    { id: 'important-not-urgent', title: 'Important & Not Urgent', color: '#3b82f6', priority: 'important-not-urgent' },
  ];

  // State
  let tasksByQuadrant = $state<Record<QuadrantId, PendingTask[]>>({
    'important-urgent': [],
    'important-not-urgent': [],
    'not-important-urgent': [],
  });
  let newTaskTitle = $state('');
  let newTaskDescription = $state('');
  let newTaskTags = $state<string[]>([]);
  let selectedThemeId = $state('');
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);
  let nextId = $state(1);

  // Edit pending task state
  let editingPendingTask = $state<PendingTask | null>(null);
  let editTitle = $state('');
  let editThemeId = $state('');
  let editDescription = $state('');
  let editTags = $state<string[]>([]);

  const emptyQuadrants: Record<QuadrantId, PendingTask[]> = {
    'important-urgent': [],
    'important-not-urgent': [],
    'not-important-urgent': [],
  };

  // Derive nextId from the highest pending-N id across all quadrants
  function deriveNextId(quadrants: Record<QuadrantId, PendingTask[]>): number {
    let max = 0;
    for (const tasks of Object.values(quadrants)) {
      for (const task of tasks) {
        const match = task.id.match(/^pending-(\d+)$/);
        if (match) max = Math.max(max, parseInt(match[1], 10));
      }
    }
    return max + 1;
  }

  // Drag-and-drop cancel state
  let isDragging = $state(false);
  let dragCancelled = $state(false);
  let preDragSnapshot: Record<QuadrantId, PendingTask[]> | null = null;

  // Escape key handler: cancel active pointer drag inside the dialog
  function handleEscapeDuringDrag(event: KeyboardEvent) {
    if (event.key === 'Escape' && isDragging) {
      dragCancelled = true;
      event.stopPropagation();
      event.preventDefault();
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleEscapeDuringDrag, { capture: true });
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleEscapeDuringDrag, { capture: true });
  });

  function handleDragStart() {
    isDragging = true;
    // Snapshot current state so we can restore synchronously on cancel.
    // tasksByQuadrant is modified during drag by consider/finalize events,
    // so we need a copy of the pre-drag state.
    preDragSnapshot = {
      'important-urgent': [...tasksByQuadrant['important-urgent']],
      'important-not-urgent': [...tasksByQuadrant['important-not-urgent']],
      'not-important-urgent': [...tasksByQuadrant['not-important-urgent']],
    };
  }

  function handleDragEnd() {
    isDragging = false;
    if (dragCancelled) {
      if (preDragSnapshot) {
        tasksByQuadrant = preDragSnapshot;
        preDragSnapshot = null;
      }
      queueMicrotask(() => { dragCancelled = false; });
      return;
    }
    preDragSnapshot = null;
  }

  async function saveDrafts() {
    try {
      await getBindings().SaveTaskDrafts(JSON.stringify(tasksByQuadrant));
    } catch {
      // Drafts are ephemeral — silently ignore save errors
    }
  }

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

  // Load drafts when dialog opens, reset form fields
  $effect(() => {
    if (open) {
      untrack(() => {
        newTaskTitle = '';
        newTaskDescription = '';
        newTaskTags = [];
        isSubmitting = false;
        error = null;
        if (themes.length > 0) {
          selectedThemeId = themes[0].id;
        }
        // Load drafts asynchronously
        getBindings().LoadTaskDrafts().then((data: string) => {
          try {
            const parsed = JSON.parse(data);
            // Migrate legacy drafts where tags was a comma-separated string
            for (const tasks of Object.values(parsed) as PendingTask[][]) {
              for (const t of tasks) {
                if (typeof t.tags === 'string') {
                  t.tags = (t.tags as string).split(', ').filter(Boolean);
                }
              }
            }
            tasksByQuadrant = { ...emptyQuadrants, ...parsed };
          } catch {
            tasksByQuadrant = { ...emptyQuadrants };
          }
          nextId = deriveNextId(tasksByQuadrant);
        }).catch(() => {
          tasksByQuadrant = { ...emptyQuadrants };
          nextId = 1;
        });
      });
    }
  });

  // Total tasks across all priority quadrants
  const creatableTaskCount = $derived(
    tasksByQuadrant['important-urgent'].length +
    tasksByQuadrant['important-not-urgent'].length +
    tasksByQuadrant['not-important-urgent'].length
  );

  function handleAddTask(quadrantId: QuadrantId) {
    const title = newTaskTitle.trim();
    if (!title) return;

    const task: PendingTask = {
      id: `pending-${nextId}`,
      title,
      themeId: selectedThemeId,
      description: newTaskDescription.trim() || undefined,
      tags: newTaskTags.length > 0 ? [...newTaskTags] : undefined,
    };
    nextId++;
    tasksByQuadrant = {
      ...tasksByQuadrant,
      [quadrantId]: [...tasksByQuadrant[quadrantId], task],
    };
    newTaskTitle = '';
    newTaskDescription = '';
    newTaskTags = [];
  }

  function handleQuadrantTasksChange(quadrantId: QuadrantId, tasks: PendingTask[]) {
    if (dragCancelled) return;
    tasksByQuadrant = {
      ...tasksByQuadrant,
      [quadrantId]: tasks,
    };
  }

  async function handleDone() {
    isSubmitting = true;
    error = null;

    let created = 0;
    let total = 0;

    try {
      for (const quadrant of quadrants) {
        const tasks = tasksByQuadrant[quadrant.id];
        const remaining: PendingTask[] = [];
        for (const task of tasks) {
          total++;
          try {
            await createTask(task.title, task.themeId ?? selectedThemeId, quadrant.priority, task.description ?? '', task.tags ? task.tags.join(', ') : '');
            created++;
          } catch {
            remaining.push(task);
          }
        }
        tasksByQuadrant = { ...tasksByQuadrant, [quadrant.id]: remaining };
      }

      await saveDrafts();

      if (created === total) {
        onDone();
      } else {
        error = `${total - created} of ${total} tasks failed to create`;
        isSubmitting = false;
      }
    } catch (e) {
      error = extractError(e);
      isSubmitting = false;
    }
  }

  async function handleClose() {
    if (editingPendingTask) return;
    await saveDrafts();
    onClose();
  }

  function handlePendingTaskClick(task: PendingTask) {
    if (isDragging) return;
    editingPendingTask = task;
    editTitle = task.title;
    editThemeId = task.themeId ?? (themes.length > 0 ? themes[0].id : '');
    editDescription = task.description ?? '';
    editTags = task.tags ? [...task.tags] : [];
  }

  async function handlePendingTaskEditSave() {
    if (!editingPendingTask || !editTitle.trim()) return;
    const updatedTask: PendingTask = {
      id: editingPendingTask.id,
      title: editTitle.trim(),
      themeId: editThemeId,
      description: editDescription.trim() || undefined,
      tags: editTags.length > 0 ? [...editTags] : undefined,
    };
    for (const qId of Object.keys(tasksByQuadrant) as QuadrantId[]) {
      const idx = tasksByQuadrant[qId].findIndex(t => t.id === updatedTask.id);
      if (idx !== -1) {
        tasksByQuadrant = {
          ...tasksByQuadrant,
          [qId]: tasksByQuadrant[qId].map(t => t.id === updatedTask.id ? updatedTask : t),
        };
        break;
      }
    }
    editingPendingTask = null;
    await saveDrafts();
  }

  function handlePendingTaskEditCancel() {
    editingPendingTask = null;
  }

  async function handlePendingTaskDelete(quadrantId: QuadrantId, taskId: string) {
    tasksByQuadrant = {
      ...tasksByQuadrant,
      [quadrantId]: tasksByQuadrant[quadrantId].filter(t => t.id !== taskId),
    };
    await saveDrafts();
  }

  async function handleClearPrioritized() {
    tasksByQuadrant = {
      ...tasksByQuadrant,
      'important-urgent': [],
      'important-not-urgent': [],
      'not-important-urgent': [],
    };
    await saveDrafts();
  }

</script>

{#if open}
  <Dialog title="Create Tasks" id="create-dialog-title" maxWidth="700px" onclose={handleClose}>
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
        {themes}
        disabled={isSubmitting}
        idPrefix="new-task"
      />
      <div class="form-group">
        <label for="new-task-tags">Tags</label>
        <TagEditor
          tags={newTaskTags}
          {availableTags}
          onTagsChange={(t) => newTaskTags = t}
        />
      </div>
      <div class="add-buttons">
        {#each quadrants as q (q.id)}
          <button
            type="button"
            class="btn-add"
            style="background-color: {q.color};"
            onclick={() => handleAddTask(q.id)}
            disabled={isSubmitting || !newTaskTitle.trim()}
          >Stage to ⬇</button>
        {/each}
      </div>
    </fieldset>

    <!-- Eisenhower grid -->
    <div class="eisenhower-grid">
      {#each quadrants as q (q.id)}
        <EisenhowerQuadrant
          quadrantId={q.id}
          title={q.title}
          color={q.color}
          tasks={tasksByQuadrant[q.id]}
          {themes}
          onTasksChange={(tasks) => handleQuadrantTasksChange(q.id, tasks)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onTaskDblClick={handlePendingTaskClick}
          onTaskDelete={(taskId) => handlePendingTaskDelete(q.id, taskId)}
        />
      {/each}
    </div>

    {#if editingPendingTask}
      <Dialog title="Edit Task" id="edit-pending-dialog-title" onclose={handlePendingTaskEditCancel}>
        <TaskFormFields
          bind:title={editTitle}
          bind:themeId={editThemeId}
          bind:description={editDescription}
          {themes}
          idPrefix="edit-pending"
        />
        <div class="form-group">
          <label for="edit-pending-tags">Tags</label>
          <TagEditor
            tags={editTags}
            {availableTags}
            onTagsChange={(t) => { editTags = t; }}
          />
        </div>

        {#snippet actions()}
          <Button variant="secondary" onclick={handlePendingTaskEditCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onclick={handlePendingTaskEditSave}
            disabled={!editTitle.trim()}
          >
            Save
          </Button>
        {/snippet}
      </Dialog>
    {/if}

    {#snippet actions()}
      <div class="actions-left">
        <Button variant="secondary" onclick={handleClearPrioritized} disabled={isSubmitting || creatableTaskCount === 0}>
          Clear All
        </Button>
      </div>
      <Button variant="secondary" onclick={handleClose} disabled={isSubmitting}>
        Close
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

  .add-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .btn-add {
    flex: 1;
    padding: 0.5rem 1rem;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow:
      inset 3px 3px 0 rgba(255, 255, 255, 0.5),
      inset -3px -3px 0 rgba(0, 0, 0, 0.4);
  }

  .btn-add:hover:not(:disabled) {
    box-shadow:
      inset 3px 3px 0 rgba(255, 255, 255, 0.75),
      inset -3px -3px 0 rgba(0, 0, 0, 0.6);
  }

  .btn-add:active:not(:disabled) {
    box-shadow:
      inset -3px -3px 0 rgba(255, 255, 255, 0.5),
      inset 3px 3px 0 rgba(0, 0, 0, 0.4);
  }

  .btn-add:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .eisenhower-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1rem;
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

  .actions-left {
    display: flex;
    gap: var(--space-3);
    margin-right: auto;
  }
</style>
