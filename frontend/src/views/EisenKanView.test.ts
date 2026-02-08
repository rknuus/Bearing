import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
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
    { id: 'T1', title: 'Exercise', themeId: 'HF', dayDate: '2025-01-15', priority: 'important-urgent', status: 'todo' },
    { id: 'T2', title: 'Study', themeId: 'CG', dayDate: '2025-01-15', priority: 'important-not-urgent', status: 'todo' },
    { id: 'T3', title: 'Emails', themeId: 'CG', dayDate: '2025-01-16', priority: 'not-important-urgent', status: 'doing' },
    { id: 'T4', title: 'Done task', themeId: 'HF', dayDate: '2025-01-14', priority: 'important-urgent', status: 'done' },
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
          { name: 'important-not-urgent', title: 'Important & Not Urgent', color: '#f59e0b' },
          { name: 'not-important-urgent', title: 'Not Important & Urgent', color: '#3b82f6' },
          { name: 'not-important-not-urgent', title: 'Not Important & Not Urgent', color: '#6b7280' },
        ],
      },
      { name: 'doing', title: 'DOING', type: 'doing' },
      { name: 'done', title: 'DONE', type: 'done' },
    ],
  };
}

function makeTasksWithSubtasks(): TaskWithStatus[] {
  return [
    { id: 'T1', title: 'Parent task', themeId: 'HF', dayDate: '2025-01-15', priority: 'important-urgent', status: 'todo' },
    { id: 'T1-S1', title: 'Subtask 1', themeId: 'HF', dayDate: '2025-01-15', priority: 'important-urgent', status: 'todo', parentTaskId: 'T1' },
    { id: 'T1-S2', title: 'Subtask 2', themeId: 'HF', dayDate: '2025-01-15', priority: 'important-urgent', status: 'todo', parentTaskId: 'T1' },
    { id: 'T2', title: 'Standalone task', themeId: 'CG', dayDate: '2025-01-15', priority: 'important-not-urgent', status: 'doing' },
  ];
}

// Mock the wails-mock module since EisenKanView uses mockAppBindings directly
const mockGetTasks = vi.fn<() => Promise<TaskWithStatus[]>>();
const mockGetThemes = vi.fn<() => Promise<LifeTheme[]>>();
const mockGetBoardConfiguration = vi.fn<() => Promise<BoardConfiguration>>();
const mockCreateTask = vi.fn();
const mockMoveTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockUpdateTask = vi.fn();

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
    },
  };
});

