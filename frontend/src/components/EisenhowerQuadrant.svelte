<script lang="ts">
  /**
   * EisenhowerQuadrant Component
   *
   * Displays a single quadrant of the Eisenhower matrix for CreateTaskDialog.
   * Supports drag-and-drop via svelte-dnd-action.
   */

  import { SvelteSet } from 'svelte/reactivity';
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

  let expandedTaskIds = new SvelteSet<string>();

  function toggleExpanded(taskId: string) {
    if (expandedTaskIds.has(taskId)) {
      expandedTaskIds.delete(taskId);
    } else {
      expandedTaskIds.add(taskId);
    }
  }

  function updateTaskField(taskId: string, field: keyof PendingTask, value: string) {
    onTasksChange(tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t));
  }

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
        <div class="task-row">
          <span class="task-title">{task.title}</span>
          <button
            type="button"
            class="expand-toggle"
            data-testid="expand-toggle-{task.id}"
            onclick={() => toggleExpanded(task.id)}
            title={expandedTaskIds.has(task.id) ? 'Collapse details' : 'Expand details'}
          >{expandedTaskIds.has(task.id) ? '\u25B4' : '\u25BE'}</button>
        </div>
        {#if expandedTaskIds.has(task.id)}
          <div class="task-details" data-testid="task-details-{task.id}">
            <label>
              <span class="detail-label">Description</span>
              <textarea
                class="detail-input"
                data-testid="task-description-{task.id}"
                value={task.description ?? ''}
                oninput={(e) => updateTaskField(task.id, 'description', (e.target as HTMLTextAreaElement).value)}
                rows="2"
                placeholder="Description"
              ></textarea>
            </label>
            <label>
              <span class="detail-label">Tags</span>
              <input
                type="text"
                class="detail-input"
                data-testid="task-tags-{task.id}"
                value={task.tags ?? ''}
                oninput={(e) => updateTaskField(task.id, 'tags', (e.target as HTMLInputElement).value)}
                placeholder="comma-separated tags"
              />
            </label>
            <label>
              <span class="detail-label">Due Date</span>
              <input
                type="date"
                class="detail-input"
                data-testid="task-dueDate-{task.id}"
                value={task.dueDate ?? ''}
                oninput={(e) => updateTaskField(task.id, 'dueDate', (e.target as HTMLInputElement).value)}
              />
            </label>
            <label>
              <span class="detail-label">Promotion Date</span>
              <input
                type="date"
                class="detail-input"
                data-testid="task-promotionDate-{task.id}"
                value={task.promotionDate ?? ''}
                oninput={(e) => updateTaskField(task.id, 'promotionDate', (e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
        {/if}
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

  .task-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .task-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #1f2937;
    flex: 1;
  }

  .expand-toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.25rem;
    font-size: 0.75rem;
    color: #9ca3af;
    flex-shrink: 0;
    line-height: 1;
  }

  .expand-toggle:hover {
    color: #374151;
  }

  .task-details {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-top: 0.375rem;
    padding-top: 0.375rem;
    border-top: 1px solid #e5e7eb;
  }

  .task-details label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .detail-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: #6b7280;
  }

  .detail-input {
    width: 100%;
    padding: 0.25rem 0.375rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: inherit;
    box-sizing: border-box;
  }

  .detail-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  }

  textarea.detail-input {
    resize: vertical;
    min-height: 2rem;
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
