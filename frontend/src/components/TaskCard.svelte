<script lang="ts">
  /**
   * TaskCard Component
   *
   * Renders a task card with priority badge, theme badge, title, tags, and
   * variant-specific footer actions. Variant is controlled by callback prop
   * presence: onDelete renders delete button, onArchive renders archive button,
   * onRestore renders restore button.
   */

  import { type TaskWithStatus, type LifeTheme } from '../lib/wails-mock';
  import { TagBadges } from '../lib/components';
  import { getTheme, getThemeColor } from '../lib/utils/theme-helpers';
  import { priorityLabels, priorityColors } from '../lib/constants/priorities';

  interface Props {
    task: TaskWithStatus;
    themes: LifeTheme[];
    ondblclick?: (e: MouseEvent) => void;
    oncontextmenu?: (e: MouseEvent) => void;
    onDelete?: () => void;
    onArchive?: () => void;
    onRestore?: () => void;
    onNavigateToTheme?: (themeId: string) => void;
    draggable?: boolean;
  }

  let {
    task,
    themes,
    ondblclick,
    oncontextmenu,
    onDelete,
    onArchive,
    onRestore,
    onNavigateToTheme,
    draggable = true,
  }: Props = $props();
</script>

<div
  class="task-card"
  class:not-draggable={!draggable}
  ondblclick={ondblclick}
  oncontextmenu={oncontextmenu}
  role="article"
  aria-label={task.title}
>
  <div class="task-header">
    <span class="priority-badge" style="background-color: {priorityColors[task.priority]};">
      {priorityLabels[task.priority]}
    </span>
    <button
      type="button"
      class="theme-badge"
      style="background-color: {getThemeColor(themes, task.themeId)};"
      onclick={(e) => { e.stopPropagation(); onNavigateToTheme?.(task.themeId); }}
      title="Go to theme"
    >
      {getTheme(themes, task.themeId)?.name ?? 'Unknown'}
    </button>
  </div>
  <h3 class="task-title">{task.title}</h3>
  <TagBadges tags={task.tags} />
  <div class="task-footer">
    {#if onDelete}
      <button
        type="button"
        class="delete-btn"
        onclick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Delete task"
      >
        🗑️
      </button>
    {/if}
    {#if onArchive}
      <button
        type="button"
        class="archive-btn"
        onclick={(e) => { e.stopPropagation(); onArchive(); }}
        aria-label="Archive task"
        title="Archive task"
      >
        ✅
      </button>
    {/if}
    {#if onRestore}
      <button
        type="button"
        class="restore-btn"
        onclick={() => onRestore()}
        title="Restore to done"
      >
        Restore
      </button>
    {/if}
  </div>
</div>

<style>
  .task-card {
    background-color: white;
    border-radius: 6px;
    padding: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: grab;
    transition: box-shadow 0.2s, transform 0.1s;
  }

  .task-card:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .task-card:active {
    cursor: grabbing;
    transform: rotate(2deg);
  }

  .task-card.not-draggable {
    cursor: default;
  }

  .task-card.not-draggable:hover {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .task-card.not-draggable:active {
    cursor: default;
    transform: none;
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

  .task-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-800);
    margin: 0 0 0.5rem 0;
    line-height: 1.3;
  }

  .task-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .theme-badge {
    font-size: 0.625rem;
    font-weight: 700;
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .theme-badge:hover {
    opacity: 0.85;
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--color-gray-400);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    border-radius: 4px;
    transition: color 0.2s, background-color 0.2s;
  }

  .delete-btn:hover {
    color: var(--color-error-600);
    background-color: var(--color-error-100);
  }

  .archive-btn {
    background: none;
    border: none;
    color: var(--color-gray-400);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    border-radius: 4px;
    transition: color 0.2s, background-color 0.2s;
  }

  .archive-btn:hover {
    color: var(--color-success-600, #16a34a);
    background-color: var(--color-success-100, #dcfce7);
  }

  .restore-btn {
    background: none;
    border: 1px solid var(--color-gray-300);
    color: var(--color-gray-500);
    font-size: 0.6875rem;
    cursor: pointer;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    transition: color 0.2s, background-color 0.2s;
  }

  .restore-btn:hover {
    color: var(--color-gray-700);
    background-color: var(--color-gray-300);
  }
</style>
