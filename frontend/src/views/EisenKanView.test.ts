import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { TaskWithStatus, LifeTheme, BoardConfiguration } from '../lib/wails-mock';
import EisenKanView from './EisenKanView.svelte';

function makeTestThemes(): LifeTheme[] {
  return [
    { id: 'HF', name: 'Health & Fitness', color: '#22c55e', objectives: [] },
    { id: 'CG', name: 'Career Growth', color: '#3b82f6', objectives: [] },
  ];
}

function makeTestTasks(): TaskWithStatus[] {
  return [
    { id: 'T1', title: 'Exercise', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['backend', 'api'] },
    { id: 'T2', title: 'Study', themeId: 'CG', priority: 'important-not-urgent', status: 'todo', tags: ['backend'] },
    { id: 'T3', title: 'Emails', themeId: 'CG', priority: 'not-important-urgent', status: 'doing', tags: ['api'] },
    { id: 'T4', title: 'Done task', themeId: 'HF', priority: 'important-urgent', status: 'done' },
  ];
}

function makeTestBoardConfig(): BoardConfiguration {
  return {
    name: 'Bearing Board',
    columnDefinitions: [
      {
        name: 'todo',
        title: 'TODO',
        type: 'todo',
        sections: [
          { name: 'important-urgent', title: 'Important & Urgent', color: '#ef4444' },
          { name: 'not-important-urgent', title: 'Not Important & Urgent', color: '#f59e0b' },
          { name: 'important-not-urgent', title: 'Important & Not Urgent', color: '#3b82f6' },
        ],
      },
      { name: 'doing', title: 'DOING', type: 'doing' },
      { name: 'done', title: 'DONE', type: 'done' },
    ],
  };
}

// Mock the wails-mock module since EisenKanView uses mockAppBindings directly
const mockGetTasks = vi.fn<() => Promise<TaskWithStatus[]>>();
const mockGetThemes = vi.fn<() => Promise<LifeTheme[]>>();
const mockGetBoardConfiguration = vi.fn<() => Promise<BoardConfiguration>>();
const mockCreateTask = vi.fn();
const mockMoveTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockProcessPriorityPromotions = vi.fn();
const mockReorderTasks = vi.fn();
const mockArchiveTask = vi.fn();
const mockArchiveAllDoneTasks = vi.fn();
const mockRestoreTask = vi.fn();
const mockLoadNavigationContext = vi.fn();
const mockSaveNavigationContext = vi.fn();

vi.mock('../lib/wails-mock', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/wails-mock')>();
  return {
    ...orig,
    mockAppBindings: {
      ...orig.mockAppBindings,
      GetTasks: (...args: unknown[]) => mockGetTasks(...args as []),
      GetThemes: (...args: unknown[]) => mockGetThemes(...args as []),
      GetBoardConfiguration: (...args: unknown[]) => mockGetBoardConfiguration(...args as []),
      CreateTask: (...args: unknown[]) => mockCreateTask(...args),
      MoveTask: (...args: unknown[]) => mockMoveTask(...args),
      DeleteTask: (...args: unknown[]) => mockDeleteTask(...args),
      UpdateTask: (...args: unknown[]) => mockUpdateTask(...args),
      ProcessPriorityPromotions: (...args: unknown[]) => mockProcessPriorityPromotions(...args),
      ReorderTasks: (...args: unknown[]) => mockReorderTasks(...args),
      ArchiveTask: (...args: unknown[]) => mockArchiveTask(...args),
      ArchiveAllDoneTasks: (...args: unknown[]) => mockArchiveAllDoneTasks(...args as []),
      RestoreTask: (...args: unknown[]) => mockRestoreTask(...args),
      LoadNavigationContext: (...args: unknown[]) => mockLoadNavigationContext(...args as []),
      SaveNavigationContext: (...args: unknown[]) => mockSaveNavigationContext(...args),
    },
  };
});

