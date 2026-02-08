<script lang="ts">
  /**
   * EisenhowerQuadrant Component
   *
   * Displays a single quadrant of the Eisenhower matrix for CreateTaskDialog.
   * Supports drag-and-drop via svelte-dnd-action.
   */

  import { dndzone, type DndEvent } from 'svelte-dnd-action';

  /** Pending task not yet saved to the backend. */
  export interface PendingTask {
    id: string;
    title: string;
    description?: string;
    tags?: string;
    dueDate?: string;
    promotionDate?: string;
  }

  interface Props {
    quadrantId: string;
    title: string;
    color: string;
    tasks: PendingTask[];
    onTasksChange: (tasks: PendingTask[]) => void;
    isStaging?: boolean;
  }

  let { quadrantId, title, color, tasks, onTasksChange, isStaging = false }: Props = $props();

  function handleDndConsider(event: CustomEvent<DndEvent<PendingTask>>) {
    onTasksChange(event.detail.items);
  }

  function handleDndFinalize(event: CustomEvent<DndEvent<PendingTask>>) {
    onTasksChange(event.detail.items);
  }
</script>

<div
  class="quadrant"
  class:staging={isStaging}
  data-quadrant-id={quadrantId}
  data-testid="quadrant-{quadrantId}"
>
  <div class="quadrant-header">
    <span class="color-indicator" style="background-color: {color};"></span>
    <span class="quadrant-title">{title}</span>
    <span class="task-count">{tasks.length}</span>
  </div>
  <div
    class="task-list"
    use:dndzone={{ items: tasks, flipDurationMs: 200 }}
    onconsider={handleDndConsider}
    onfinalize={handleDndFinalize}
  >
    {#each tasks as task (task.id)}
      <div class="pending-task" data-testid="pending-task-{task.id}">
        <span class="task-title">{task.title}</span>
      </div>
    {/each}
    {#if tasks.length === 0 && isStaging}
      <div class="empty-hint">(New tasks appear here)</div>
    {/if}
  </div>
</div>

<style>
  .quadrant {
    display: flex;
    flex-direction: column;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    min-height: 120px;
  }

  .quadrant.staging {
    opacity: 0.75;
  }

  .quadrant-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background-color: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    border-radius: 6px 6px 0 0;
  }

  .color-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .quadrant-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: #374151;
    flex: 1;
  }

  .task-count {
    background-color: #9ca3af;
    color: white;
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.0625rem 0.375rem;
    border-radius: 9999px;
    min-width: 1.25rem;
    text-align: center;
  }

  .task-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    min-height: 60px;
  }

  .pending-task {
    padding: 0.375rem 0.625rem;
    background-color: white;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    cursor: grab;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .pending-task:hover {
    border-color: #9ca3af;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .task-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #1f2937;
  }

  .empty-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: 0.75rem;
    color: #9ca3af;
    font-style: italic;
  }
</style>