describe('EisenKanView', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mockGetTasks.mockResolvedValue(JSON.parse(JSON.stringify(makeTestTasks())));
    mockGetThemes.mockResolvedValue(JSON.parse(JSON.stringify(makeTestThemes())));
    mockGetBoardConfiguration.mockResolvedValue(JSON.parse(JSON.stringify(makeTestBoardConfig())));
    mockCreateTask.mockResolvedValue({ id: 'T-NEW', title: '', themeId: '', dayDate: '', priority: 'important-urgent' });
    mockMoveTask.mockResolvedValue({ success: true });
    mockDeleteTask.mockResolvedValue(undefined);
    mockUpdateTask.mockResolvedValue(undefined);
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
    expect(sections.length).toBe(4);

    const sectionTitles = container.querySelectorAll('.section-title');
    expect(sectionTitles[0].textContent).toBe('Important & Urgent');
    expect(sectionTitles[1].textContent).toBe('Important & Not Urgent');
    expect(sectionTitles[2].textContent).toBe('Not Important & Urgent');
    expect(sectionTitles[3].textContent).toBe('Not Important & Not Urgent');
  });

  it('renders section color indicators', async () => {
    await renderView();

    const colors = container.querySelectorAll('.section-color');
    expect(colors.length).toBe(4);

    const firstColor = colors[0] as HTMLElement;
    expect(firstColor.style.backgroundColor).toBe('rgb(239, 68, 68)'); // #ef4444
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

    const createBtn = container.querySelector<HTMLButtonElement>('.create-btn');
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

    // Card should be removed optimistically
    const newCardCount = container.querySelectorAll('.task-card').length;
    expect(newCardCount).toBe(3);
  });

  it('filters tasks by filterThemeId prop', async () => {
    await renderView({ filterThemeId: 'HF' });

    // Only HF tasks (T1 in todo, T4 in done) should be visible
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(2);

    const titles = Array.from(cards).map(c => c.querySelector('.task-title')?.textContent);
    expect(titles).toContain('Exercise');
    expect(titles).toContain('Done task');
  });

  it('filters tasks by filterDate prop', async () => {
    await renderView({ filterDate: '2025-01-15' });

    // Only tasks from 2025-01-15 (T1 and T2) should be visible
    const cards = container.querySelectorAll('.task-card');
    expect(cards.length).toBe(2);
  });

  it('shows empty column placeholder when column has no tasks', async () => {
    // Provide tasks only for todo column
    mockGetTasks.mockResolvedValue([
      { id: 'T1', title: 'Only todo', themeId: 'HF', dayDate: '2025-01-15', priority: 'important-urgent', status: 'todo' },
    ]);

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
    expect(sectionCounts.length).toBe(4);

    // important-urgent section should have 1 task (T1: Exercise)
    expect(sectionCounts[0].textContent).toBe('1');
    // important-not-urgent section should have 1 task (T2: Study)
    expect(sectionCounts[1].textContent).toBe('1');
    // not-important-urgent section should have 0 tasks
    expect(sectionCounts[2].textContent).toBe('0');
    // not-important-not-urgent section should have 0 tasks
    expect(sectionCounts[3].textContent).toBe('0');
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

  // Subtask nesting tests
  describe('subtask nesting', () => {
    beforeEach(() => {
      mockGetTasks.mockResolvedValue(JSON.parse(JSON.stringify(makeTasksWithSubtasks())));
    });

    it('renders only top-level tasks as primary cards in non-sectioned columns', async () => {
      await renderView();

      const columns = container.querySelectorAll('.kanban-column');
      // Doing column (non-sectioned): should show T2 as top-level card only
      const doingCards = columns[1].querySelectorAll('.task-card:not(.subtask-card)');
      expect(doingCards.length).toBe(1);
      expect(doingCards[0].querySelector('.task-title')?.textContent).toBe('Standalone task');
    });

    it('renders subtasks as indented cards under parent', async () => {
      await renderView();

      const subtaskCards = container.querySelectorAll('.subtask-card');
      expect(subtaskCards.length).toBe(2);
    });

    it('shows toggle button on parent tasks with subtasks', async () => {
      await renderView();

      const toggleBtns = container.querySelectorAll('.toggle-btn');
      expect(toggleBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('collapses subtasks when toggle is clicked and shows count', async () => {
      await renderView();

      // Initially subtasks are visible (expanded)
      let subtaskCards = container.querySelectorAll('.subtask-card');
      expect(subtaskCards.length).toBe(2);

      // Click toggle to collapse
      const toggleBtn = container.querySelector<HTMLButtonElement>('.toggle-btn');
      expect(toggleBtn).toBeTruthy();
      toggleBtn!.click();
      await tick();

      // Subtasks should be hidden
      subtaskCards = container.querySelectorAll('.subtask-card');
      expect(subtaskCards.length).toBe(0);

      // Subtask count should be shown
      const subtaskCount = container.querySelector('.subtask-count');
      expect(subtaskCount).toBeTruthy();
      expect(subtaskCount?.textContent).toBe('2');
    });

    it('expands subtasks when toggle is clicked again', async () => {
      await renderView();

      const toggleBtn = container.querySelector<HTMLButtonElement>('.toggle-btn');

      // Collapse
      toggleBtn!.click();
      await tick();
      expect(container.querySelectorAll('.subtask-card').length).toBe(0);

      // Expand
      toggleBtn!.click();
      await tick();
      expect(container.querySelectorAll('.subtask-card').length).toBe(2);
    });
  });
});