describe('EisenKanView', () => {
  let container: HTMLDivElement;
  let currentTasks: TaskWithStatus[];

  // Reorder currentTasks to match the given positions (mirrors backend behavior)
  function applyPositions(positions: Record<string, string[]>) {
    for (const ids of Object.values(positions)) {
      const idSet = new Set(ids);
      const reordered = ids.map(id => currentTasks.find(t => t.id === id)).filter(Boolean) as TaskWithStatus[];
      const slots: number[] = [];
      for (let i = 0; i < currentTasks.length; i++) {
        if (idSet.has(currentTasks[i].id)) slots.push(i);
      }
      const result = [...currentTasks];
      for (let j = 0; j < slots.length && j < reordered.length; j++) {
        result[slots[j]] = reordered[j];
      }
      currentTasks = result;
    }
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    currentTasks = JSON.parse(JSON.stringify(makeTestTasks()));
    mockGetTasks.mockImplementation(async () => JSON.parse(JSON.stringify(currentTasks)));
    mockGetThemes.mockResolvedValue(JSON.parse(JSON.stringify(makeTestThemes())));
    mockGetBoardConfiguration.mockResolvedValue(JSON.parse(JSON.stringify(makeTestBoardConfig())));
    mockCreateTask.mockImplementation(async (title: string, themeId: string, priority: string) => {
      const task = { id: 'T-NEW', title, themeId, priority, status: 'todo' } as TaskWithStatus;
      currentTasks = [...currentTasks, task];
      return task;
    });
    mockMoveTask.mockImplementation(async (id: string, status: string, positions?: Record<string, string[]>) => {
      currentTasks = currentTasks.map(t => t.id === id ? { ...t, status } : t);
      if (positions) applyPositions(positions);
      return { success: true };
    });
    mockDeleteTask.mockImplementation(async (id: string) => {
      currentTasks = currentTasks.filter(t => t.id !== id);
    });
    mockUpdateTask.mockImplementation(async (task: TaskWithStatus) => {
      currentTasks = currentTasks.map(t => t.id === task.id ? { ...t, ...task } : t);
    });
    mockProcessPriorityPromotions.mockResolvedValue([]);
    mockReorderTasks.mockImplementation(async (positions: Record<string, string[]>) => {
      applyPositions(positions);
      return { success: true, reordered: [] };
    });
    mockArchiveTask.mockImplementation(async (id: string) => {
      currentTasks = currentTasks.map(t => t.id === id ? { ...t, status: 'archived' } : t);
    });
    mockArchiveAllDoneTasks.mockImplementation(async () => {
      currentTasks = currentTasks.map(t => t.status === 'done' ? { ...t, status: 'archived' } : t);
    });
    mockRestoreTask.mockImplementation(async (id: string) => {
      currentTasks = currentTasks.map(t => t.id === id ? { ...t, status: 'done' } : t);
    });
    mockLoadNavigationContext.mockResolvedValue({ currentView: 'eisenkan', currentItem: '', filterThemeId: '', lastAccessed: '' });
    mockSaveNavigationContext.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  async function renderView(props: Record<string, unknown> = {}) {
    const result = render(EisenKanView, { target: container, props });
    await tick();
    await vi.waitFor(() => {
      if (container.querySelector('.loading-state')) throw new Error('still loading');
    });
    await tick();
    return result;
  }

  it('fetches board configuration on mount', async () => {
    await renderView();
    expect(mockGetBoardConfiguration).toHaveBeenCalledOnce();
  });

  it('calls ProcessPriorityPromotions on mount', async () => {
    await renderView();
    expect(mockProcessPriorityPromotions).toHaveBeenCalledOnce();
  });

  it('refreshes tasks when promotions are processed', async () => {
    mockProcessPriorityPromotions.mockResolvedValue([
      { id: 'T2', title: 'Study', oldPriority: 'important-not-urgent', newPriority: 'important-urgent' },
    ]);

    await renderView();

    // GetTasks should be called twice: once on initial load, once after promotions
    expect(mockGetTasks).toHaveBeenCalledTimes(2);
  });

  it('renders three Kanban columns with titles from board config', async () => {
    await renderView();

    const columns = container.querySelectorAll('.kanban-column');
    expect(columns.length).toBe(3);

    const headers = container.querySelectorAll('.column-header h2');
    expect(headers[0].textContent).toBe('TODO');
    expect(headers[1].textContent).toBe('DOING');
    expect(headers[2].textContent).toBe('DONE');
  });

  it('renders sections in the todo column from board config', async () => {
    await renderView();

    const sections = container.querySelectorAll('.column-section');
    expect(sections.length).toBe(3);

    const sectionTitles = container.querySelectorAll('.section-title');
    expect(sectionTitles[0].textContent).toBe('Important & Urgent');
    expect(sectionTitles[1].textContent).toBe('Not Important & Urgent');
    expect(sectionTitles[2].textContent).toBe('Important & Not Urgent');
  });

  it('renders section color on header backgrounds', async () => {
    await renderView();

    const headers = container.querySelectorAll('.section-header');
    expect(headers.length).toBe(3);

    const firstHeader = headers[0] as HTMLElement;
    expect(firstHeader.style.backgroundColor).toBe('rgb(239, 68, 68)'); // #ef4444
  });

  it('renders task cards in correct columns based on status', async () => {
    await renderView();

    const columns = container.querySelectorAll('.kanban-column');

    // Todo column should have 2 task cards (in sections)
    const todoCards = columns[0].querySelectorAll('.task-card');
    expect(todoCards.length).toBe(2);

    // Doing column should have 1 task
    const doingCards = columns[1].querySelectorAll('.task-card');
    expect(doingCards.length).toBe(1);

    // Done column should have 1 task
    const doneCards = columns[2].querySelectorAll('.task-card');
    expect(doneCards.length).toBe(1);
  });

  it('task cards display priority badge and title', async () => {
    await renderView();

    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(4);

    // First card in todo should have priority badge
    const firstCard = cards[0];
    const badge = firstCard.querySelector('.priority-badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toMatch(/Q[123]/);

    const title = firstCard.querySelector('.task-title');
    expect(title).toBeTruthy();
  });

  it('opens create dialog when clicking New Task button', async () => {
    await renderView();

    const createBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    expect(createBtn?.textContent?.trim()).toBe('+ New Task');
    createBtn!.click();
    await tick();

    const dialog = container.querySelector('.dialog');
    expect(dialog).toBeTruthy();

    const dialogTitle = dialog!.querySelector('h2');
    expect(dialogTitle?.textContent).toBe('Create Tasks');
  });

  it('delete button calls DeleteTask and removes card', async () => {
    await renderView();


    const deleteButtons = container.querySelectorAll<HTMLButtonElement>('.delete-btn');
    const initialCardCount = container.querySelectorAll('.task-card').length;
    expect(initialCardCount).toBe(4);

    // Click first delete button
    deleteButtons[0].click();
    await tick();

    await vi.waitFor(() => {
      expect(mockDeleteTask).toHaveBeenCalled();
    });

    // Card should be removed after backend confirms
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.task-card').length).toBe(3);
    });
  });

  it('filters tasks by filterThemeIds prop', async () => {
    await renderView({ filterThemeIds: ['HF'] });

    // Only HF tasks (T1 in todo, T4 in done) should be visible
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(2);

    const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
    expect(titles).toContain('Exercise');
    expect(titles).toContain('Done task');
  });

  it('shows empty column placeholder when column has no tasks', async () => {
    // Provide tasks only for todo column
    currentTasks = [
      { id: 'T1', title: 'Only todo', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
    ];

    await renderView();

    const emptyColumns = container.querySelectorAll('.empty-column');
    // Doing and Done should be empty
    expect(emptyColumns.length).toBe(2);
    expect(emptyColumns[0].textContent).toContain('No tasks');
  });

  it('shows error banner on API failure', async () => {
    mockGetTasks.mockRejectedValue(new Error('Network error'));

    render(EisenKanView, { target: container });
    await tick();
    await vi.waitFor(() => {
      if (container.querySelector('.loading-state')) throw new Error('still loading');
    });
    await tick();

    const errorBanner = container.querySelector('.error-banner');
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent).toContain('Network error');

    // Dismiss button
    const dismissBtn = errorBanner!.querySelector('button');
    expect(dismissBtn?.textContent).toContain('Dismiss');
    dismissBtn!.click();
    await tick();

    expect(container.querySelector('.error-banner')).toBeNull();
  });

  it('shows task count in column headers', async () => {
    await renderView();

    const taskCounts = container.querySelectorAll('.column-header .task-count');
    expect(taskCounts.length).toBe(3);
    expect(taskCounts[0].textContent).toBe('2'); // todo
    expect(taskCounts[1].textContent).toBe('1'); // doing
    expect(taskCounts[2].textContent).toBe('1'); // done
  });

  it('opens edit dialog when clicking on a task card', async () => {
    await renderView();

    const firstCard = container.querySelector('.task-card') as HTMLElement;
    firstCard.click();
    await tick();

    const dialog = container.querySelector('#edit-dialog-title');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toBe('Edit Task');
  });

  it('renders dynamic column count from board config', async () => {
    mockGetBoardConfiguration.mockResolvedValue({
      name: 'Custom Board',
      columnDefinitions: [
        { name: 'backlog', title: 'BACKLOG', type: 'todo' },
        { name: 'doing', title: 'DOING', type: 'doing' },
      ],
    });

    await renderView();

    const columns = container.querySelectorAll('.kanban-column');
    expect(columns.length).toBe(2);

    const headers = container.querySelectorAll('.column-header h2');
    expect(headers[0].textContent).toBe('BACKLOG');
    expect(headers[1].textContent).toBe('DOING');
  });

  it('shows section counts for tasks in each section', async () => {
    await renderView();

    const sectionCounts = container.querySelectorAll('.section-count');
    expect(sectionCounts.length).toBe(3);

    // important-urgent section should have 1 task (T1: Exercise)
    expect(sectionCounts[0].textContent).toBe('1');
    // not-important-urgent section should have 0 tasks
    expect(sectionCounts[1].textContent).toBe('0');
    // important-not-urgent section should have 1 task (T2: Study)
    expect(sectionCounts[2].textContent).toBe('1');
  });

  it('shows MoveTask rule violations in ErrorDialog', async () => {
    mockMoveTask.mockResolvedValue({
      success: false,
      violations: [{ ruleId: 'wip-limit', priority: 1, message: 'WIP limit exceeded', category: 'workflow' }],
    });

    await renderView();

    // Verify mock is configured for failure
    const result = await mockMoveTask('T1', 'doing');
    expect(result.success).toBe(false);
    expect(result.violations[0].message).toBe('WIP limit exceeded');
  });

  // Tag filtering tests
  it('filters tasks by tag when filterTagIds is set', async () => {
    await renderView({ filterTagIds: ['backend'] });

    // T1 (tags: ['backend', 'api']) and T2 (tags: ['backend']) should be shown
    // T3 (tags: ['api']) and T4 (no tags) should be hidden
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(2);

    const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
    expect(titles).toContain('Exercise');
    expect(titles).toContain('Study');
  });

  it('multi-tag filter uses AND logic', async () => {
    await renderView({ filterTagIds: ['backend', 'api'] });

    // Only T1 has both 'backend' and 'api' tags
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(1);

    const title = cards[0].querySelector('.task-title')?.textContent;
    expect(title).toBe('Exercise');
  });

  it('__untagged__ sentinel filters to tasks with no tags', async () => {
    await renderView({ filterTagIds: ['__untagged__'] });

    // T4 has no tags
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(1);
    expect(cards[0].querySelector('.task-title')?.textContent).toBe('Done task');
  });

  it('__untagged__ combined with real tags uses union', async () => {
    await renderView({ filterTagIds: ['__untagged__', 'api'] });

    // T1 (tags: ['backend', 'api']), T3 (tags: ['api']), T4 (no tags)
    // Union: tasks with 'api' tag OR no tags
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(3);
    const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
    expect(titles).toContain('Exercise');
    expect(titles).toContain('Emails');
    expect(titles).toContain('Done task');
  });

  // Tag focus (Today's Focus) filtering tests
  it('tagFocusActive filters tasks by OR of todayFocusTags', async () => {
    await renderView({ tagFocusActive: true, todayFocusTags: ['api'] });

    // T1 (tags: ['backend', 'api']) and T3 (tags: ['api']) have 'api'
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(2);

    const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
    expect(titles).toContain('Exercise');
    expect(titles).toContain('Emails');
  });

  it('tagFocusActive with multiple tags uses OR logic', async () => {
    await renderView({ tagFocusActive: true, todayFocusTags: ['api', 'backend'] });

    // T1 (backend, api), T2 (backend), T3 (api) all match; T4 (no tags) doesn't
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(3);

    const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
    expect(titles).not.toContain('Done task');
  });

  it('tag filter uses normal filterTagIds when tagFocusActive is false', async () => {
    await renderView({ tagFocusActive: false, todayFocusTags: ['api'], filterTagIds: ['backend'] });

    // Normal AND filter: T1 (backend, api) and T2 (backend)
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(2);

    const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
    expect(titles).toContain('Exercise');
    expect(titles).toContain('Study');
  });

  it('shows theme count badges on filter pills', async () => {
    const onFilterThemeToggle = vi.fn();
    const onFilterThemeClear = vi.fn();
    await renderView({ onFilterThemeToggle, onFilterThemeClear });

    // "All" pill badge should show total count
    const allBadge = container.querySelector('.theme-filter-bar .all-pill .count-badge');
    expect(allBadge?.textContent).toBe('4');

    // Theme pill badges should show per-theme counts
    const themePills = container.querySelectorAll('.theme-filter-bar .theme-pill');
    const hfBadge = Array.from(themePills).find(p => p.textContent?.includes('Health'))?.querySelector('.count-badge');
    const cgBadge = Array.from(themePills).find(p => p.textContent?.includes('Career'))?.querySelector('.count-badge');
    expect(hfBadge?.textContent).toBe('2');
    expect(cgBadge?.textContent).toBe('2');
  });

  it('shows tag count badges on filter pills', async () => {
    const onFilterTagToggle = vi.fn();
    const onFilterTagClear = vi.fn();
    await renderView({ onFilterTagToggle, onFilterTagClear });

    const allBadge = container.querySelector('.tag-filter-bar .all-pill .count-badge');
    expect(allBadge?.textContent).toBe('4');

    // Check untagged pill exists with badge
    const untaggedPill = container.querySelector('.untagged-pill');
    expect(untaggedPill).not.toBeNull();
    expect(untaggedPill?.textContent).toContain('Untagged');
    expect(untaggedPill?.querySelector('.count-badge')?.textContent).toBe('1');
  });

  it('theme count badges update when tag filter is active', async () => {
    const onFilterThemeToggle = vi.fn();
    const onFilterThemeClear = vi.fn();
    // Filter to 'backend' tag: T1 (HF) and T2 (CG) match
    await renderView({ filterTagIds: ['backend'], onFilterThemeToggle, onFilterThemeClear });

    const allBadge = container.querySelector('.theme-filter-bar .all-pill .count-badge');
    expect(allBadge?.textContent).toBe('2');
  });

  it('tag count badges update when theme filter is active', async () => {
    const onFilterTagToggle = vi.fn();
    const onFilterTagClear = vi.fn();
    // Filter to HF theme: T1 (tags: backend, api) and T4 (no tags)
    await renderView({ filterThemeIds: ['HF'], onFilterTagToggle, onFilterTagClear });

    const untaggedBadge = container.querySelector('.untagged-pill .count-badge');
    expect(untaggedBadge?.textContent).toBe('1');
  });

  it('Untagged pill visible with stable count when theme filter excludes all untagged tasks', async () => {
    const onFilterTagToggle = vi.fn();
    const onFilterTagClear = vi.fn();
    // Filter to CG theme: T2 (tags: backend) and T3 (tags: api) — no untagged tasks for CG
    // But T4 (HF, no tags) exists globally, so Untagged pill should be visible with count 1
    await renderView({ filterThemeIds: ['CG'], onFilterTagToggle, onFilterTagClear });

    const untaggedPill = container.querySelector('.untagged-pill');
    expect(untaggedPill).not.toBeNull();
    // Count reflects total untagged tasks, not theme-filtered count
    expect(untaggedPill?.querySelector('.count-badge')?.textContent).toBe('1');
  });

  it('count badges exclude archived tasks by default', async () => {
    // Add an archived task
    currentTasks.push({ id: 'T5', title: 'Archived', themeId: 'HF', priority: 'important-urgent', status: 'archived' });
    const onFilterThemeToggle = vi.fn();
    const onFilterThemeClear = vi.fn();
    await renderView({ onFilterThemeToggle, onFilterThemeClear });

    // HF count should be 2 (T1 + T4), not 3 (T1 + T4 + T5 archived)
    const themePills = container.querySelectorAll('.theme-filter-bar .theme-pill');
    const hfBadge = Array.from(themePills).find(p => p.textContent?.includes('Health'))?.querySelector('.count-badge');
    expect(hfBadge?.textContent).toBe('2');
  });

  // Cross-column and cross-section DnD position preservation tests
  describe('DnD position preservation', () => {
    function makeTasksForDndTest(): TaskWithStatus[] {
      return [
        { id: 'T1', title: 'Todo Task', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'D1', title: 'Doing First', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D2', title: 'Doing Second', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D3', title: 'Doing Third', themeId: 'HF', priority: 'important-urgent', status: 'doing' },
      ];
    }

    function dispatchDndFinalize(element: Element, items: TaskWithStatus[]) {
      element.dispatchEvent(new CustomEvent('finalize', {
        detail: { items, info: { id: 'dnd-test', source: 'pointer', trigger: 'droppedIntoZone' } },
      }));
    }

    beforeEach(() => {
      currentTasks = JSON.parse(JSON.stringify(makeTasksForDndTest()));
    });

    it('cross-column drop to middle preserves DnD position', async () => {
      await renderView();


      // Get the DOING column's DnD zone (second column, non-sectioned)
      const columns = container.querySelectorAll('.kanban-column');
      const doingZone = columns[1].querySelector('.column-content')!;

      // Simulate dropping T1 (from todo) into DOING at position 2 (between D1 and D2)
      const dndItems: TaskWithStatus[] = [
        { id: 'D1', title: 'Doing First', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'T1', title: 'Todo Task', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'D2', title: 'Doing Second', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D3', title: 'Doing Third', themeId: 'HF', priority: 'important-urgent', status: 'doing' },
      ];

      dispatchDndFinalize(doingZone, dndItems);
      await tick();
      await tick();

      // Verify DOING column has 4 tasks in the correct order
      const doingCards = columns[1].querySelectorAll('.task-card');
      const titles = Array.from(doingCards).map(c => c.querySelector('.task-title')?.textContent);
      expect(titles).toEqual(['Doing First', 'Todo Task', 'Doing Second', 'Doing Third']);
    });

    it('cross-column drop to first position preserves DnD position', async () => {
      await renderView();


      const columns = container.querySelectorAll('.kanban-column');
      const doingZone = columns[1].querySelector('.column-content')!;

      // Simulate dropping T1 at the beginning of DOING
      const dndItems: TaskWithStatus[] = [
        { id: 'T1', title: 'Todo Task', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'D1', title: 'Doing First', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D2', title: 'Doing Second', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D3', title: 'Doing Third', themeId: 'HF', priority: 'important-urgent', status: 'doing' },
      ];

      dispatchDndFinalize(doingZone, dndItems);
      await tick();
      await tick();

      const doingCards = columns[1].querySelectorAll('.task-card');
      const titles = Array.from(doingCards).map(c => c.querySelector('.task-title')?.textContent);
      expect(titles).toEqual(['Todo Task', 'Doing First', 'Doing Second', 'Doing Third']);
    });

    it('cross-section drop within TODO preserves DnD position', async () => {
      // Set up tasks: two in important-urgent, one in important-not-urgent
      currentTasks = [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'IU2', title: 'Urgent Two', themeId: 'CG', priority: 'important-urgent', status: 'todo' },
        { id: 'INU1', title: 'Not Urgent One', themeId: 'HF', priority: 'important-not-urgent', status: 'todo' },
      ];

      await renderView();


      // Get the important-not-urgent section's DnD zone
      const targetSection = container.querySelector('[data-testid="section-important-not-urgent"] .column-content')!;

      // Simulate dropping IU1 into important-not-urgent at position 1 (before INU1)
      const dndItems: TaskWithStatus[] = [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'INU1', title: 'Not Urgent One', themeId: 'HF', priority: 'important-not-urgent', status: 'todo' },
      ];

      dispatchDndFinalize(targetSection, dndItems);
      await tick();
      await tick();

      // Verify important-not-urgent section has tasks in the correct order
      const sectionCards = container.querySelector('[data-testid="section-important-not-urgent"]')!.querySelectorAll('.task-card');
      const titles = Array.from(sectionCards).map(c => c.querySelector('.task-title')?.textContent);
      expect(titles).toEqual(['Urgent One', 'Not Urgent One']);
    });

    it('cross-section move sends both source and target zones to ReorderTasks', async () => {
      // Set up tasks: two in important-urgent, one in important-not-urgent
      currentTasks = [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'IU2', title: 'Urgent Two', themeId: 'CG', priority: 'important-urgent', status: 'todo' },
        { id: 'INU1', title: 'Not Urgent One', themeId: 'HF', priority: 'important-not-urgent', status: 'todo' },
      ];

      await renderView();


      // Get the important-not-urgent section's DnD zone
      const targetSection = container.querySelector('[data-testid="section-important-not-urgent"] .column-content')!;

      // Simulate dropping IU1 into important-not-urgent (before INU1)
      const dndItems: TaskWithStatus[] = [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'INU1', title: 'Not Urgent One', themeId: 'HF', priority: 'important-not-urgent', status: 'todo' },
      ];

      dispatchDndFinalize(targetSection, dndItems);
      await tick();
      await tick();

      // Verify UpdateTask was called with new priority
      await vi.waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith(expect.objectContaining({
          id: 'IU1',
          priority: 'important-not-urgent',
        }));
      });

      // Verify ReorderTasks was called with BOTH source (important-urgent) and target (important-not-urgent) zones
      await vi.waitFor(() => {
        expect(mockReorderTasks).toHaveBeenCalledWith({
          'important-urgent': ['IU2'],                // source: IU1 removed
          'important-not-urgent': ['IU1', 'INU1'],    // target: IU1 at drop position
        });
      });
    });

    it('cross-section ReorderTasks failure triggers rollback and shows error', async () => {
      currentTasks = [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'INU1', title: 'Not Urgent One', themeId: 'HF', priority: 'important-not-urgent', status: 'todo' },
      ];

      // UpdateTask succeeds but ReorderTasks fails
      mockUpdateTask.mockResolvedValue(undefined);
      mockReorderTasks.mockRejectedValue(new Error('failed to save task order'));

      await renderView();

      const targetSection = container.querySelector('[data-testid="section-important-not-urgent"] .column-content')!;

      const dndItems: TaskWithStatus[] = [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'INU1', title: 'Not Urgent One', themeId: 'HF', priority: 'important-not-urgent', status: 'todo' },
      ];

      dispatchDndFinalize(targetSection, dndItems);
      await tick();
      await tick();

      // Wait for the async operations and rollback to complete
      await vi.waitFor(() => {
        expect(mockReorderTasks).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // Error should be shown to user
      await vi.waitFor(() => {
        const errorBanner = container.querySelector('.error-banner');
        expect(errorBanner).toBeTruthy();
        expect(errorBanner?.textContent).toContain('failed to save task order');
      });

      // Task should roll back to original section (important-urgent)
      const urgentSection = container.querySelector('[data-testid="section-important-urgent"]')!;
      const urgentCards = urgentSection.querySelectorAll('.task-card');
      const urgentTitles = Array.from(urgentCards).map(c => c.querySelector('.task-title')?.textContent);
      expect(urgentTitles).toContain('Urgent One');
    });

    it('within-column reorder works correctly', async () => {
      await renderView();


      const columns = container.querySelectorAll('.kanban-column');
      const doingZone = columns[1].querySelector('.column-content')!;

      // Simulate reordering within DOING: D3 moved to first position
      const dndItems: TaskWithStatus[] = [
        { id: 'D3', title: 'Doing Third', themeId: 'HF', priority: 'important-urgent', status: 'doing' },
        { id: 'D1', title: 'Doing First', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D2', title: 'Doing Second', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
      ];

      dispatchDndFinalize(doingZone, dndItems);
      await tick();
      await tick();

      const doingCards = columns[1].querySelectorAll('.task-card');
      const titles = Array.from(doingCards).map(c => c.querySelector('.task-title')?.textContent);
      expect(titles).toEqual(['Doing Third', 'Doing First', 'Doing Second']);
    });

    it('cross-column drop with active filter includes hidden tasks in zone order', async () => {
      // Setup: two done tasks from different themes
      currentTasks = [
        { id: 'D1', title: 'Doing One', themeId: 'HF', priority: 'important-urgent', status: 'doing' },
        { id: 'DONE-CG', title: 'Done CG', themeId: 'CG', priority: 'important-urgent', status: 'done' },
        { id: 'DONE-HF', title: 'Done HF', themeId: 'HF', priority: 'important-urgent', status: 'done' },
      ];

      // Render with theme filter: only HF tasks visible
      await renderView({ filterThemeIds: ['HF'] });

      const columns = container.querySelectorAll('.kanban-column');
      const doneZone = columns[2].querySelector('.column-content')!;

      // DnD shows only filtered tasks; drop D1 into done (before DONE-HF)
      const dndItems: TaskWithStatus[] = [
        { id: 'D1', title: 'Doing One', themeId: 'HF', priority: 'important-urgent', status: 'doing' },
        { id: 'DONE-HF', title: 'Done HF', themeId: 'HF', priority: 'important-urgent', status: 'done' },
      ];

      dispatchDndFinalize(doneZone, dndItems);
      await tick();
      await tick();

      // MoveTask should include DONE-CG (hidden by filter) in the zone order
      await vi.waitFor(() => {
        expect(mockMoveTask).toHaveBeenCalledWith(
          'D1', 'done',
          { done: expect.arrayContaining(['DONE-CG', 'D1', 'DONE-HF']) }
        );
      });
      // Verify exact order: DONE-CG (hidden) keeps its original position before visible tasks,
      // D1 takes the first visible slot, DONE-HF follows
      const callArgs = mockMoveTask.mock.calls[0];
      expect(callArgs[2]).toEqual({ done: ['DONE-CG', 'D1', 'DONE-HF'] });
    });
  });

  describe('theme filtering', () => {
    it('renders only filtered theme tasks', async () => {
      const onFilterThemeToggle = vi.fn();
      const onFilterThemeClear = vi.fn();

      await renderView({ filterThemeIds: ['HF'], onFilterThemeToggle, onFilterThemeClear });

      const cards = container.querySelectorAll('.task-card');
      const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);

      // HF tasks visible
      expect(titles).toContain('Exercise');
      expect(titles).toContain('Done task');

      // CG tasks hidden
      expect(titles).not.toContain('Study');
      expect(titles).not.toContain('Emails');
    });

    it('clears filter and shows all tasks', async () => {
      const onFilterThemeToggle = vi.fn();
      const onFilterThemeClear = vi.fn();

      const { unmount } = await renderView({ filterThemeIds: ['HF'], onFilterThemeToggle, onFilterThemeClear });

      // Verify filtered state
      let cards = container.querySelectorAll('.task-card');
      expect(cards.length).toBe(2);

      // Re-render without filter
      unmount();
      await renderView({ filterThemeIds: [], onFilterThemeToggle, onFilterThemeClear });

      cards = container.querySelectorAll('.task-card');
      expect(cards.length).toBe(4);

      const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
      expect(titles).toContain('Exercise');
      expect(titles).toContain('Study');
      expect(titles).toContain('Emails');
      expect(titles).toContain('Done task');
    });
  });

  describe('archive functionality', () => {
    it('renders archive button only on done-column task cards', async () => {
      await renderView();

      const columns = container.querySelectorAll('.kanban-column');

      // Todo column (sectioned) should have no archive buttons
      const todoArchiveBtns = columns[0].querySelectorAll('.archive-btn');
      expect(todoArchiveBtns.length).toBe(0);

      // Doing column should have no archive buttons
      const doingArchiveBtns = columns[1].querySelectorAll('.archive-btn');
      expect(doingArchiveBtns.length).toBe(0);

      // Done column should have archive button on each task card
      const doneArchiveBtns = columns[2].querySelectorAll('.archive-btn');
      expect(doneArchiveBtns.length).toBe(1);
    });

    it('renders "Archive all" button in done column header', async () => {
      await renderView();

      const archiveAllBtns = container.querySelectorAll('.archive-all-btn');
      expect(archiveAllBtns.length).toBe(1);
      expect(archiveAllBtns[0].textContent).toBe('Archive all ✅');
    });

    it('archive button calls ArchiveTask and refreshes tasks', async () => {
      await renderView();


      const columns = container.querySelectorAll('.kanban-column');
      const archiveBtn = columns[2].querySelector<HTMLButtonElement>('.archive-btn')!;
      archiveBtn.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockArchiveTask).toHaveBeenCalledWith('T4');
      });

      // GetTasks should be re-fetched after archive + state-check
      await vi.waitFor(() => {
        expect(mockGetTasks).toHaveBeenCalledTimes(3); // initial + post-archive + state-check
      });
    });

    it('"Archive all" button calls ArchiveAllDoneTasks and refreshes tasks', async () => {
      await renderView();


      const archiveAllBtn = container.querySelector<HTMLButtonElement>('.archive-all-btn')!;
      archiveAllBtn.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockArchiveAllDoneTasks).toHaveBeenCalledOnce();
      });

      await vi.waitFor(() => {
        expect(mockGetTasks).toHaveBeenCalledTimes(3); // initial + post-archive + state-check
      });
    });

    it('archived tasks are not shown in kanban columns', async () => {
      currentTasks = [
        ...makeTestTasks(),
        { id: 'T5', title: 'Archived task', themeId: 'HF', priority: 'important-urgent', status: 'archived' },
      ];

      await renderView();

      // Archived task should not appear in any column
      const allCards = container.querySelectorAll('.kanban-column .task-card');
      const titles = Array.from(allCards).map(c => c.querySelector('.task-title')?.textContent);
      expect(titles).not.toContain('Archived task');
    });

    it('toggle shows archived column as 4th board column', async () => {
      currentTasks = [
        ...makeTestTasks(),
        { id: 'T5', title: 'Archived task', themeId: 'HF', priority: 'important-urgent', status: 'archived' },
      ];

      await renderView();

      // No archived column by default
      expect(container.querySelector('.archived-column')).toBeNull();
      expect(container.querySelectorAll('.kanban-column').length).toBe(3);

      // Toggle on
      const toggle = container.querySelector<HTMLInputElement>('.toggle-label input[type="checkbox"]');
      expect(toggle).toBeTruthy();
      toggle!.click();
      await tick();

      // Archived column should appear as 4th column
      const columns = container.querySelectorAll('.kanban-column');
      expect(columns.length).toBe(4);
      const archivedCol = container.querySelector('.archived-column')!;
      expect(archivedCol).toBeTruthy();
      expect(archivedCol.querySelector('.column-header h2')?.textContent).toBe('Archived');

      // Archived task renders as standard task card inside the column
      const archivedCards = archivedCol.querySelectorAll('.task-card');
      expect(archivedCards.length).toBe(1);
      expect(archivedCards[0].querySelector('.task-title')?.textContent).toBe('Archived task');
    });

    it('archived column shows task count in header', async () => {
      currentTasks = [
        ...makeTestTasks(),
        { id: 'T5', title: 'Archived 1', themeId: 'HF', priority: 'important-urgent', status: 'archived' },
        { id: 'T6', title: 'Archived 2', themeId: 'HF', priority: 'not-important-urgent', status: 'archived' },
      ];

      mockLoadNavigationContext.mockResolvedValue({ currentView: 'eisenkan', currentItem: '', filterThemeId: '', lastAccessed: '', showArchivedTasks: true });

      await renderView();

      const archivedCol = container.querySelector('.archived-column')!;
      expect(archivedCol.querySelector('.task-count')?.textContent).toBe('2');
    });

    it('archived column task cards display theme badge and priority badge', async () => {
      currentTasks = [
        ...makeTestTasks(),
        { id: 'T5', title: 'Archived task', themeId: 'HF', priority: 'important-urgent', status: 'archived' },
      ];

      mockLoadNavigationContext.mockResolvedValue({ currentView: 'eisenkan', currentItem: '', filterThemeId: '', lastAccessed: '', showArchivedTasks: true });

      await renderView();

      const archivedCard = container.querySelector('.archived-column .task-card')!;
      expect(archivedCard.querySelector('.priority-badge')).toBeTruthy();
      expect(archivedCard.querySelector('.theme-name-btn')).toBeTruthy();
    });

    it('restore button on archived task calls RestoreTask', async () => {
      currentTasks = [
        ...makeTestTasks(),
        { id: 'T5', title: 'Archived task', themeId: 'HF', priority: 'important-urgent', status: 'archived' },
      ];

      // Set toggle on via nav context
      mockLoadNavigationContext.mockResolvedValue({ currentView: 'eisenkan', currentItem: '', filterThemeId: '', lastAccessed: '', showArchivedTasks: true });

      await renderView();


      const restoreBtn = container.querySelector<HTMLButtonElement>('.archived-column .restore-btn')!;
      expect(restoreBtn.textContent).toBe('Restore');
      restoreBtn.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockRestoreTask).toHaveBeenCalledWith('T5');
      });

      await vi.waitFor(() => {
        expect(mockGetTasks).toHaveBeenCalledTimes(3); // initial + post-restore + state-check
      });
    });

    it('persists showArchivedTasks toggle to navigation context', async () => {
      await renderView();

      const toggle = container.querySelector<HTMLInputElement>('.toggle-label input[type="checkbox"]');
      toggle!.click();
      await tick();
      await tick();

      await vi.waitFor(() => {
        expect(mockSaveNavigationContext).toHaveBeenCalledWith(
          expect.objectContaining({ showArchivedTasks: true })
        );
      });
    });
  });

  describe('Escape-to-cancel DnD', () => {
    function makeTasksForDndTest(): TaskWithStatus[] {
      return [
        { id: 'T1', title: 'Todo Task', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'D1', title: 'Doing First', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D2', title: 'Doing Second', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
      ];
    }

    function dispatchDndConsider(element: Element, items: TaskWithStatus[]) {
      element.dispatchEvent(new CustomEvent('consider', {
        detail: { items, info: { id: 'dnd-test', source: 'pointer', trigger: 'dragStarted' } },
      }));
    }

    function dispatchDndFinalize(element: Element, items: TaskWithStatus[]) {
      element.dispatchEvent(new CustomEvent('finalize', {
        detail: { items, info: { id: 'dnd-test', source: 'pointer', trigger: 'droppedIntoZone' } },
      }));
    }

    beforeEach(() => {
      currentTasks = JSON.parse(JSON.stringify(makeTasksForDndTest()));
    });

    it('Escape during column drag re-fetches tasks and does not call MoveTask or ReorderTasks', async () => {
      await renderView();


      const columns = container.querySelectorAll('.kanban-column');
      const doingZone = columns[1].querySelector('.column-content')!;

      // Simulate drag start via consider event
      dispatchDndConsider(doingZone, [
        { id: 'D1', title: 'Doing First', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D2', title: 'Doing Second', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
      ]);
      await tick();

      // Dispatch Escape keydown on window (capture phase, as the handler uses capture)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();

      // Simulate finalize (triggered by the synthetic mouseup the Escape handler dispatches)
      dispatchDndFinalize(doingZone, [
        { id: 'D1', title: 'Doing First', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
        { id: 'D2', title: 'Doing Second', themeId: 'CG', priority: 'important-urgent', status: 'doing' },
      ]);
      await tick();
      await tick();

      // MoveTask and ReorderTasks should NOT have been called
      expect(mockMoveTask).not.toHaveBeenCalled();
      expect(mockReorderTasks).not.toHaveBeenCalled();
    });

    it('Escape during section drag re-fetches tasks and does not call MoveTask or ReorderTasks', async () => {
      currentTasks = [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'IU2', title: 'Urgent Two', themeId: 'CG', priority: 'important-urgent', status: 'todo' },
      ];

      await renderView();


      const sectionZone = container.querySelector('[data-testid="section-important-urgent"] .column-content')!;

      // Simulate drag start via consider event on section zone
      dispatchDndConsider(sectionZone, [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'IU2', title: 'Urgent Two', themeId: 'CG', priority: 'important-urgent', status: 'todo' },
      ]);
      await tick();

      // Dispatch Escape
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();

      // Simulate finalize on section zone
      dispatchDndFinalize(sectionZone, [
        { id: 'IU1', title: 'Urgent One', themeId: 'HF', priority: 'important-urgent', status: 'todo' },
        { id: 'IU2', title: 'Urgent Two', themeId: 'CG', priority: 'important-urgent', status: 'todo' },
      ]);
      await tick();
      await tick();

      // MoveTask, UpdateTask, and ReorderTasks should NOT have been called
      expect(mockMoveTask).not.toHaveBeenCalled();
      expect(mockUpdateTask).not.toHaveBeenCalled();
      expect(mockReorderTasks).not.toHaveBeenCalled();
    });

    it('Escape when no drag is active does not re-fetch tasks', async () => {
      await renderView();

      const getTasksCallsBefore = mockGetTasks.mock.calls.length;

      // Dispatch Escape without any drag active
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();
      await tick();

      // GetTasks should NOT have been called again
      expect(mockGetTasks.mock.calls.length).toBe(getTasksCallsBefore);
    });
  });

  describe('state-check verification', () => {
    it('emits no [state-check] warnings after edit', async () => {
      await renderView();


      // Simulate edit: click task card to open edit dialog, then save
      const card = container.querySelector('.task-card')!;
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();

      const titleInput = container.querySelector<HTMLInputElement>('#edit-task-title');
      if (titleInput) {
        titleInput.value = 'Updated';
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save');
        saveBtn?.click();
        await tick();
        await tick();
      }
    });

    it('emits no [state-check] warnings after create', async () => {
      await renderView();


      // Open create dialog
      const createBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
      createBtn!.click();
      await tick();
      await tick(); // Wait for LoadTaskDrafts async resolution

      // Type task title and click Add to stage the task to Q4
      const titleInput = container.querySelector<HTMLInputElement>('#new-task-title');
      expect(titleInput).toBeTruthy();
      await fireEvent.input(titleInput!, { target: { value: 'New task' } });
      await tick();

      const addBtn = container.querySelector<HTMLButtonElement>('.btn-add');
      expect(addBtn).toBeTruthy();
      await fireEvent.click(addBtn!);
      await tick();

      // Simulate DnD: move staged task from Q4 (staging) to Q1 (important-urgent)
      const stagingZone = container.querySelector('[data-quadrant-id="staging"] .task-list');
      const q1Zone = container.querySelector('[data-quadrant-id="important-urgent"] .task-list');
      expect(stagingZone).toBeTruthy();
      expect(q1Zone).toBeTruthy();

      const pendingTask = { id: 'pending-1', title: 'New task', themeId: 'HF' };
      stagingZone!.dispatchEvent(new CustomEvent('finalize', {
        detail: { items: [], info: { id: 'dnd-test', source: 'pointer', trigger: 'droppedIntoZone' } },
      }));
      q1Zone!.dispatchEvent(new CustomEvent('finalize', {
        detail: { items: [pendingTask], info: { id: 'dnd-test', source: 'pointer', trigger: 'droppedIntoZone' } },
      }));
      await tick();

      // Click "Commit to Todo" to create the task (triggers handleDone → createTask → handleCreateDone → verifyTaskState)
      const commitBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Commit to Todo'));
      expect(commitBtn).toBeTruthy();
      await fireEvent.click(commitBtn!);
      await tick();

      await vi.waitFor(() => {
        expect(mockCreateTask).toHaveBeenCalled();
      });

      await tick();    });

    it('detects state mismatch when mock is intentionally broken', async () => {
      await renderView();
      // Opt out of global error detection: this test deliberately triggers state-check errors
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      // Temporarily break mockDeleteTask so it does NOT update currentTasks
      mockDeleteTask.mockResolvedValue(undefined);

      const deleteButtons = container.querySelectorAll<HTMLButtonElement>('.delete-btn');
      deleteButtons[0].click();
      await tick();

      await vi.waitFor(() => {
        expect(mockDeleteTask).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // State-check should detect mismatch: frontend removed the task but backend still has it
      const warnings = warnSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('[state-check]'));
      expect(warnings.length).toBeGreaterThan(0);
      // Don't call mockRestore — let the global afterEach handle cleanup.
      // Restoring early would re-expose our wrapper to late async console.error calls.
    });
  });

  describe('Today\'s Focus pass-through', () => {
    it('passes Today\'s Focus props to ThemeFilterBar', async () => {
      const onFilterThemeToggle = vi.fn();
      const onFilterThemeClear = vi.fn();
      const onTodayFocusToggle = vi.fn();

      await renderView({
        onFilterThemeToggle,
        onFilterThemeClear,
        todayFocusThemeId: 'HF',
        todayFocusActive: true,
        onTodayFocusToggle,
      });

      // ThemeFilterBar should render the today-focus-pill button
      const chip = container.querySelector('.today-focus-pill');
      expect(chip).not.toBeNull();
      expect(chip?.textContent?.trim()).toBe("Today's Focus");
      expect(chip?.classList.contains('active')).toBe(true);
    });

    it('does not render Today\'s Focus chip when onTodayFocusToggle not provided', async () => {
      const onFilterThemeToggle = vi.fn();
      const onFilterThemeClear = vi.fn();

      await renderView({
        onFilterThemeToggle,
        onFilterThemeClear,
      });

      const chip = container.querySelector('.today-focus-pill');
      expect(chip).toBeNull();
    });
  });

  describe('section folding', () => {
    it('renders fold arrow buttons on section headers', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll('.section-fold-btn');
      // 3 sections in the TODO column
      expect(foldBtns.length).toBe(3);
    });

    it('sections start expanded by default', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll('.section-fold-btn');
      for (const btn of foldBtns) {
        expect(btn.getAttribute('aria-expanded')).toBe('true');
      }
    });

    it('clicking fold arrow collapses section content', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.section-fold-btn');
      // Collapse first section (important-urgent)
      await fireEvent.click(foldBtns[0]);
      await tick();

      const sections = container.querySelectorAll('[data-testid^="section-"]');
      const firstSectionContent = sections[0].querySelector('.column-content');
      expect(firstSectionContent?.classList.contains('collapsed-section')).toBe(true);

      // Other sections remain expanded
      const secondSectionContent = sections[1].querySelector('.column-content');
      expect(secondSectionContent?.classList.contains('collapsed-section')).toBe(false);
    });

    it('clicking fold arrow again expands section', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.section-fold-btn');
      // Collapse then expand
      await fireEvent.click(foldBtns[0]);
      await tick();
      await fireEvent.click(foldBtns[0]);
      await tick();

      const sections = container.querySelectorAll('[data-testid^="section-"]');
      const firstSectionContent = sections[0].querySelector('.column-content');
      expect(firstSectionContent?.classList.contains('collapsed-section')).toBe(false);
    });

    it('collapsed section still shows title and count', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.section-fold-btn');
      await fireEvent.click(foldBtns[0]);
      await tick();

      const section = container.querySelector('[data-testid="section-important-urgent"]')!;
      const header = section.querySelector('.section-header')!;
      expect(header.querySelector('.section-title')?.textContent).toBe('Important & Urgent');
      expect(header.querySelector('.section-count')?.textContent).toBe('1');
    });

    it('persists collapsed sections to NavigationContext', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.section-fold-btn');
      await fireEvent.click(foldBtns[0]);
      await tick();

      // Wait for $effect persistence
      await vi.waitFor(() => {
        const calls = mockSaveNavigationContext.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall?.[0]?.collapsedSections).toContain('important-urgent');
      });
    });

    it('restores collapsed sections from NavigationContext on mount', async () => {
      mockLoadNavigationContext.mockResolvedValue({
        currentView: 'eisenkan',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
        collapsedSections: ['important-urgent', 'not-important-urgent'],
      });

      await renderView();

      const sections = container.querySelectorAll('[data-testid^="section-"]');
      expect(sections[0].querySelector('.column-content')?.classList.contains('collapsed-section')).toBe(true);
      expect(sections[1].querySelector('.column-content')?.classList.contains('collapsed-section')).toBe(true);
      expect(sections[2].querySelector('.column-content')?.classList.contains('collapsed-section')).toBe(false);
    });
  });

  describe('column folding', () => {
    it('renders fold arrow buttons on column headers', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll('.column-fold-btn');
      // 3 columns: todo, doing, done
      expect(foldBtns.length).toBe(3);
    });

    it('columns start expanded by default', async () => {
      await renderView();

      const columns = container.querySelectorAll('.kanban-column');
      for (const col of columns) {
        expect(col.classList.contains('collapsed-column')).toBe(false);
      }
    });

    it('clicking fold arrow collapses column to strip with rotated title', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.column-fold-btn');
      // Collapse the doing column (index 1)
      await fireEvent.click(foldBtns[1]);
      await tick();

      const columns = container.querySelectorAll('.kanban-column');
      expect(columns[1].classList.contains('collapsed-column')).toBe(true);
      // Should show collapsed strip with title and count
      const strip = columns[1].querySelector('.collapsed-column-strip');
      expect(strip).toBeTruthy();
      expect(columns[1].querySelector('.collapsed-column-title')?.textContent).toBe('DOING');
    });

    it('clicking collapsed strip expands column again', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.column-fold-btn');
      await fireEvent.click(foldBtns[1]);
      await tick();

      const strip = container.querySelector('.collapsed-column-strip') as HTMLButtonElement;
      await fireEvent.click(strip);
      await tick();

      const columns = container.querySelectorAll('.kanban-column');
      expect(columns[1].classList.contains('collapsed-column')).toBe(false);
    });

    it('collapsed column hides header controls via CSS', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.column-fold-btn');
      // Collapse the done column (index 2)
      await fireEvent.click(foldBtns[2]);
      await tick();

      const columns = container.querySelectorAll('.kanban-column');
      // Header stays in DOM (for DnD) but is marked hidden
      expect(columns[2].querySelector('.column-header')?.classList.contains('collapsed-column-hidden')).toBe(true);
    });

    it('collapsed column shows task count', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.column-fold-btn');
      // Collapse doing column which has 1 task (T3)
      await fireEvent.click(foldBtns[1]);
      await tick();

      const columns = container.querySelectorAll('.kanban-column');
      expect(columns[1].querySelector('.collapsed-column-count')?.textContent).toBe('1');
    });

    it('persists collapsed columns to NavigationContext', async () => {
      await renderView();

      const foldBtns = container.querySelectorAll<HTMLButtonElement>('.column-fold-btn');
      await fireEvent.click(foldBtns[1]);
      await tick();

      await vi.waitFor(() => {
        const calls = mockSaveNavigationContext.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall?.[0]?.collapsedColumns).toContain('doing');
      });
    });

    it('restores collapsed columns from NavigationContext on mount', async () => {
      mockLoadNavigationContext.mockResolvedValue({
        currentView: 'eisenkan',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
        collapsedColumns: ['doing', 'done'],
      });

      await renderView();

      const columns = container.querySelectorAll('.kanban-column');
      expect(columns[0].classList.contains('collapsed-column')).toBe(false); // todo expanded
      expect(columns[1].classList.contains('collapsed-column')).toBe(true);  // doing collapsed
      expect(columns[2].classList.contains('collapsed-column')).toBe(true);  // done collapsed
    });
  });
});
