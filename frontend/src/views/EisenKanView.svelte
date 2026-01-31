<script lang="ts">
  /**
   * EisenKanView Component
   *
   * A Kanban board for short-term task execution using Eisenhower priority.
   * Tasks are auto-sorted in the Todo column by priority (Q1 -> Q2 -> Q3).
   * Theme colors are inherited from the assigned theme.
   */

  import { onMount } from 'svelte';
  import ThemeBadge from '../lib/components/ThemeBadge.svelte';
  import { mockAppBindings, type TaskWithStatus, type LifeTheme } from '../lib/wails-mock';

  // Props for cross-view navigation
  interface Props {
    onNavigateToTheme?: (themeId: string) => void;
    onNavigateToDay?: (date: string, themeId?: string) => void;
    filterThemeId?: string;
    filterDate?: string;
  }

  let { onNavigateToTheme, onNavigateToDay, filterThemeId, filterDate }: Props = $props();

  // Types
  type Task = TaskWithStatus;
  type Theme = LifeTheme;

  type ColumnStatus = 'todo' | 'doing' | 'done';

  // Priority order for sorting (lower = higher priority)
  const priorityOrder: Record<string, number> = {
    'important-urgent': 1,      // Q1 - Do first
    'important-not-urgent': 2,  // Q2 - Schedule
    'not-important-urgent': 3   // Q3 - Delegate
  };

  // Priority display labels
  const priorityLabels: Record<string, string> = {
    'important-urgent': 'Q1',
    'important-not-urgent': 'Q2',
    'not-important-urgent': 'Q3'
  };

  // Priority colors for badges
  const priorityColors: Record<string, string> = {
    'important-urgent': '#dc2626',      // Red
    'important-not-urgent': '#2563eb',  // Blue
    'not-important-urgent': '#f59e0b'   // Amber
  };

  // Columns configuration
  const columns: { status: ColumnStatus; title: string }[] = [
    { status: 'todo', title: 'Todo' },
    { status: 'doing', title: 'Doing' },
    { status: 'done', title: 'Done' }
  ];

  // State
  let tasks = $state<Task[]>([]);
  let themes = $state<Theme[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Create task dialog state
  let showCreateDialog = $state(false);
  let newTaskTitle = $state('');
  let newTaskThemeId = $state('');
  let newTaskPriority = $state('important-urgent');
  let creating = $state(false);

  // Drag and drop state
  let draggedTask = $state<Task | null>(null);
  let dragOverColumn = $state<ColumnStatus | null>(null);

  // Context menu state for cross-view navigation
  let contextMenuTask = $state<Task | null>(null);
  let contextMenuPosition = $state<{ x: number; y: number } | null>(null);

  // Filter tasks based on props
  const filteredTasks = $derived.by(() => {
    let result = [...tasks];
    if (filterThemeId) {
      result = result.filter(t => t.themeId === filterThemeId);
    }
    if (filterDate) {
      result = result.filter(t => t.dayDate === filterDate);
    }
    return result;
  });

  // Computed: tasks grouped by column with auto-sorting for Todo
  const tasksByColumn = $derived.by(() => {
    const grouped: Record<ColumnStatus, Task[]> = {
      todo: [],
      doing: [],
      done: []
    };

    for (const task of filteredTasks) {
      const status = task.status as ColumnStatus;
      if (grouped[status]) {
        grouped[status].push(task);
      }
    }

    // Auto-sort Todo column by priority
    grouped.todo.sort((a, b) => {
      const orderA = priorityOrder[a.priority] ?? 999;
      const orderB = priorityOrder[b.priority] ?? 999;
      return orderA - orderB;
    });

    return grouped;
  });

  // Helper: get theme by ID
  function getTheme(themeId: string): Theme | undefined {
    return themes.find(t => t.id === themeId);
  }

  // Helper: get theme color
  function getThemeColor(themeId: string): string {
    const theme = getTheme(themeId);
    return theme?.color ?? '#6b7280';
  }

  // API functions using Wails bindings (or mocks in browser mode)
  async function fetchTasks(): Promise<Task[]> {
    return mockAppBindings.GetTasks();
  }

  async function fetchThemes(): Promise<Theme[]> {
    return mockAppBindings.GetThemes();
  }

  async function apiCreateTask(title: string, themeId: string, priority: string): Promise<Task> {
    const today = new Date().toISOString().split('T')[0];
    const task = await mockAppBindings.CreateTask(title, themeId, today, priority);
    return { ...task, status: 'todo' };
  }

  async function apiMoveTask(taskId: string, newStatus: string): Promise<void> {
    await mockAppBindings.MoveTask(taskId, newStatus);
  }

  async function apiDeleteTask(taskId: string): Promise<void> {
    await mockAppBindings.DeleteTask(taskId);
  }

  // Load data on mount
  onMount(async () => {
    try {
      const [fetchedTasks, fetchedThemes] = await Promise.all([
        fetchTasks(),
        fetchThemes()
      ]);
      tasks = fetchedTasks;
      themes = fetchedThemes;
      if (fetchedThemes.length > 0) {
        newTaskThemeId = fetchedThemes[0].id;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  });

  // Create task handler
  async function handleCreateTask() {
    if (!newTaskTitle.trim() || !newTaskThemeId || !newTaskPriority) {
      return;
    }

    creating = true;
    try {
      const newTask = await apiCreateTask(newTaskTitle, newTaskThemeId, newTaskPriority);
      tasks = [...tasks, newTask];
      closeCreateDialog();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create task';
    } finally {
      creating = false;
    }
  }

  function openCreateDialog() {
    showCreateDialog = true;
    newTaskTitle = '';
    newTaskPriority = 'important-urgent';
    if (themes.length > 0) {
      newTaskThemeId = themes[0].id;
    }
  }

  function closeCreateDialog() {
    showCreateDialog = false;
    newTaskTitle = '';
  }

  // Drag and drop handlers
  function handleDragStart(event: DragEvent, task: Task) {
    draggedTask = task;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', task.id);
    }
  }

  function handleDragEnd() {
    draggedTask = null;
    dragOverColumn = null;
  }

  function handleDragOver(event: DragEvent, status: ColumnStatus) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    dragOverColumn = status;
  }

  function handleDragLeave() {
    dragOverColumn = null;
  }

  async function handleDrop(event: DragEvent, newStatus: ColumnStatus) {
    event.preventDefault();
    dragOverColumn = null;

    if (!draggedTask || draggedTask.status === newStatus) {
      draggedTask = null;
      return;
    }

    const taskId = draggedTask.id;
    const oldStatus = draggedTask.status;

    // Optimistic update
    tasks = tasks.map(t =>
      t.id === taskId ? { ...t, status: newStatus } : t
    );

    try {
      await apiMoveTask(taskId, newStatus);
    } catch (e) {
      // Revert on error
      tasks = tasks.map(t =>
        t.id === taskId ? { ...t, status: oldStatus } : t
      );
      error = e instanceof Error ? e.message : 'Failed to move task';
    }

    draggedTask = null;
  }

  // Delete task handler
  async function handleDeleteTask(taskId: string) {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    // Optimistic update
    tasks = tasks.filter(t => t.id !== taskId);

    try {
      await apiDeleteTask(taskId);
    } catch (e) {
      // Revert on error
      tasks = [...tasks, taskToDelete];
      error = e instanceof Error ? e.message : 'Failed to delete task';
    }
  }

  // Context menu handlers
  function handleTaskContextMenu(event: MouseEvent, task: Task) {
    event.preventDefault();
    contextMenuTask = task;
    contextMenuPosition = { x: event.clientX, y: event.clientY };
  }

  function closeContextMenu() {
    contextMenuTask = null;
    contextMenuPosition = null;
  }

  function handleGoToTheme() {
    if (contextMenuTask && onNavigateToTheme) {
      onNavigateToTheme(contextMenuTask.themeId);
    }
    closeContextMenu();
  }

  function handleGoToDay() {
    if (contextMenuTask && onNavigateToDay) {
      onNavigateToDay(contextMenuTask.dayDate, contextMenuTask.themeId);
    }
    closeContextMenu();
  }
</script>

<div class="eisenkan-container">
  <header class="eisenkan-header">
    <h1>EisenKan Board</h1>
    <button type="button" class="create-btn" onclick={openCreateDialog}>
      + New Task
    </button>
  </header>

  {#if error}
    <div class="error-banner" role="alert">
      <span>{error}</span>
      <button type="button" onclick={() => error = null}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading-state">
      <p>Loading tasks...</p>
    </div>
  {:else}
    <div class="kanban-board">
      {#each columns as column (column.status)}
        <div
          class="kanban-column"
          class:drag-over={dragOverColumn === column.status}
          ondragover={(e) => handleDragOver(e, column.status)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, column.status)}
          role="region"
          aria-label="{column.title} column"
        >
          <div class="column-header">
            <h2>{column.title}</h2>
            <span class="task-count">{tasksByColumn[column.status].length}</span>
          </div>

          <div class="column-content">
            {#each tasksByColumn[column.status] as task (task.id)}
              <div
                class="task-card"
                draggable="true"
                ondragstart={(e) => handleDragStart(e, task)}
                ondragend={handleDragEnd}
                oncontextmenu={(e) => handleTaskContextMenu(e, task)}
                style="--theme-color: {getThemeColor(task.themeId)};"
                role="article"
                aria-label="{task.title}"
              >
                <div class="task-header">
                  <ThemeBadge color={getThemeColor(task.themeId)} size="sm" />
                  <span class="priority-badge" style="background-color: {priorityColors[task.priority]};">
                    {priorityLabels[task.priority]}
                  </span>
                </div>
                <h3 class="task-title">{task.title}</h3>
                <div class="task-footer">
                  <button
                    type="button"
                    class="theme-name-btn"
                    onclick={() => onNavigateToTheme?.(task.themeId)}
                    title="Go to theme"
                  >
                    {getTheme(task.themeId)?.name ?? 'Unknown'}
                  </button>
                  <button
                    type="button"
                    class="task-date"
                    title="Go to day"
                    onclick={() => onNavigateToDay?.(task.dayDate)}
                  >
                    {task.dayDate}
                  </button>
                  <button
                    type="button"
                    class="delete-btn"
                    onclick={() => handleDeleteTask(task.id)}
                    aria-label="Delete task"
                  >
                    x
                  </button>
                </div>
              </div>
            {/each}

            {#if tasksByColumn[column.status].length === 0}
              <div class="empty-column">
                <p>No tasks</p>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Context Menu for Cross-View Navigation -->
  {#if contextMenuTask && contextMenuPosition}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="context-menu-overlay" onclick={closeContextMenu} role="presentation">
      <div
        class="context-menu"
        style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
        role="menu"
      >
        <button type="button" class="context-menu-item" onclick={handleGoToTheme}>
          Go to Theme: {getTheme(contextMenuTask.themeId)?.name ?? 'Unknown'}
        </button>
        <button type="button" class="context-menu-item" onclick={handleGoToDay}>
          Go to Day: {contextMenuTask.dayDate}
        </button>
      </div>
    </div>
  {/if}

  <!-- Create Task Dialog -->
  {#if showCreateDialog}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="dialog-overlay" onclick={closeCreateDialog} role="presentation">
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="dialog-title">
        <h2 id="dialog-title">Create New Task</h2>

        <div class="form-group">
          <label for="task-title">Title</label>
          <input
            id="task-title"
            type="text"
            bind:value={newTaskTitle}
            placeholder="Enter task title"
          />
        </div>

        <div class="form-group">
          <label for="task-theme">Theme</label>
          <select id="task-theme" bind:value={newTaskThemeId}>
            {#each themes as theme (theme.id)}
              <option value={theme.id}>{theme.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group" role="radiogroup" aria-labelledby="priority-group-label">
          <span id="priority-group-label" class="group-label">Priority (Eisenhower Matrix)</span>
          <div class="priority-options">
            <label class="priority-option">
              <input type="radio" bind:group={newTaskPriority} value="important-urgent" />
              <span class="priority-label q1">Q1 - Important & Urgent</span>
            </label>
            <label class="priority-option">
              <input type="radio" bind:group={newTaskPriority} value="important-not-urgent" />
              <span class="priority-label q2">Q2 - Important, Not Urgent</span>
            </label>
            <label class="priority-option">
              <input type="radio" bind:group={newTaskPriority} value="not-important-urgent" />
              <span class="priority-label q3">Q3 - Not Important, Urgent</span>
            </label>
          </div>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn-secondary" onclick={closeCreateDialog}>
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary"
            onclick={handleCreateTask}
            disabled={creating || !newTaskTitle.trim()}
          >
            {creating ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .eisenkan-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    background-color: #f3f4f6;
  }

  .eisenkan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .eisenkan-header h1 {
    font-size: 1.5rem;
    color: #1f2937;
    margin: 0;
  }

  .create-btn {
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

  .create-btn:hover {
    background-color: #1d4ed8;
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

  .loading-state {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    color: #6b7280;
  }

  .kanban-board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }

  .kanban-column {
    display: flex;
    flex-direction: column;
    background-color: #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem;
    min-height: 200px;
    transition: background-color 0.2s;
  }

  .kanban-column.drag-over {
    background-color: #dbeafe;
  }

  .column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding: 0 0.25rem;
  }

  .column-header h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .task-count {
    background-color: #9ca3af;
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  .column-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .task-card {
    background-color: white;
    border-radius: 6px;
    padding: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: grab;
    border-left: 4px solid var(--theme-color, #6b7280);
    transition: box-shadow 0.2s, transform 0.1s;
  }

  .task-card:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .task-card:active {
    cursor: grabbing;
    transform: rotate(2deg);
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
    color: #1f2937;
    margin: 0 0 0.5rem 0;
    line-height: 1.3;
  }

  .task-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .theme-name-btn {
    font-size: 0.75rem;
    color: #3b82f6;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }

  .theme-name-btn:hover {
    color: #2563eb;
  }

  .task-date {
    font-size: 0.7rem;
    color: #9ca3af;
    cursor: pointer;
    padding: 0.125rem 0.25rem;
    border-radius: 2px;
    background: none;
    border: none;
  }

  .task-date:hover {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  .delete-btn {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    border-radius: 4px;
    transition: color 0.2s, background-color 0.2s;
  }

  .delete-btn:hover {
    color: #dc2626;
    background-color: #fee2e2;
  }

  .empty-column {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    min-height: 100px;
  }

  .empty-column p {
    color: #9ca3af;
    font-size: 0.875rem;
  }

  /* Dialog styles */
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
  }

  .dialog h2 {
    font-size: 1.25rem;
    color: #1f2937;
    margin: 0 0 1.5rem 0;
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
  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-group input[type="text"]:focus,
  .form-group select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
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

  /* Context menu styles */
  .context-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .context-menu {
    position: fixed;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 180px;
    z-index: 1000;
    overflow: hidden;
  }

  .context-menu-item {
    display: block;
    width: 100%;
    padding: 0.625rem 1rem;
    background: none;
    border: none;
    text-align: left;
    font-size: 0.875rem;
    color: #374151;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .context-menu-item:hover {
    background-color: #f3f4f6;
  }

  .context-menu-item:first-child {
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
  }

  .context-menu-item:last-child {
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }
</style>
