<script lang="ts">
  /**
   * EisenKanView Component
   *
   * A Kanban board for short-term task execution using Eisenhower priority.
   * Board configuration is fetched dynamically from GetBoardConfiguration API.
   * The Todo column renders tasks grouped by priority sections from the config.
   * Subtasks are nested under their parent tasks with expand/collapse.
   * Drag-and-drop powered by svelte-dnd-action with optimistic rollback.
   */

  import { onMount, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import ThemeBadge from '../lib/components/ThemeBadge.svelte';
  import EditTaskDialog from '../components/EditTaskDialog.svelte';
  import CreateTaskDialog from '../components/CreateTaskDialog.svelte';
  import ErrorDialog from '../components/ErrorDialog.svelte';
  import {
    mockAppBindings,
    type TaskWithStatus,
    type LifeTheme,
    type MoveTaskResult,
    type BoardConfiguration,
    type ColumnDefinition,
    type RuleViolation,
    type Task,
  } from '../lib/wails-mock';

  // Props for cross-view navigation
  interface Props {
    onNavigateToTheme?: (themeId: string) => void;
    onNavigateToDay?: (date: string, themeId?: string) => void;
    filterThemeId?: string;
    filterDate?: string;
  }

  let { onNavigateToTheme, onNavigateToDay, filterThemeId, filterDate }: Props = $props();

  // Types
  type Theme = LifeTheme;

  const flipDurationMs = 200;

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

  // State
  let tasks = $state<TaskWithStatus[]>([]);
  let themes = $state<Theme[]>([]);
  let boardConfig = $state<BoardConfiguration | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Create task dialog state
  let showCreateDialog = $state(false);

  // Edit task dialog state
  let selectedTask = $state<Task | null>(null);

  // Error dialog state (rule violations)
  let errorViolations = $state<RuleViolation[]>([]);

  // Subtask expand/collapse state
  let collapsedParents = new SvelteSet<string>();

  // Drag-and-drop state (svelte-dnd-action)
  let isValidating = $state(false);
  let isRollingBack = $state(false);

  // Per-column items managed by svelte-dnd-action
  let columnItems = $state<Record<string, TaskWithStatus[]>>({});

  // Context menu state for cross-view navigation
  let contextMenuTask = $state<TaskWithStatus | null>(null);
  let contextMenuPosition = $state<{ x: number; y: number } | null>(null);

  // Derive columns from board config
  const columns = $derived<ColumnDefinition[]>(boardConfig?.columnDefinitions ?? []);

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

  // Sync filteredTasks into columnItems; never read columnItems here (avoid loop)
  $effect(() => {
    const cols = columns;
    const ft = filteredTasks;
    const grouped: Record<string, TaskWithStatus[]> = {};

    for (const col of cols) {
      grouped[col.name] = [];
    }

    for (const task of ft) {
      const status = task.status;
      if (grouped[status]) {
        grouped[status].push(task);
      }
    }

    // Auto-sort Todo column by priority
    const todoCol = cols.find(c => c.type === 'todo');
    if (todoCol && grouped[todoCol.name]) {
      const priorityOrder: Record<string, number> = {};
      if (todoCol.sections) {
        todoCol.sections.forEach((s, i) => {
          priorityOrder[s.name] = i;
        });
      }
      grouped[todoCol.name].sort((a, b) => {
        const orderA = priorityOrder[a.priority] ?? 999;
        const orderB = priorityOrder[b.priority] ?? 999;
        return orderA - orderB;
      });
    }

    untrack(() => {
      columnItems = grouped;
    });
  });

  // Helper: get top-level tasks (no parent) for a column
  function getTopLevelTasks(columnName: string): TaskWithStatus[] {
    return (columnItems[columnName] ?? []).filter(t => !t.parentTaskId);
  }

  // Helper: get subtasks for a parent task within a column
  function getSubtasks(parentId: string, columnName: string): TaskWithStatus[] {
    return (columnItems[columnName] ?? []).filter(t => t.parentTaskId === parentId);
  }

  // Helper: get subtask count for a parent task (across all tasks, not just column)
  function getSubtaskCount(parentId: string): number {
    return tasks.filter(t => t.parentTaskId === parentId).length;
  }

  // Helper: check if a task has subtasks
  function hasSubtasks(taskId: string): boolean {
    return tasks.some(t => t.parentTaskId === taskId);
  }

  // Toggle parent expand/collapse
  function toggleParentCollapse(taskId: string) {
    if (collapsedParents.has(taskId)) {
      collapsedParents.delete(taskId);
    } else {
      collapsedParents.add(taskId);
    }
  }

  // Helper: get tasks for a specific section within a column
  function getTasksForSection(columnName: string, sectionName: string): TaskWithStatus[] {
    return (columnItems[columnName] ?? []).filter(t => t.priority === sectionName);
  }

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
  async function fetchTasks(): Promise<TaskWithStatus[]> {
    return mockAppBindings.GetTasks();
  }

  async function fetchThemes(): Promise<Theme[]> {
    return mockAppBindings.GetThemes();
  }

  async function fetchBoardConfig(): Promise<BoardConfiguration> {
    return mockAppBindings.GetBoardConfiguration();
  }

  async function apiCreateTask(title: string, themeId: string, dayDate: string, priority: string): Promise<Task> {
    return mockAppBindings.CreateTask(title, themeId, dayDate, priority);
  }

  async function apiMoveTask(taskId: string, newStatus: string): Promise<MoveTaskResult> {
    return await mockAppBindings.MoveTask(taskId, newStatus);
  }

  async function apiDeleteTask(taskId: string): Promise<void> {
    await mockAppBindings.DeleteTask(taskId);
  }

  async function apiUpdateTask(task: Task): Promise<void> {
    await mockAppBindings.UpdateTask(task);
  }

  // Load data on mount
  onMount(async () => {
    try {
      const [fetchedTasks, fetchedThemes, fetchedConfig] = await Promise.all([
        fetchTasks(),
        fetchThemes(),
        fetchBoardConfig()
      ]);
      tasks = fetchedTasks;
      themes = fetchedThemes;
      boardConfig = fetchedConfig;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  });

  // Refresh tasks from API
  async function refreshTasks() {
    try {
      tasks = await fetchTasks();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to refresh tasks';
    }
  }

  // Create task dialog handlers
  function openCreateDialog() {
    showCreateDialog = true;
  }

  function handleCreateDone() {
    showCreateDialog = false;
    refreshTasks();
  }

  function handleCreateCancel() {
    showCreateDialog = false;
  }

  // Edit task dialog handlers
  function handleTaskClick(task: TaskWithStatus) {
    selectedTask = task;
  }

  async function handleEditSave(updatedTask: Task) {
    await apiUpdateTask(updatedTask);
    selectedTask = null;
    await refreshTasks();
  }

  function handleEditCancel() {
    selectedTask = null;
  }

  // Error dialog handler
  function handleErrorClose() {
    errorViolations = [];
  }

  // svelte-dnd-action handlers
  function handleDndConsider(status: string, event: CustomEvent<DndEvent<TaskWithStatus>>) {
    columnItems = { ...columnItems, [status]: event.detail.items };
  }

  async function handleDndFinalize(status: string, event: CustomEvent<DndEvent<TaskWithStatus>>) {
    if (isValidating || isRollingBack) return;

    const newItems = event.detail.items;

    // Update column items optimistically
    columnItems = { ...columnItems, [status]: newItems };

    // Find the task that was moved into this column (its status differs from column)
    const movedTask = newItems.find(t => t.status !== status);
    if (!movedTask) return; // Reorder within same column -- no backend call needed

    const taskId = movedTask.id;

    // Snapshot pre-move state for rollback
    const snapshotTasks = [...tasks];

    // Optimistically update master task list
    tasks = tasks.map(t =>
      t.id === taskId ? { ...t, status } : t
    );

    isValidating = true;
    try {
      const result = await apiMoveTask(taskId, status);
      if (!result.success) {
        // Rule violation -- rollback
        isRollingBack = true;
        tasks = snapshotTasks;
        queueMicrotask(() => { isRollingBack = false; });
        if (result.violations && result.violations.length > 0) {
          errorViolations = result.violations;
        } else {
          error = 'Move rejected by rules';
        }
      }
    } catch (e) {
      // Network error -- rollback
      isRollingBack = true;
      tasks = snapshotTasks;
      queueMicrotask(() => { isRollingBack = false; });
      error = e instanceof Error ? e.message : 'Failed to move task';
    } finally {
      isValidating = false;
    }
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
  function handleTaskContextMenu(event: MouseEvent, task: TaskWithStatus) {
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

  // Column task count
  function getColumnTaskCount(columnName: string): number {
    return (columnItems[columnName] ?? []).length;
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
    <div class="kanban-board" style="grid-template-columns: repeat({columns.length}, 1fr);">
      {#each columns as column (column.name)}
        <div
          class="kanban-column"
          role="region"
          aria-label="{column.title} column"
        >
          <div class="column-header">
            <h2>{column.title}</h2>
            <span class="task-count">{getColumnTaskCount(column.name)}</span>
          </div>

          {#if column.sections && column.sections.length > 0}
            <!-- Sectioned column: render sections as separate groups -->
            <div class="section-container">
              {#each column.sections as section (section.name)}
                {@const sectionTasks = getTasksForSection(column.name, section.name)}
                <div class="column-section" data-testid="section-{section.name}">
                  <div class="section-header">
                    <span class="section-color" style="background-color: {section.color};"></span>
                    <span class="section-title">{section.title}</span>
                    <span class="section-count">{sectionTasks.length}</span>
                  </div>
                  <div
                    class="column-content"
                    use:dndzone={{ items: columnItems[column.name] ?? [], flipDurationMs, dragDisabled: isValidating || isRollingBack }}
                    onconsider={(e) => handleDndConsider(column.name, e)}
                    onfinalize={(e) => handleDndFinalize(column.name, e)}
                  >
                    {#each sectionTasks as task (task.id)}
                      {#if !task.parentTaskId}
                        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                        <div
                          class="task-card"
                          onclick={() => handleTaskClick(task)}
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
                            {#if hasSubtasks(task.id)}
                              <button
                                type="button"
                                class="toggle-btn"
                                onclick={(e) => { e.stopPropagation(); toggleParentCollapse(task.id); }}
                                aria-label="{collapsedParents.has(task.id) ? 'Expand' : 'Collapse'} subtasks"
                              >
                                {collapsedParents.has(task.id) ? '+' : '-'}
                              </button>
                              {#if collapsedParents.has(task.id)}
                                <span class="subtask-count">{getSubtaskCount(task.id)}</span>
                              {/if}
                            {/if}
                          </div>
                          <h3 class="task-title">{task.title}</h3>
                          <div class="task-footer">
                            <button
                              type="button"
                              class="theme-name-btn"
                              onclick={(e) => { e.stopPropagation(); onNavigateToTheme?.(task.themeId); }}
                              title="Go to theme"
                            >
                              {getTheme(task.themeId)?.name ?? 'Unknown'}
                            </button>
                            <button
                              type="button"
                              class="task-date"
                              title="Go to day"
                              onclick={(e) => { e.stopPropagation(); onNavigateToDay?.(task.dayDate); }}
                            >
                              {task.dayDate}
                            </button>
                            <button
                              type="button"
                              class="delete-btn"
                              onclick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                              aria-label="Delete task"
                            >
                              x
                            </button>
                          </div>
                        </div>
                        {#if hasSubtasks(task.id) && !collapsedParents.has(task.id)}
                          {#each getSubtasks(task.id, column.name) as subtask (subtask.id)}
                            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                            <div
                              class="task-card subtask-card"
                              onclick={() => handleTaskClick(subtask)}
                              oncontextmenu={(e) => handleTaskContextMenu(e, subtask)}
                              style="--theme-color: {getThemeColor(subtask.themeId)};"
                              role="article"
                              aria-label="{subtask.title}"
                            >
                              <h3 class="task-title">{subtask.title}</h3>
                            </div>
                          {/each}
                        {/if}
                      {/if}
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <!-- Regular column: single drop zone -->
            <div
              class="column-content"
              use:dndzone={{ items: columnItems[column.name] ?? [], flipDurationMs, dragDisabled: isValidating || isRollingBack }}
              onconsider={(e) => handleDndConsider(column.name, e)}
              onfinalize={(e) => handleDndFinalize(column.name, e)}
            >
              {#each getTopLevelTasks(column.name) as task (task.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                <div
                  class="task-card"
                  onclick={() => handleTaskClick(task)}
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
                    {#if hasSubtasks(task.id)}
                      <button
                        type="button"
                        class="toggle-btn"
                        onclick={(e) => { e.stopPropagation(); toggleParentCollapse(task.id); }}
                        aria-label="{collapsedParents.has(task.id) ? 'Expand' : 'Collapse'} subtasks"
                      >
                        {collapsedParents.has(task.id) ? '+' : '-'}
                      </button>
                      {#if collapsedParents.has(task.id)}
                        <span class="subtask-count">{getSubtaskCount(task.id)}</span>
                      {/if}
                    {/if}
                  </div>
                  <h3 class="task-title">{task.title}</h3>
                  <div class="task-footer">
                    <button
                      type="button"
                      class="theme-name-btn"
                      onclick={(e) => { e.stopPropagation(); onNavigateToTheme?.(task.themeId); }}
                      title="Go to theme"
                    >
                      {getTheme(task.themeId)?.name ?? 'Unknown'}
                    </button>
                    <button
                      type="button"
                      class="task-date"
                      title="Go to day"
                      onclick={(e) => { e.stopPropagation(); onNavigateToDay?.(task.dayDate); }}
                    >
                      {task.dayDate}
                    </button>
                    <button
                      type="button"
                      class="delete-btn"
                      onclick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                      aria-label="Delete task"
                    >
                      x
                    </button>
                  </div>
                </div>
                {#if hasSubtasks(task.id) && !collapsedParents.has(task.id)}
                  {#each getSubtasks(task.id, column.name) as subtask (subtask.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                    <div
                      class="task-card subtask-card"
                      onclick={() => handleTaskClick(subtask)}
                      oncontextmenu={(e) => handleTaskContextMenu(e, subtask)}
                      style="--theme-color: {getThemeColor(subtask.themeId)};"
                      role="article"
                      aria-label="{subtask.title}"
                    >
                      <h3 class="task-title">{subtask.title}</h3>
                    </div>
                  {/each}
                {/if}
              {/each}

              {#if (columnItems[column.name] ?? []).length === 0}
                <div class="empty-column">
                  <p>No tasks</p>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Context Menu for Cross-View Navigation -->
  {#if contextMenuTask && contextMenuPosition}
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

  <!-- Create Task Dialog (Eisenhower matrix) -->
  <CreateTaskDialog
    open={showCreateDialog}
    {themes}
    onDone={handleCreateDone}
    onCancel={handleCreateCancel}
    createTask={apiCreateTask}
  />

  <!-- Edit Task Dialog -->
  <EditTaskDialog
    task={selectedTask}
    onSave={handleEditSave}
    onCancel={handleEditCancel}
  />

  <!-- Error Dialog (rule violations) -->
  {#if errorViolations.length > 0}
    <ErrorDialog violations={errorViolations} onClose={handleErrorClose} />
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

  /* Section styles */
  .section-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
  }

  .column-section {
    background-color: #f3f4f6;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    padding: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .section-color {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #4b5563;
    flex: 1;
  }

  .section-count {
    background-color: #9ca3af;
    color: white;
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.0625rem 0.375rem;
    border-radius: 9999px;
    min-width: 1.25rem;
    text-align: center;
  }

  .column-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 60px;
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

  /* Subtask card: indented and smaller */
  .subtask-card {
    margin-left: 1.5rem;
    padding: 0.5rem 0.625rem;
    opacity: 0.85;
    font-size: 0.8125rem;
  }

  .subtask-card .task-title {
    font-size: 0.8125rem;
    margin: 0;
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

  .toggle-btn {
    background: none;
    border: 1px solid #d1d5db;
    color: #6b7280;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    padding: 0 0.375rem;
    line-height: 1.25;
    border-radius: 3px;
    transition: background-color 0.15s;
  }

  .toggle-btn:hover {
    background-color: #f3f4f6;
  }

  .subtask-count {
    font-size: 0.6875rem;
    color: #6b7280;
    font-weight: 500;
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
