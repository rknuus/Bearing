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

  import { onMount, onDestroy, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { dndzone, TRIGGERS, SOURCES, type DndEvent } from 'svelte-dnd-action';
  import { Button, ErrorBanner, TagBadges } from '../lib/components';
  import ThemeBadge from '../lib/components/ThemeBadge.svelte';
  import ThemeFilterBar from '../components/ThemeFilterBar.svelte';
  import TagFilterBar from '../components/TagFilterBar.svelte';
  import EditTaskDialog from '../components/EditTaskDialog.svelte';
  import CreateTaskDialog from '../components/CreateTaskDialog.svelte';
  import ErrorDialog from '../components/ErrorDialog.svelte';
  import {
    type TaskWithStatus,
    type LifeTheme,
    type MoveTaskResult,
    type BoardConfiguration,
    type ColumnDefinition,
    type RuleViolation,
    type Task,
    type PromotedTask,
  } from '../lib/wails-mock';
  import { getBindings, extractError } from '../lib/utils/bindings';
  import { getTheme, getThemeColor } from '../lib/utils/theme-helpers';
  import { priorityLabels } from '../lib/constants/priorities';
  import { UNTAGGED_SENTINEL } from '../lib/constants/filters';
  import { formatDate, formatDateLong } from '../lib/utils/date-format';
  import { checkFullState } from '../lib/utils/state-check';

  // Props for cross-view navigation
  interface Props {
    onNavigateToTheme?: (themeId: string) => void;
    onNavigateToDay?: (date: string, themeId?: string) => void;
    filterThemeIds?: string[];
    filterTagIds?: string[];
    filterDate?: string;
    onFilterThemeToggle?: (themeId: string) => void;
    onFilterThemeClear?: () => void;
    onFilterTagToggle?: (tag: string) => void;
    onFilterTagClear?: () => void;
  }

  let { onNavigateToTheme, onNavigateToDay, filterThemeIds = [], filterTagIds = [], filterDate, onFilterThemeToggle, onFilterThemeClear, onFilterTagToggle, onFilterTagClear }: Props = $props();

  // Types
  type Theme = LifeTheme;

  const flipDurationMs = 200;

  // Priority colors for badges
  const priorityColors: Record<string, string> = {
    'important-urgent': '#ef4444',      // Red
    'not-important-urgent': '#f59e0b',  // Amber
    'important-not-urgent': '#3b82f6'   // Blue
  };

  // State
  let tasks = $state<TaskWithStatus[]>([]);
  let themes = $state<Theme[]>([]);
  let boardConfig = $state<BoardConfiguration | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Archive toggle state (persisted via navigation context)
  let showArchivedTasks = $state(false);

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
  let isDragging = $state(false);
  let dragCancelled = $state(false);

  // Escape key handler: cancel active pointer drag
  function handleEscapeDuringDrag(event: KeyboardEvent) {
    if (event.key === 'Escape' && isDragging) {
      dragCancelled = true;
      event.stopPropagation();
      event.preventDefault();
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
  }

  // Per-column items managed by svelte-dnd-action
  let columnItems = $state<Record<string, TaskWithStatus[]>>({});

  // Per-section items for sectioned columns (keyed by section name)
  let sectionItems = $state<Record<string, TaskWithStatus[]>>({});

  // Current day display (updates at midnight)
  function formatToday(): string {
    const iso = new Date().toISOString().split('T')[0];
    return formatDateLong(iso);
  }
  let today = $state(formatToday());
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleMidnightUpdate() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    midnightTimer = setTimeout(() => {
      today = formatToday();
      scheduleMidnightUpdate();
    }, msUntilMidnight);
  }
  scheduleMidnightUpdate();
  onDestroy(() => clearTimeout(midnightTimer));

  // Context menu state for cross-view navigation
  let contextMenuTask = $state<TaskWithStatus | null>(null);
  let contextMenuPosition = $state<{ x: number; y: number } | null>(null);

  // Derive columns from board config
  const columns = $derived<ColumnDefinition[]>(boardConfig?.columnDefinitions ?? []);

  // Filter tasks based on props
  const filteredTasks = $derived.by(() => {
    let result = [...tasks];
    if (filterThemeIds.length > 0) {
      result = result.filter(t => filterThemeIds.includes(t.themeId));
    }
    if (filterTagIds.length > 0) {
      const realTags = filterTagIds.filter(t => t !== UNTAGGED_SENTINEL);
      const includeUntagged = filterTagIds.includes(UNTAGGED_SENTINEL);
      result = result.filter(t => {
        const hasTags = t.tags && t.tags.length > 0;
        if (includeUntagged && !hasTags) return true;
        if (realTags.length > 0 && hasTags) return realTags.every(tag => t.tags!.includes(tag));
        return false;
      });
    }
    if (filterDate) {
      result = result.filter(t => t.dayDate === filterDate);
    }
    return result;
  });

  // Derive available tags from all tasks (not filtered) for the tag filter bar
  const availableTags = $derived([...new Set(tasks.flatMap(t => t.tags ?? []))].sort());

  // Base task set for count computation (excludes archived unless shown)
  const countBaseTasks = $derived(
    showArchivedTasks ? tasks : tasks.filter(t => t.status !== 'archived')
  );

  // Theme filter pill counts: each theme count = tasks matching that theme + active tag/date filters
  const themeCounts = $derived.by(() => {
    const base = countBaseTasks;
    const realTags = filterTagIds.filter(t => t !== UNTAGGED_SENTINEL);
    const includeUntagged = filterTagIds.includes(UNTAGGED_SENTINEL);

    function matchesTags(t: TaskWithStatus): boolean {
      if (filterTagIds.length === 0) return true;
      const hasTags = t.tags && t.tags.length > 0;
      if (includeUntagged && !hasTags) return true;
      if (realTags.length > 0 && hasTags) return realTags.every(tag => t.tags!.includes(tag));
      return false;
    }
    function matchesDate(t: TaskWithStatus): boolean {
      return !filterDate || t.dayDate === filterDate;
    }

    const counts: Record<string, number> = {};
    let allCount = 0;
    for (const t of base) {
      if (!matchesTags(t) || !matchesDate(t)) continue;
      allCount++;
      counts[t.themeId] = (counts[t.themeId] ?? 0) + 1;
    }
    counts['__all__'] = allCount;
    return counts;
  });

  // Tag filter pill counts: each tag count = tasks having that tag + active theme/date filters
  const tagCounts = $derived.by(() => {
    const base = countBaseTasks;

    function matchesTheme(t: TaskWithStatus): boolean {
      return filterThemeIds.length === 0 || filterThemeIds.includes(t.themeId);
    }
    function matchesDate(t: TaskWithStatus): boolean {
      return !filterDate || t.dayDate === filterDate;
    }

    const counts: Record<string, number> = {};
    let allCount = 0;
    let untaggedCount = 0;
    for (const t of base) {
      if (!matchesTheme(t) || !matchesDate(t)) continue;
      allCount++;
      const hasTags = t.tags && t.tags.length > 0;
      if (!hasTags) {
        untaggedCount++;
      } else {
        for (const tag of t.tags!) {
          counts[tag] = (counts[tag] ?? 0) + 1;
        }
      }
    }
    counts['__all__'] = allCount;
    counts[UNTAGGED_SENTINEL] = untaggedCount;
    return counts;
  });

  // Re-derive columnItems and sectionItems from the current filteredTasks.
  // Called by the $effect (reactive sync) and by the drag-cancel path (synchronous reset).
  function regroupItems() {
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

    // Build per-section items for sectioned columns (only top-level tasks)
    const sectionGrouped: Record<string, TaskWithStatus[]> = {};
    for (const col of cols) {
      if (col.sections) {
        for (const section of col.sections) {
          sectionGrouped[section.name] = (grouped[col.name] ?? []).filter(
            t => t.priority === section.name && !t.parentTaskId
          );
        }
      }
    }

    columnItems = grouped;
    sectionItems = sectionGrouped;
  }

  // Sync filteredTasks into columnItems; never read columnItems here (avoid loop)
  $effect(() => {
    const _cols = columns;
    const _ft = filteredTasks;
    untrack(() => {
      regroupItems();
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


  // API functions using Wails bindings (or mocks in browser mode)
  async function fetchTasks(): Promise<TaskWithStatus[]> {
    return getBindings().GetTasks();
  }

  async function fetchThemes(): Promise<Theme[]> {
    return getBindings().GetThemes();
  }

  async function fetchBoardConfig(): Promise<BoardConfiguration> {
    return getBindings().GetBoardConfiguration();
  }

  async function apiCreateTask(title: string, themeId: string, dayDate: string, priority: string, description: string = '', tags: string = '', dueDate: string = '', promotionDate: string = ''): Promise<Task> {
    return getBindings().CreateTask(title, themeId, dayDate, priority, description, tags, dueDate, promotionDate);
  }

  async function apiMoveTask(taskId: string, newStatus: string, positions?: Record<string, string[]>): Promise<MoveTaskResult> {
    return await getBindings().MoveTask(taskId, newStatus, positions);
  }

  async function apiDeleteTask(taskId: string): Promise<void> {
    await getBindings().DeleteTask(taskId);
  }

  async function apiUpdateTask(task: Task): Promise<void> {
    await getBindings().UpdateTask(task);
  }

  async function apiProcessPromotions(): Promise<PromotedTask[]> {
    return getBindings().ProcessPriorityPromotions();
  }

  async function apiReorderTasks(positions: Record<string, string[]>): Promise<void> {
    await getBindings().ReorderTasks(positions);
  }

  async function apiArchiveTask(taskId: string): Promise<void> {
    await getBindings().ArchiveTask(taskId);
  }

  async function apiArchiveAllDoneTasks(): Promise<void> {
    await getBindings().ArchiveAllDoneTasks();
  }

  async function apiRestoreTask(taskId: string): Promise<void> {
    await getBindings().RestoreTask(taskId);
  }

  const TASK_FIELDS = ['id', 'title', 'themeId', 'priority', 'tags', 'dueDate', 'promotionDate', 'description', 'parentTaskId', 'status'];

  const taskDropZone = (t: Record<string, unknown>) =>
    t.status === 'todo' ? (String(t.priority) || 'todo') : String(t.status);

  async function verifyTaskState() {
    const mismatches = await checkFullState('task', tasks, fetchTasks, 'id', TASK_FIELDS, taskDropZone);
    if (mismatches.length > 0) {
      error = 'Internal state mismatch detected, please reload';
      getBindings().LogFrontend('error', mismatches.join('; '), 'state-check');
    }
  }

  // Load data on mount
  onMount(() => {
    window.addEventListener('keydown', handleEscapeDuringDrag, { capture: true });
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleEscapeDuringDrag, { capture: true });
  });

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

      // Load showArchivedTasks from navigation context
      try {
        const navCtx = await getBindings().LoadNavigationContext();
        if (navCtx) {
          showArchivedTasks = navCtx.showArchivedTasks ?? false;
        }
      } catch {
        // Ignore errors loading nav context
      }

      // Process priority promotions on startup and refresh if any promoted
      try {
        const promoted = await apiProcessPromotions();
        if (promoted && promoted.length > 0) {
          tasks = await fetchTasks();
        }
      } catch {
        // Non-critical: log but don't block the view
        console.error('[EisenKan] Failed to process priority promotions');
      }
    } catch (e) {
      error = extractError(e);
    } finally {
      loading = false;
    }
  });

  // Persist showArchivedTasks to NavigationContext
  $effect(() => {
    const sat = showArchivedTasks;
    untrack(() => {
      getBindings().LoadNavigationContext().then((ctx) => {
        if (ctx) {
          getBindings().SaveNavigationContext({ ...ctx, showArchivedTasks: sat });
        }
      }).catch(() => { /* ignore */ });
    });
  });

  // Create task dialog handlers
  function openCreateDialog() {
    showCreateDialog = true;
  }

  async function apiCreateTaskAndInsert(title: string, themeId: string, dayDate: string, priority: string, description: string = '', tags: string = '', dueDate: string = '', promotionDate: string = ''): Promise<Task> {
    const task = await apiCreateTask(title, themeId, dayDate, priority, description, tags, dueDate, promotionDate);
    tasks = [...tasks, { ...task, status: 'todo' } as TaskWithStatus];
    return task;
  }

  async function handleCreateDone() {
    showCreateDialog = false;
    await verifyTaskState();
  }

  function handleCreateClose() {
    showCreateDialog = false;
  }

  // Edit task dialog handlers
  function handleTaskClick(task: TaskWithStatus) {
    selectedTask = task;
  }

  async function handleEditSave(updatedTask: Task) {
    await apiUpdateTask(updatedTask);
    const existing = tasks.find(t => t.id === updatedTask.id);
    if (existing) {
      tasks = tasks.map(t => t.id === updatedTask.id ? { ...existing, ...updatedTask } : t);
    }
    selectedTask = null;
    await verifyTaskState();
  }

  function handleEditCancel() {
    selectedTask = null;
  }

  // Error dialog handler
  function handleErrorClose() {
    errorViolations = [];
  }

  // Reposition a task in the master array so $effect re-derivation preserves DnD order
  function repositionTask(
    allTasks: TaskWithStatus[],
    taskId: string,
    updates: Partial<TaskWithStatus>,
    dndOrderIds: string[]
  ): TaskWithStatus[] {
    const task = allTasks.find(t => t.id === taskId)!;
    const updated = { ...task, ...updates } as TaskWithStatus;
    const without = allTasks.filter(t => t.id !== taskId);

    const posInDnd = dndOrderIds.indexOf(taskId);
    if (posInDnd <= 0) {
      const firstPeerIdx = without.findIndex(t => t.status === updated.status && !t.parentTaskId);
      if (firstPeerIdx === -1) return [...without, updated];
      return [...without.slice(0, firstPeerIdx), updated, ...without.slice(firstPeerIdx)];
    }

    const prevId = dndOrderIds[posInDnd - 1];
    const prevIdx = without.findIndex(t => t.id === prevId);
    if (prevIdx === -1) return [...without, updated];
    return [...without.slice(0, prevIdx + 1), updated, ...without.slice(prevIdx + 1)];
  }

  // Build the full zone order by merging visible (filtered) DnD IDs with hidden (filtered-out) tasks.
  // Hidden tasks keep their original positions relative to visible tasks.
  function fullZoneOrder(visibleIds: string[], zone: string, excludeIds?: Set<string>): string[] {
    const visibleSet = new Set(visibleIds);
    const originalZoneIds = tasks
      .filter(t => !t.parentTaskId && (t.status === 'todo' ? (t.priority || 'todo') : t.status) === zone)
      .filter(t => !excludeIds || !excludeIds.has(t.id))
      .map(t => t.id);
    const hiddenIds = originalZoneIds.filter(id => !visibleSet.has(id));
    if (hiddenIds.length === 0) return visibleIds;
    // Walk original order: replace visible slots with DnD order, keep hidden in place
    const result: string[] = [];
    let vi = 0;
    for (const id of originalZoneIds) {
      if (visibleSet.has(id)) {
        if (vi < visibleIds.length) result.push(visibleIds[vi++]);
      } else {
        result.push(id);
      }
    }
    // Append any remaining visible IDs (newly moved into this zone)
    while (vi < visibleIds.length) result.push(visibleIds[vi++]);
    return result;
  }

  // Reorder tasks in allTasks whose IDs appear in zoneIds to match zoneIds order
  function reorderZone(allTasks: TaskWithStatus[], zoneIds: string[]): TaskWithStatus[] {
    const idSet = new Set(zoneIds);
    const byId = new Map(allTasks.map(t => [t.id, t]));
    const slots: number[] = [];
    for (let i = 0; i < allTasks.length; i++) {
      if (idSet.has(allTasks[i].id)) slots.push(i);
    }
    const result = [...allTasks];
    for (let j = 0; j < slots.length && j < zoneIds.length; j++) {
      result[slots[j]] = byId.get(zoneIds[j])!;
    }
    return result;
  }

  // svelte-dnd-action handlers
  function handleDndConsider(status: string, event: CustomEvent<DndEvent<TaskWithStatus>>) {
    const { trigger, source } = event.detail.info;
    if (trigger === TRIGGERS.DRAG_STARTED && source === SOURCES.POINTER) {
      isDragging = true;
    }
    columnItems = { ...columnItems, [status]: event.detail.items };
  }

  async function handleDndFinalize(status: string, event: CustomEvent<DndEvent<TaskWithStatus>>) {
    isDragging = false;

    if (dragCancelled) {
      regroupItems();
      queueMicrotask(() => { dragCancelled = false; });
      await verifyTaskState();
      return;
    }

    if (isValidating || isRollingBack) return;

    const newItems = event.detail.items;

    // Update column items optimistically
    columnItems = { ...columnItems, [status]: newItems };

    // Find the task that was moved into this column (its status differs from column)
    const movedTask = newItems.find(t => t.status !== status);
    if (!movedTask) {
      // Within-column reorder: persist new order
      const visibleIds = newItems.filter(t => !t.parentTaskId).map(t => t.id);
      const taskIds = fullZoneOrder(visibleIds, status);
      try {
        await apiReorderTasks({ [status]: taskIds });
        tasks = reorderZone(tasks, taskIds);
        await verifyTaskState();
      } catch (e) {
        error = extractError(e);
      }
      return;
    }

    const taskId = movedTask.id;

    // Capture desired order from DnD before $effect re-derives columnItems
    const visibleTargetIds = newItems.filter(t => !t.parentTaskId).map(t => t.id);
    const targetZoneIds = fullZoneOrder(visibleTargetIds, status);

    // Snapshot pre-move state for rollback
    const snapshotTasks = [...tasks];

    // Optimistically update master task list: insert moved task then reorder zone to match
    tasks = repositionTask(tasks, taskId, { status }, targetZoneIds);
    tasks = reorderZone(tasks, targetZoneIds);

    isValidating = true;
    try {
      const result = await apiMoveTask(taskId, status, { [status]: targetZoneIds });
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
      } else {
        await verifyTaskState();
      }
    } catch (e) {
      // Network error -- rollback
      isRollingBack = true;
      tasks = snapshotTasks;
      queueMicrotask(() => { isRollingBack = false; });
      error = extractError(e);
    } finally {
      isValidating = false;
    }
  }

  // Section-aware svelte-dnd-action handlers (for sectioned columns)
  function handleSectionDndConsider(sectionName: string, event: CustomEvent<DndEvent<TaskWithStatus>>) {
    const { trigger, source } = event.detail.info;
    if (trigger === TRIGGERS.DRAG_STARTED && source === SOURCES.POINTER) {
      isDragging = true;
    }
    sectionItems = { ...sectionItems, [sectionName]: event.detail.items };
  }

  async function handleSectionDndFinalize(columnName: string, sectionName: string, event: CustomEvent<DndEvent<TaskWithStatus>>) {
    isDragging = false;

    if (dragCancelled) {
      regroupItems();
      queueMicrotask(() => { dragCancelled = false; });
      await verifyTaskState();
      return;
    }

    if (isValidating || isRollingBack) return;

    const newItems = event.detail.items;
    sectionItems = { ...sectionItems, [sectionName]: newItems };

    // Find the moved task (its status or priority differs from the target)
    const movedTask = newItems.find(t => t.status !== columnName || t.priority !== sectionName);
    if (!movedTask) {
      // Within-section reorder: persist new order
      const visibleIds = newItems.filter(t => !t.parentTaskId).map(t => t.id);
      const taskIds = fullZoneOrder(visibleIds, sectionName);
      try {
        await apiReorderTasks({ [sectionName]: taskIds });
        tasks = reorderZone(tasks, taskIds);
        await verifyTaskState();
      } catch (e) {
        error = extractError(e);
      }
      return;
    }

    const taskId = movedTask.id;
    const snapshotTasks = [...tasks];

    // Capture desired order from DnD before $effect re-derives sectionItems
    const visibleTargetIds = newItems.filter(t => !t.parentTaskId).map(t => t.id);
    const targetZoneIds = fullZoneOrder(visibleTargetIds, sectionName);

    if (movedTask.status !== columnName) {
      // Cross-column move: status change -- use MoveTask
      tasks = repositionTask(tasks, taskId, { status: columnName }, targetZoneIds);
      tasks = reorderZone(tasks, targetZoneIds);

      isValidating = true;
      try {
        const result = await apiMoveTask(taskId, columnName, { [sectionName]: targetZoneIds });
        if (!result.success) {
          isRollingBack = true;
          tasks = snapshotTasks;
          queueMicrotask(() => { isRollingBack = false; });
          if (result.violations && result.violations.length > 0) {
            errorViolations = result.violations;
          } else {
            error = 'Move rejected by rules';
          }
        } else {
          await verifyTaskState();
        }
      } catch (e) {
        isRollingBack = true;
        tasks = snapshotTasks;
        queueMicrotask(() => { isRollingBack = false; });
        error = extractError(e);
      } finally {
        isValidating = false;
      }
    } else if (movedTask.priority !== sectionName) {
      // Within-column move: priority change -- use UpdateTask
      const sourceSection = movedTask.priority;
      const visibleSourceIds = (sectionItems[sourceSection] ?? [])
        .filter(t => t.id !== taskId && !t.parentTaskId)
        .map(t => t.id);
      const sourceZoneIds = fullZoneOrder(visibleSourceIds, sourceSection, new Set([taskId]));
      const updatedTask = { ...movedTask, priority: sectionName };
      tasks = repositionTask(tasks, taskId, { priority: sectionName }, targetZoneIds);
      tasks = reorderZone(tasks, sourceZoneIds);
      tasks = reorderZone(tasks, targetZoneIds);

      isValidating = true;
      try {
        await apiUpdateTask(updatedTask);
        // Persist order in both source (task removed) and target (task at drop position)
        await apiReorderTasks({
          [sourceSection]: sourceZoneIds,
          [sectionName]: targetZoneIds
        });
        await verifyTaskState();
      } catch (e) {
        isRollingBack = true;
        tasks = snapshotTasks;
        queueMicrotask(() => { isRollingBack = false; });
        error = extractError(e);
      } finally {
        isValidating = false;
      }
    }
  }

  // Delete task handler
  async function handleDeleteTask(taskId: string) {
    try {
      await apiDeleteTask(taskId);
      tasks = tasks.filter(t => t.id !== taskId);
      await verifyTaskState();
    } catch (e) {
      error = extractError(e);
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

  // Archive/restore handlers
  async function handleArchiveTask(taskId: string) {
    try {
      await apiArchiveTask(taskId);
      tasks = await fetchTasks();
      await verifyTaskState();
    } catch (e) {
      error = extractError(e);
    }
  }

  async function handleArchiveAllDone() {
    try {
      await apiArchiveAllDoneTasks();
      tasks = await fetchTasks();
      await verifyTaskState();
    } catch (e) {
      error = extractError(e);
    }
  }

  async function handleRestoreTask(taskId: string) {
    try {
      await apiRestoreTask(taskId);
      tasks = await fetchTasks();
      await verifyTaskState();
    } catch (e) {
      error = extractError(e);
    }
  }

  // Derive archived tasks (filtered by theme/tag/date like other tasks)
  const archivedTasks = $derived(filteredTasks.filter(t => t.status === 'archived'));
  const rootArchivedTasks = $derived(archivedTasks.filter(t => !t.parentTaskId));

  // Column task count (exclude archived)
  function getColumnTaskCount(columnName: string): number {
    return (columnItems[columnName] ?? []).length;
  }

  // Column menu state
  let columnMenuSlug = $state<string | null>(null);

  // Prompt dialog state (replaces window.prompt which doesn't work in WebView)
  let promptOpen = $state(false);
  let promptLabel = $state('');
  let promptValue = $state('');
  let promptResolve: ((value: string | null) => void) | null = null;

  function showPrompt(label: string, defaultValue = ''): Promise<string | null> {
    promptLabel = label;
    promptValue = defaultValue;
    promptOpen = true;
    return new Promise((resolve) => { promptResolve = resolve; });
  }

  function handlePromptConfirm() {
    const value = promptValue.trim();
    promptOpen = false;
    promptResolve?.(value || null);
    promptResolve = null;
  }

  function handlePromptCancel() {
    promptOpen = false;
    promptResolve?.(null);
    promptResolve = null;
  }

  function toggleColumnMenu(slug: string) {
    columnMenuSlug = columnMenuSlug === slug ? null : slug;
  }

  function closeColumnMenu() {
    columnMenuSlug = null;
  }

  async function refreshBoard() {
    boardConfig = await fetchBoardConfig();
    tasks = await fetchTasks();
  }

  async function handleRenameColumn(slug: string) {
    closeColumnMenu();
    const col = columns.find(c => c.name === slug);
    if (!col) return;
    const newTitle = await showPrompt('Rename column:', col.title);
    if (!newTitle || newTitle === col.title) return;
    try {
      await getBindings().RenameColumn(slug, newTitle);
      await refreshBoard();
    } catch (e) {
      error = extractError(e);
    }
  }

  async function handleDeleteColumn(slug: string) {
    closeColumnMenu();
    try {
      await getBindings().RemoveColumn(slug);
      await refreshBoard();
    } catch (e) {
      error = extractError(e);
    }
  }

  async function handleInsertColumn(afterSlug: string) {
    closeColumnMenu();
    const title = await showPrompt('New column title:');
    if (!title) return;
    try {
      await getBindings().AddColumn(title, afterSlug);
      await refreshBoard();
    } catch (e) {
      error = extractError(e);
    }
  }

  /** Insert a column before the given slug by finding the preceding column. */
  async function handleInsertColumnBefore(slug: string) {
    closeColumnMenu();
    const idx = columns.findIndex(c => c.name === slug);
    if (idx <= 0) return; // Can't insert before the first column (todo)
    const title = await showPrompt('New column title:');
    if (!title) return;
    try {
      await getBindings().AddColumn(title, columns[idx - 1].name);
      await refreshBoard();
    } catch (e) {
      error = extractError(e);
    }
  }
</script>

<div class="eisenkan-container">
  <header class="eisenkan-header">
    <div class="header-left">
      <h1>EisenKan Board</h1>
      <span class="current-day">{today}</span>
    </div>
    <div class="header-right">
      <label class="toggle-label">
        <input type="checkbox" bind:checked={showArchivedTasks} /> Show archived
      </label>
      <Button variant="primary" id="create-task-btn" onclick={openCreateDialog}>
        + New Task
      </Button>
    </div>
  </header>

  {#if error}
    <ErrorBanner message={error} ondismiss={() => error = null} />
  {/if}

  {#if loading}
    <div class="loading-state">
      <p>Loading tasks...</p>
    </div>
  {:else}
    {#if themes.length > 0 && onFilterThemeToggle && onFilterThemeClear}
      <ThemeFilterBar
        {themes}
        activeThemeIds={filterThemeIds}
        onToggle={onFilterThemeToggle}
        onClear={onFilterThemeClear}
        counts={themeCounts}
      />
    {/if}
    {#if (availableTags.length > 0 || (tagCounts[UNTAGGED_SENTINEL] ?? 0) > 0) && onFilterTagToggle && onFilterTagClear}
      <TagFilterBar
        {availableTags}
        activeTagIds={filterTagIds}
        onToggle={onFilterTagToggle}
        onClear={onFilterTagClear}
        counts={tagCounts}
        untaggedActive={filterTagIds.includes(UNTAGGED_SENTINEL)}
      />
    {/if}
    <div class="kanban-board" style="grid-template-columns: repeat({columns.length + (showArchivedTasks ? 1 : 0)}, 1fr);">
      {#each columns as column (column.name)}
        <div
          class="kanban-column"
          role="region"
          aria-label="{column.title} column"
        >
          <div class="column-header">
            <h2>{column.title}</h2>
            <div class="column-header-right">
              {#if column.type === 'done'}
                <button
                  type="button"
                  class="archive-all-btn"
                  onclick={handleArchiveAllDone}
                  title="Archive all done tasks"
                >
                  Archive all
                </button>
              {/if}
              <span class="task-count">{getColumnTaskCount(column.name)}</span>
              <div class="column-menu-wrapper">
                <button
                  type="button"
                  class="column-menu-btn"
                  onclick={(e) => { e.stopPropagation(); toggleColumnMenu(column.name); }}
                  aria-label="Column options for {column.title}"
                >
                  &#x22EF;
                </button>
                {#if columnMenuSlug === column.name}
                  <div class="column-menu-overlay" onclick={closeColumnMenu} role="presentation"></div>
                  <div class="column-menu" role="menu">
                    <button type="button" class="column-menu-item" onclick={() => handleRenameColumn(column.name)}>
                      Rename
                    </button>
                    {#if column.type === 'doing'}
                      <button type="button" class="column-menu-item" onclick={() => handleDeleteColumn(column.name)}>
                        Delete
                      </button>
                      <button type="button" class="column-menu-item" onclick={() => handleInsertColumnBefore(column.name)}>
                        Insert left
                      </button>
                      <button type="button" class="column-menu-item" onclick={() => handleInsertColumn(column.name)}>
                        Insert right
                      </button>
                    {:else if column.type === 'todo'}
                      <button type="button" class="column-menu-item" onclick={() => handleInsertColumn(column.name)}>
                        Insert right
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>

          {#if column.sections && column.sections.length > 0}
            <!-- Sectioned column: render sections as separate groups -->
            <div class="section-container">
              {#each column.sections as section (section.name)}
                {@const sectionTaskItems = sectionItems[section.name] ?? []}
                <div class="column-section" style="--section-color: {section.color};" data-testid="section-{section.name}">
                  <div class="section-header" style="background-color: {section.color};">
                    <span class="section-title">{section.title}</span>
                    <span class="section-count">{sectionTaskItems.length}</span>
                  </div>
                  <div
                    class="column-content"
                    use:dndzone={{ items: sectionTaskItems, flipDurationMs, type: 'board', dragDisabled: isValidating || isRollingBack }}
                    onconsider={(e) => handleSectionDndConsider(section.name, e)}
                    onfinalize={(e) => handleSectionDndFinalize(column.name, section.name, e)}
                  >
                    {#each sectionTaskItems as task (task.id)}
                      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                      <div
                        class="task-card"
                        onclick={() => handleTaskClick(task)}
                        oncontextmenu={(e) => handleTaskContextMenu(e, task)}
                        style="--theme-color: {getThemeColor(themes, task.themeId)};"
                        role="article"
                        aria-label="{task.title}"
                      >
                        <div class="task-header">
                          <ThemeBadge color={getThemeColor(themes, task.themeId)} size="sm" />
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
                        <TagBadges tags={task.tags} />
                        <div class="task-footer">
                          <button
                            type="button"
                            class="theme-name-btn"
                            onclick={(e) => { e.stopPropagation(); onNavigateToTheme?.(task.themeId); }}
                            title="Go to theme"
                          >
                            {getTheme(themes, task.themeId)?.name ?? 'Unknown'}
                          </button>
                          <button
                            type="button"
                            class="task-date"
                            title="Go to day"
                            onclick={(e) => { e.stopPropagation(); onNavigateToDay?.(task.dayDate); }}
                          >
                            {formatDate(task.dayDate)}
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
                          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                          <div
                            class="task-card subtask-card"
                            onclick={() => handleTaskClick(subtask)}
                            oncontextmenu={(e) => handleTaskContextMenu(e, subtask)}
                            style="--theme-color: {getThemeColor(themes, subtask.themeId)};"
                            role="article"
                            aria-label="{subtask.title}"
                          >
                            <h3 class="task-title">{subtask.title}</h3>
                            <TagBadges tags={subtask.tags} />
                          </div>
                        {/each}
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
              use:dndzone={{ items: columnItems[column.name] ?? [], flipDurationMs, type: 'board', dragDisabled: isValidating || isRollingBack }}
              onconsider={(e) => handleDndConsider(column.name, e)}
              onfinalize={(e) => handleDndFinalize(column.name, e)}
            >
              {#each getTopLevelTasks(column.name) as task (task.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                <div
                  class="task-card"
                  onclick={() => handleTaskClick(task)}
                  oncontextmenu={(e) => handleTaskContextMenu(e, task)}
                  style="--theme-color: {getThemeColor(themes, task.themeId)};"
                  role="article"
                  aria-label="{task.title}"
                >
                  <div class="task-header">
                    <ThemeBadge color={getThemeColor(themes, task.themeId)} size="sm" />
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
                  <TagBadges tags={task.tags} />
                  <div class="task-footer">
                    <button
                      type="button"
                      class="theme-name-btn"
                      onclick={(e) => { e.stopPropagation(); onNavigateToTheme?.(task.themeId); }}
                      title="Go to theme"
                    >
                      {getTheme(themes, task.themeId)?.name ?? 'Unknown'}
                    </button>
                    <button
                      type="button"
                      class="task-date"
                      title="Go to day"
                      onclick={(e) => { e.stopPropagation(); onNavigateToDay?.(task.dayDate); }}
                    >
                      {formatDate(task.dayDate)}
                    </button>
                    {#if column.type === 'done'}
                      <button
                        type="button"
                        class="archive-btn"
                        onclick={(e) => { e.stopPropagation(); handleArchiveTask(task.id); }}
                        aria-label="Archive task"
                        title="Archive task"
                      >
                        &#x2713;
                      </button>
                    {/if}
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
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                    <div
                      class="task-card subtask-card"
                      onclick={() => handleTaskClick(subtask)}
                      oncontextmenu={(e) => handleTaskContextMenu(e, subtask)}
                      style="--theme-color: {getThemeColor(themes, subtask.themeId)};"
                      role="article"
                      aria-label="{subtask.title}"
                    >
                      <h3 class="task-title">{subtask.title}</h3>
                      <TagBadges tags={subtask.tags} />
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

      {#if showArchivedTasks}
        <div
          class="kanban-column archived-column"
          role="region"
          aria-label="Archived column"
        >
          <div class="column-header">
            <h2>Archived</h2>
            <div class="column-header-right">
              <span class="task-count">{rootArchivedTasks.length}</span>
            </div>
          </div>

          <div class="column-content">
            {#each rootArchivedTasks as task (task.id)}
              <div
                class="task-card"
                style="--theme-color: {getThemeColor(themes, task.themeId)};"
                role="article"
                aria-label="{task.title}"
              >
                <div class="task-header">
                  <ThemeBadge color={getThemeColor(themes, task.themeId)} size="sm" />
                  <span class="priority-badge" style="background-color: {priorityColors[task.priority]};">
                    {priorityLabels[task.priority]}
                  </span>
                </div>
                <h3 class="task-title">{task.title}</h3>
                <TagBadges tags={task.tags} />
                <div class="task-footer">
                  <button
                    type="button"
                    class="theme-name-btn"
                    onclick={(e) => { e.stopPropagation(); onNavigateToTheme?.(task.themeId); }}
                    title="Go to theme"
                  >
                    {getTheme(themes, task.themeId)?.name ?? 'Unknown'}
                  </button>
                  <button
                    type="button"
                    class="task-date"
                    title="Go to day"
                    onclick={(e) => { e.stopPropagation(); onNavigateToDay?.(task.dayDate); }}
                  >
                    {formatDate(task.dayDate)}
                  </button>
                  <button
                    type="button"
                    class="restore-btn"
                    onclick={() => handleRestoreTask(task.id)}
                    title="Restore to done"
                  >
                    Restore
                  </button>
                </div>
              </div>
            {/each}

            {#if rootArchivedTasks.length === 0}
              <div class="empty-column">
                <p>No tasks</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}
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
          Go to Theme: {getTheme(themes, contextMenuTask.themeId)?.name ?? 'Unknown'}
        </button>
        <button type="button" class="context-menu-item" onclick={handleGoToDay}>
          Go to Day: {formatDate(contextMenuTask.dayDate)}
        </button>
      </div>
    </div>
  {/if}

  <!-- Create Task Dialog (Eisenhower matrix) -->
  <CreateTaskDialog
    open={showCreateDialog}
    {themes}
    {availableTags}
    onDone={handleCreateDone}
    onClose={handleCreateClose}
    createTask={apiCreateTaskAndInsert}
  />

  <!-- Edit Task Dialog -->
  <EditTaskDialog
    task={selectedTask}
    {themes}
    {availableTags}
    onSave={handleEditSave}
    onCancel={handleEditCancel}
  />

  <!-- Error Dialog (rule violations) -->
  {#if errorViolations.length > 0}
    <ErrorDialog violations={errorViolations} onClose={handleErrorClose} />
  {/if}

  <!-- Prompt Dialog (replaces window.prompt for WebView compatibility) -->
  {#if promptOpen}
    <div class="prompt-overlay" role="presentation" onclick={handlePromptCancel}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="prompt-dialog" role="dialog" tabindex="-1" aria-label={promptLabel} onclick={(e) => e.stopPropagation()}>
        <label class="prompt-label">
          {promptLabel}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            autofocus
            class="prompt-input"
            type="text"
            bind:value={promptValue}
            onkeydown={(e) => { if (e.key === 'Enter') handlePromptConfirm(); if (e.key === 'Escape') handlePromptCancel(); }}
          />
        </label>
        <div class="prompt-actions">
          <button type="button" class="prompt-cancel" onclick={handlePromptCancel}>Cancel</button>
          <button type="button" class="prompt-ok" onclick={handlePromptConfirm}>OK</button>
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
    background-color: var(--color-gray-100);
  }

  .eisenkan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .header-left {
    display: flex;
    align-items: baseline;
    gap: 1rem;
  }

  .eisenkan-header h1 {
    font-size: 1.5rem;
    color: var(--color-gray-800);
    margin: 0;
  }

  .current-day {
    font-size: 0.875rem;
    color: var(--color-gray-500);
  }

  .loading-state {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    color: var(--color-gray-500);
  }

  .kanban-board {
    display: grid;
    grid-auto-rows: 1fr;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }

  .kanban-column {
    display: flex;
    flex-direction: column;
    background-color: var(--color-gray-200);
    border-radius: 8px;
    padding: 0.75rem;
    min-height: 0;
    overflow: hidden;
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
    color: var(--color-gray-700);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .task-count {
    background-color: var(--color-gray-400);
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
    min-height: 0;
    overflow-y: auto;
  }

  .column-section {
    background-color: color-mix(in srgb, var(--section-color) 8%, white);
    border-radius: 6px;
    border: 1px solid var(--color-gray-300);
    padding: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    margin: -0.5rem -0.5rem 0.5rem -0.5rem;
    border-radius: 6px 6px 0 0;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: white;
    flex: 1;
  }

  .section-count {
    background-color: rgba(255, 255, 255, 0.25);
    color: white;
    font-size: 0.6875rem;
    font-weight: 600;
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
    border-left: 4px solid var(--theme-color, var(--color-gray-500));
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
    border: 1px solid var(--color-gray-300);
    color: var(--color-gray-500);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    padding: 0 0.375rem;
    line-height: 1.25;
    border-radius: 3px;
    transition: background-color 0.15s;
  }

  .toggle-btn:hover {
    background-color: var(--color-gray-100);
  }

  .subtask-count {
    font-size: 0.6875rem;
    color: var(--color-gray-500);
    font-weight: 500;
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

  .theme-name-btn {
    font-size: 0.75rem;
    color: var(--color-primary-500);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }

  .theme-name-btn:hover {
    color: var(--color-primary-600);
  }

  .task-date {
    font-size: 0.7rem;
    color: var(--color-gray-400);
    cursor: pointer;
    padding: 0.125rem 0.25rem;
    border-radius: 2px;
    background: none;
    border: none;
  }

  .task-date:hover {
    background-color: var(--color-gray-100);
    color: var(--color-gray-500);
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

  .column-header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .archive-all-btn {
    background: none;
    border: 1px solid var(--color-gray-300);
    color: var(--color-gray-500);
    font-size: 0.6875rem;
    cursor: pointer;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    transition: color 0.2s, background-color 0.2s;
  }

  .archive-all-btn:hover {
    color: var(--color-gray-700);
    background-color: var(--color-gray-300);
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

  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-gray-500);
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--color-gray-500);
  }

  .archived-column .task-card {
    cursor: default;
  }

  .archived-column .task-card:hover {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .archived-column .task-card:active {
    cursor: default;
    transform: none;
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

  .empty-column {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    min-height: 100px;
  }

  .empty-column p {
    color: var(--color-gray-400);
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
    border: 1px solid var(--color-gray-200);
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
    color: var(--color-gray-700);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .context-menu-item:hover {
    background-color: var(--color-gray-100);
  }

  .context-menu-item:first-child {
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
  }

  .context-menu-item:last-child {
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }

  /* Column menu styles */
  .column-menu-wrapper {
    position: relative;
  }

  .column-menu-btn {
    background: none;
    border: none;
    color: var(--color-gray-400);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
    border-radius: 4px;
    transition: color 0.15s, background-color 0.15s;
  }

  .column-menu-btn:hover {
    color: var(--color-gray-700);
    background-color: var(--color-gray-300);
  }

  .column-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .column-menu {
    position: absolute;
    right: 0;
    top: 100%;
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    z-index: 1000;
    overflow: hidden;
  }

  .column-menu-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    text-align: left;
    font-size: 0.8125rem;
    color: var(--color-gray-700);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .column-menu-item:hover {
    background-color: var(--color-gray-100);
  }

  /* Prompt dialog styles */
  .prompt-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .prompt-dialog {
    background: white;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    padding: 1.25rem;
    min-width: 300px;
    max-width: 400px;
  }

  .prompt-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
    margin-bottom: 0.5rem;
  }

  .prompt-input {
    display: block;
    width: 100%;
    margin-top: 0.375rem;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    font-size: 0.875rem;
    outline: none;
    box-sizing: border-box;
  }

  .prompt-input:focus {
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  .prompt-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .prompt-cancel,
  .prompt-ok {
    padding: 0.375rem 0.875rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .prompt-cancel {
    background: none;
    border: 1px solid var(--color-gray-300);
    color: var(--color-gray-600);
  }

  .prompt-cancel:hover {
    background-color: var(--color-gray-100);
  }

  .prompt-ok {
    background-color: var(--color-primary-500);
    border: none;
    color: white;
  }

  .prompt-ok:hover {
    background-color: var(--color-primary-600);
  }
</style>
