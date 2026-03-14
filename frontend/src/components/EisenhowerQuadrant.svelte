<script lang="ts">
  /**
   * EisenhowerQuadrant Component
   *
   * Displays a single quadrant of the Eisenhower matrix for CreateTaskDialog.
   * Supports drag-and-drop via svelte-dnd-action.
   */

  import { dndzone, TRIGGERS, SOURCES, type DndEvent } from 'svelte-dnd-action';
  import TagBadges from '../lib/components/TagBadges.svelte';

  import type { LifeTheme } from '../lib/wails-mock';
  import { getTheme, getThemeColor } from '../lib/utils/theme-helpers';
  import { priorityLabels } from '../lib/constants/priorities';


  /** Pending task not yet saved to the backend. */
  export interface PendingTask {
    id: string;
    title: string;
    themeId?: string;
    description?: string;
    tags?: string[];
  }

  interface Props {
    quadrantId: string;
    title: string;
    color: string;
    tasks: PendingTask[];
    themes: LifeTheme[];
    onTasksChange: (tasks: PendingTask[]) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onTaskDblClick?: (task: PendingTask) => void;
    onTaskDelete?: (taskId: string) => void;
  }

  let { quadrantId, title, color, tasks, themes, onTasksChange, onDragStart, onDragEnd, onTaskDblClick, onTaskDelete }: Props = $props();

  const priorityLabel = $derived(priorityLabels[quadrantId] ?? '');

  function handleDndConsider(event: CustomEvent<DndEvent<PendingTask>>) {
    const { trigger, source } = event.detail.info;
    if (trigger === TRIGGERS.DRAG_STARTED && source === SOURCES.POINTER) {
      onDragStart?.();
    }
    onTasksChange(event.detail.items);
  }

  function handleDndFinalize(event: CustomEvent<DndEvent<PendingTask>>) {
    onDragEnd?.();
    onTasksChange(event.detail.items);
  }
</script>

<div
  class="quadrant"
  style="--quadrant-color: {color};"
  data-quadrant-id={quadrantId}
  data-testid="quadrant-{quadrantId}"
>
  <div class="quadrant-header" style="background-color: {color};">
    <span class="quadrant-title">{title}</span>
    <span class="task-count">{tasks.length}</span>
  </div>
  <div
    class="task-list"
    use:dndzone={{ items: tasks, flipDurationMs: 200, type: 'eisenhower' }}
    onconsider={handleDndConsider}
    onfinalize={handleDndFinalize}
  >
    {#each tasks as task (task.id)}
      <div
        class="pending-task"
        data-testid="pending-task-{task.id}"
        ondblclick={() => onTaskDblClick?.(task)}
        role="article"
      >
        <div class="task-header">
          {#if priorityLabel}
            <span class="priority-badge" style="background-color: {color};">{priorityLabel}</span>
          {/if}
          {#if getTheme(themes, task.themeId)}
            <span
              class="theme-badge"
              style="background-color: {getThemeColor(themes, task.themeId)};"
            >
              {getTheme(themes, task.themeId)?.name}
            </span>
          {/if}
        </div>
        <h3 class="task-title">{task.title}</h3>
        <TagBadges tags={task.tags} />
        {#if onTaskDelete}
          <div class="task-footer">
            <button
              class="delete-btn"
              onclick={(e) => { e.stopPropagation(); onTaskDelete(task.id); }}
              aria-label="Remove task"
            >🗑️</button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .quadrant {
    display: flex;
    flex-direction: column;
    background-color: color-mix(in srgb, var(--quadrant-color) 8%, white);
    border: 1px solid var(--color-gray-200);
    border-radius: 6px;
    min-height: 160px;
  }

  .quadrant-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px 6px 0 0;
  }

  .quadrant-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: white;
    flex: 1;
  }

  .task-count {
    background-color: rgba(255, 255, 255, 0.25);
    color: white;
    font-size: 0.6875rem;
    font-weight: 600;
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
    padding: 0.75rem;
    background-color: white;
    border-radius: 6px;
    cursor: grab;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.2s;
  }

  .pending-task:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .task-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .priority-badge {
    font-size: 0.625rem;
    font-weight: 700;
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .theme-badge {
    font-size: 0.625rem;
    font-weight: 700;
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .task-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--color-gray-400);
    font-size: 0.875rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.25rem;
    border-radius: 4px;
    transition: color 0.15s, background-color 0.15s;
  }

  .delete-btn:hover {
    color: var(--color-error-600);
    background-color: var(--color-error-100, rgba(239, 68, 68, 0.1));
  }

  .task-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-gray-800);
    margin: 0 0 0.5rem 0;
    line-height: 1.3;
  }


</style>
