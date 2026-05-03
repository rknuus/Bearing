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
  import TaskActionMenu from './TaskActionMenu.svelte';

  interface TaskAction {
    label: string;
    onSelect: () => void;
  }

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
    /**
     * Optional list of actions to render in a three-dot menu in the card's
     * top-right corner. When undefined or empty, no menu is rendered and the
     * card layout is preserved as-is.
     */
    actions?: TaskAction[];
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
    actions,
  }: Props = $props();

  // svelte-dnd-action attaches mousedown/touchstart listeners directly on the
  // draggable container via addEventListener() and calls e.preventDefault()
  // inside its handler. preventDefault on mousedown suppresses the browser's
  // click-event generation, so the first click on a footer button is lost
  // (only the second one, after mouseup has cleared the dnd start tracker,
  // succeeds).
  //
  // Svelte 5's `onclick`/`onmousedown` attributes register *delegated*
  // listeners attached to the component's mount target — those run AFTER
  // native ancestor listeners have already seen the event during bubbling, so
  // calling `e.stopPropagation()` inside them is too late.
  //
  // The fix is to attach a *native* (non-delegated) listener directly to the
  // button via a Svelte action, intercepting mousedown/touchstart at the
  // source so the dnd container listener never sees them. Drag still works on
  // every other surface of the card.
  //
  // pointerdown is also stopped: even though dnd 0.9.x doesn't subscribe to
  // pointer events directly, browsers may still synthesise a follow-up
  // mousedown if the pointerdown bubbled to an ancestor — belt-and-braces.
  // The action is also applied to the move-menu slot wrapper to prevent the
  // "wobble" reported on issue #129: when the user clicked the three-dot
  // trigger, the inner button's mousedown leaked to the dnd-zone listener on
  // the card root, which registered a drag candidate and ran a brief
  // false-alarm cycle (mousedown + tiny mousemove + mouseup), visibly nudging
  // the card.
  function stopDragStart(node: HTMLElement) {
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener('mousedown', stop);
    node.addEventListener('touchstart', stop, { passive: true });
    node.addEventListener('pointerdown', stop);
    return {
      destroy() {
        node.removeEventListener('mousedown', stop);
        node.removeEventListener('touchstart', stop);
        node.removeEventListener('pointerdown', stop);
      },
    };
  }
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
    {#if task.themeId}
      <button
        type="button"
        class="theme-badge"
        style="background-color: {getThemeColor(themes, task.themeId)};"
        use:stopDragStart
        onclick={(e) => { e.stopPropagation(); onNavigateToTheme?.(task.themeId); }}
        title="Go to theme"
      >
        {getTheme(themes, task.themeId)?.name ?? 'Unknown'}
      </button>
    {/if}
    {#if actions && actions.length > 0}
      <div class="task-action-menu-slot" use:stopDragStart>
        <TaskActionMenu actions={actions} ariaLabel="Move task" />
      </div>
    {/if}
  </div>
  <h3 class="task-title">{task.title}</h3>
  <TagBadges tags={task.tags} />
  <div class="task-footer">
    {#if onDelete}
      <button
        type="button"
        class="delete-btn"
        use:stopDragStart
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
        use:stopDragStart
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
        use:stopDragStart
        onclick={(e) => { e.stopPropagation(); onRestore(); }}
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

  /*
   * Push the move-menu trigger to the far right of the header, separated
   * from the priority + theme badges by an auto margin so it never crowds
   * the existing badges.
   */
  .task-action-menu-slot {
    margin-left: auto;
    display: flex;
    align-items: center;
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
