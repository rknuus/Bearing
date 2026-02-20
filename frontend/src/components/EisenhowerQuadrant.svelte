<script lang="ts">
  /**
   * EisenhowerQuadrant Component
   *
   * Displays a single quadrant of the Eisenhower matrix for CreateTaskDialog.
   * Supports drag-and-drop via svelte-dnd-action.
   */

  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import ThemeBadge from '../lib/components/ThemeBadge.svelte';
  import type { LifeTheme } from '../lib/wails-mock';
  import { getTheme, getThemeColor } from '../lib/utils/theme-helpers';
  import { priorityLabels } from '../lib/constants/priorities';
  import { formatDate } from '../lib/utils/date-format';

  /** Pending task not yet saved to the backend. */
  export interface PendingTask {
    id: string;
    title: string;
    themeId?: string;
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
    themes: LifeTheme[];
    onTasksChange: (tasks: PendingTask[]) => void;
    isStaging?: boolean;
  }

  let { quadrantId, title, color, tasks, themes, onTasksChange, isStaging = false }: Props = $props();

  const priorityLabel = $derived(priorityLabels[quadrantId] ?? '');
  const today = new Date().toISOString().split('T')[0];
  const todayDisplay = formatDate(today);

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
        style="--theme-color: {getThemeColor(themes, task.themeId)};"
      >
        <div class="task-header">
          <ThemeBadge color={getThemeColor(themes, task.themeId)} size="sm" />
          {#if priorityLabel}
            <span class="priority-badge" style="background-color: {color};">{priorityLabel}</span>
          {/if}
          {#if getTheme(themes, task.themeId)}
            <span class="theme-name">{getTheme(themes, task.themeId)?.name}</span>
          {/if}
        </div>
        <span class="task-title">{task.title}</span>
        <div class="task-footer">
          <span class="task-date">{todayDisplay}</span>
        </div>
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
    background-color: color-mix(in srgb, var(--quadrant-color) 8%, white);
    border: 1px solid var(--color-gray-200);
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
    border-left: 4px solid var(--theme-color, var(--color-gray-500));
    transition: box-shadow 0.2s;
  }

  .pending-task:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .task-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.375rem;
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

  .theme-name {
    font-size: 0.6875rem;
    color: var(--color-gray-500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-gray-800);
    line-height: 1.3;
  }

  .task-footer {
    margin-top: 0.375rem;
  }

  .task-date {
    font-size: 0.7rem;
    color: var(--color-gray-400);
  }

  .empty-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: 0.75rem;
    color: var(--color-gray-400);
    font-style: italic;
  }
</style>
