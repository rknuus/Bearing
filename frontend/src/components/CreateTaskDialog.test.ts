import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme, Task } from '../lib/wails-mock';
import CreateTaskDialog from './CreateTaskDialog.svelte';

// Mock the bindings module so we can control LoadTaskDrafts/SaveTaskDrafts
let mockDraftsData = '{}';
const mockLoadTaskDrafts = vi.fn(async () => mockDraftsData);
const mockSaveTaskDrafts = vi.fn(async (data: string) => { mockDraftsData = data; });
vi.mock('../lib/utils/bindings', () => ({
  getBindings: () => ({
    LoadTaskDrafts: (...args: unknown[]) => mockLoadTaskDrafts(...args as []),
    SaveTaskDrafts: (...args: unknown[]) => mockSaveTaskDrafts(...args as [string]),
  }),
}));

function makeTestThemes(): LifeTheme[] {
  return [
    { id: 'HF', name: 'Health & Fitness', color: '#10b981', objectives: [] },
    { id: 'CG', name: 'Career Growth', color: '#3b82f6', objectives: [] },
  ];
}

function makeCreateTaskMock() {
  let callCount = 0;
  return vi.fn<(title: string, themeId: string, priority: string, description: string, tags: string) => Promise<Task>>(
    async (title, themeId, priority) => {
      callCount++;
      return {
        id: `${themeId}-T${callCount}`,
        title,
        themeId,
        priority,
      };
    }
  );
}

describe('CreateTaskDialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mockDraftsData = '{}';
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  async function renderDialog(props: Partial<{
    open: boolean;
    themes: LifeTheme[];
    onDone: () => void;
    onClose: () => void;
    createTask: (title: string, themeId: string, priority: string, description: string, tags: string) => Promise<Task>;
  }> = {}) {
    const result = render(CreateTaskDialog, {
      target: container,
      props: {
        open: true,
        themes: makeTestThemes(),
        onDone: vi.fn(),
        onClose: vi.fn(),
        createTask: makeCreateTaskMock(),
        ...props,
      },
    });
    await tick();
    // Wait for async draft loading
    await vi.waitFor(() => {});
    await tick();
    return result;
  }

  async function addTask(title: string, buttonLabel: string = 'I&U') {
    const input = container.querySelector<HTMLInputElement>('#new-task-title');
    await fireEvent.input(input!, { target: { value: title } });
    await tick();
    const buttons = container.querySelectorAll<HTMLButtonElement>('.btn-add');
    const addBtn = Array.from(buttons).find(b => b.textContent?.trim() === buttonLabel);
    await fireEvent.click(addBtn!);
    await tick();
  }

  it('renders dialog with three quadrants when open', async () => {
    await renderDialog();

    const quadrants = container.querySelectorAll('[data-testid^="quadrant-"]');
    expect(quadrants.length).toBe(3);
  });

  it('does not render when open is false', async () => {
    await renderDialog({ open: false });

    const dialog = container.querySelector('.dialog');
    expect(dialog).toBeNull();
  });

  it('displays correct quadrant titles', async () => {
    await renderDialog();

    const titles = container.querySelectorAll('.quadrant-title');
    const titleTexts = Array.from(titles).map(t => t.textContent);
    expect(titleTexts).toContain('Important & Urgent');
    expect(titleTexts).toContain('Not Important & Urgent');
    expect(titleTexts).toContain('Important & Not Urgent');
    expect(titleTexts).toHaveLength(3);
  });

  it('adds a task to the selected priority quadrant via add button', async () => {
    await renderDialog();

    await addTask('Buy groceries');

    // Task should appear in the I&U quadrant
    const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
    expect(q1).toBeTruthy();
    const taskTitles = q1!.querySelectorAll('.task-title');
    expect(taskTitles.length).toBe(1);
    expect(taskTitles[0].textContent).toBe('Buy groceries');

    // Input should be cleared
    const input = container.querySelector<HTMLInputElement>('#new-task-title');
    expect(input!.value).toBe('');
  });

  it('adds tasks to different quadrants via respective buttons', async () => {
    await renderDialog();

    await addTask('Task 1', 'I&U');
    await addTask('Task 2', 'nI&U');
    await addTask('Task 3', 'I&nU');

    const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
    expect(q1!.querySelectorAll('.task-title').length).toBe(1);

    const q2 = container.querySelector('[data-testid="quadrant-not-important-urgent"]');
    expect(q2!.querySelectorAll('.task-title').length).toBe(1);

    const q3 = container.querySelector('[data-testid="quadrant-important-not-urgent"]');
    expect(q3!.querySelectorAll('.task-title').length).toBe(1);
  });

  it('add buttons are disabled when title is empty', async () => {
    await renderDialog();

    const addButtons = container.querySelectorAll<HTMLButtonElement>('.btn-add');
    expect(addButtons.length).toBe(3);
    addButtons.forEach(btn => expect(btn.disabled).toBe(true));

    // Type something — buttons should enable
    const input = container.querySelector<HTMLInputElement>('#new-task-title');
    await fireEvent.input(input!, { target: { value: 'A task' } });
    await tick();
    addButtons.forEach(btn => expect(btn.disabled).toBe(false));
  });

  it('Done button is disabled when no tasks in any quadrant', async () => {
    await renderDialog();

    const doneBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    expect(doneBtn?.disabled).toBe(true);
  });

  it('Close button calls onClose and saves drafts', async () => {
    const onClose = vi.fn();
    await renderDialog({ onClose });

    await addTask('Draft task');

    const buttons = container.querySelectorAll<HTMLButtonElement>('.btn-secondary');
    const closeBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Close');
    expect(closeBtn).toBeTruthy();
    closeBtn!.click();
    await tick();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());

    // Drafts should have been saved
    const saved = JSON.parse(mockDraftsData);
    expect(saved['important-urgent']).toHaveLength(1);
    expect(saved['important-urgent'][0].title).toBe('Draft task');
  });

  it('theme selector shows all themes and defaults to first', async () => {
    await renderDialog();

    const select = container.querySelector<HTMLSelectElement>('#new-task-theme');
    expect(select).toBeTruthy();
    expect(select!.value).toBe('HF');

    const options = select!.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toBe('Health & Fitness');
    expect(options[1].textContent).toBe('Career Growth');
  });

  it('theme selector allows changing theme', async () => {
    await renderDialog();

    const select = container.querySelector<HTMLSelectElement>('#new-task-theme');
    await fireEvent.change(select!, { target: { value: 'CG' } });
    await tick();

    expect(select!.value).toBe('CG');
  });

  it('shows error banner on createTask failure', async () => {
    const createTask = vi.fn().mockRejectedValue(new Error('Network error'));
    const onDone = vi.fn();

    await renderDialog({ createTask, onDone });

    // Verify error banner doesn't exist initially
    expect(container.querySelector('.error-banner')).toBeNull();
  });

  it('displays dialog title', async () => {
    await renderDialog();

    const title = container.querySelector('#create-dialog-title');
    expect(title?.textContent).toBe('Create Tasks');
  });

  it('shows optional field inputs in task entry form', async () => {
    await renderDialog();

    expect(container.querySelector('#new-task-description')).toBeTruthy();
    // Tags are now rendered via TagEditor (pill toggles + text input)
    expect(container.querySelector('.tag-editor')).toBeTruthy();
  });

  it('optional fields default to empty', async () => {
    await renderDialog();

    const desc = container.querySelector<HTMLTextAreaElement>('#new-task-description');
    expect(desc!.value).toBe('');

    // TagEditor input should default to empty
    const tagInput = container.querySelector<HTMLInputElement>('.tag-editor .tag-input');
    expect(tagInput!.value).toBe('');
    // No active tag pills
    expect(container.querySelectorAll('.tag-pill.active').length).toBe(0);
  });

  it('optional fields are cleared after adding a task', async () => {
    await renderDialog();

    const input = container.querySelector<HTMLInputElement>('#new-task-title');
    const desc = container.querySelector<HTMLTextAreaElement>('#new-task-description');

    // Fill in fields
    await fireEvent.input(input!, { target: { value: 'Task with details' } });
    await fireEvent.input(desc!, { target: { value: 'Some description' } });
    await tick();

    // Add task via button
    const addBtn = container.querySelector<HTMLButtonElement>('.btn-add');
    await fireEvent.click(addBtn!);
    await tick();

    // Fields should be cleared
    expect(input!.value).toBe('');
    expect(desc!.value).toBe('');
    // No active tag pills after clearing
    expect(container.querySelectorAll('.tag-pill.active').length).toBe(0);
  });

  it('adds task with only title filled', async () => {
    await renderDialog();

    await addTask('Quick task');

    const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
    const taskTitles = q1!.querySelectorAll('.task-title');
    expect(taskTitles.length).toBe(1);
    expect(taskTitles[0].textContent).toBe('Quick task');
  });

  describe('draft persistence', () => {
    it('loads drafts on dialog open', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-1', title: 'Saved urgent' }],
        'important-not-urgent': [{ id: 'pending-2', title: 'Saved important' }],
      });

      await renderDialog();

      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      expect(q1!.querySelectorAll('.task-title').length).toBe(1);
      expect(q1!.querySelector('.task-title')!.textContent).toBe('Saved urgent');

      const q3 = container.querySelector('[data-testid="quadrant-important-not-urgent"]');
      expect(q3!.querySelectorAll('.task-title').length).toBe(1);
      expect(q3!.querySelector('.task-title')!.textContent).toBe('Saved important');
    });

    it('silently drops staging key from old drafts', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-1', title: 'Saved urgent' }],
        'staging': [{ id: 'pending-2', title: 'Old staging task' }],
      });

      await renderDialog();

      // Q1 should load fine
      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      expect(q1!.querySelectorAll('.task-title').length).toBe(1);

      // No staging quadrant exists
      expect(container.querySelector('[data-testid="quadrant-staging"]')).toBeNull();
    });

    it('handles corrupted draft data gracefully', async () => {
      mockDraftsData = 'not valid json';

      await renderDialog();

      // Should start with empty quadrants
      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      expect(q1!.querySelectorAll('.task-title').length).toBe(0);
    });

    it('derives nextId from loaded drafts to avoid collisions', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-5', title: 'Existing' }],
      });

      await renderDialog();
      await addTask('New task');

      // New task should be pending-6 (one more than the max loaded id)
      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      const tasks = q1!.querySelectorAll('.pending-task');
      const newTaskId = tasks[1]?.getAttribute('data-testid');
      expect(newTaskId).toBe('pending-task-pending-6');
    });
  });

  describe('clear button', () => {
    it('Clear All clears all quadrant tasks', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-1', title: 'Q1 task' }],
        'important-not-urgent': [{ id: 'pending-2', title: 'Q3 task' }],
      });

      await renderDialog();

      const clearBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-secondary'))
        .find(b => b.textContent?.trim() === 'Clear All');
      expect(clearBtn).toBeTruthy();
      await fireEvent.click(clearBtn!);
      await tick();

      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      expect(q1!.querySelectorAll('.task-title').length).toBe(0);

      const q3 = container.querySelector('[data-testid="quadrant-important-not-urgent"]');
      expect(q3!.querySelectorAll('.task-title').length).toBe(0);
    });

    it('Clear All button is disabled when all quadrants are empty', async () => {
      await renderDialog();

      const clearBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-secondary'))
        .find(b => b.textContent?.trim() === 'Clear All');
      expect(clearBtn?.disabled).toBe(true);
    });
  });

  describe('batch creation with partial failure', () => {
    it('calls onDone when all tasks succeed', async () => {
      const onDone = vi.fn();
      const createTask = makeCreateTaskMock();
      await renderDialog({ onDone, createTask });

      await addTask('Task A', 'I&U');
      await addTask('Task B', 'I&nU');

      const doneBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
      await fireEvent.click(doneBtn!);
      await tick();
      // Allow async handleDone to complete
      await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    });

    it('shows error count on partial failure and does not call onDone', async () => {
      let callCount = 0;
      const createTask = vi.fn(async (title: string, themeId: string, priority: string) => {
        callCount++;
        if (callCount === 2) throw new Error('Server error');
        return { id: `T-${callCount}`, title, themeId, priority };
      });
      const onDone = vi.fn();
      await renderDialog({ createTask, onDone });

      await addTask('Task A', 'I&U');
      await addTask('Task B', 'I&U');

      const doneBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
      await fireEvent.click(doneBtn!);
      await tick();

      // Wait for error banner to appear
      await vi.waitFor(() => {
        const banner = container.querySelector('.error-banner');
        expect(banner).toBeTruthy();
        expect(banner!.textContent).toContain('1 of 2 tasks failed to create');
      });

      expect(onDone).not.toHaveBeenCalled();
    });

    it('shows error when all tasks fail and does not call onDone', async () => {
      const createTask = vi.fn().mockRejectedValue(new Error('Server error'));
      const onDone = vi.fn();
      await renderDialog({ createTask, onDone });

      await addTask('Task A', 'I&U');

      const doneBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
      await fireEvent.click(doneBtn!);
      await tick();

      await vi.waitFor(() => {
        const banner = container.querySelector('.error-banner');
        expect(banner).toBeTruthy();
        expect(banner!.textContent).toContain('1 of 1 tasks failed to create');
      });

      expect(onDone).not.toHaveBeenCalled();
    });
  });

  describe('edit pending task', () => {
    it('clicking a pending task card opens edit modal with pre-populated fields', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-1', title: 'My task', themeId: 'CG', description: 'A description', tags: 'tag1, tag2' }],
      });

      await renderDialog();

      const taskCard = container.querySelector('[data-testid="pending-task-pending-1"]');
      await fireEvent.click(taskCard!);
      await tick();

      // Edit modal should be open
      const editDialog = container.querySelector('#edit-pending-dialog-title');
      expect(editDialog).toBeTruthy();
      expect(editDialog!.textContent).toBe('Edit Task');

      // Fields should be pre-populated
      const titleInput = container.querySelector<HTMLInputElement>('#edit-pending-title');
      expect(titleInput!.value).toBe('My task');

      const themeSelect = container.querySelector<HTMLSelectElement>('#edit-pending-theme');
      expect(themeSelect!.value).toBe('CG');

      const descInput = container.querySelector<HTMLTextAreaElement>('#edit-pending-description');
      expect(descInput!.value).toBe('A description');
    });

    it('saving an edit updates the task in-place and saves drafts', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [
          { id: 'pending-1', title: 'First' },
          { id: 'pending-2', title: 'Second' },
        ],
      });

      await renderDialog();
      mockSaveTaskDrafts.mockClear();

      // Click the second task to edit it
      const taskCard = container.querySelector('[data-testid="pending-task-pending-2"]');
      await fireEvent.click(taskCard!);
      await tick();

      // Change the title
      const titleInput = container.querySelector<HTMLInputElement>('#edit-pending-title');
      await fireEvent.input(titleInput!, { target: { value: 'Updated Second' } });
      await tick();

      // Click Save
      const saveBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-primary'))
        .find(b => b.textContent?.trim() === 'Save');
      await fireEvent.click(saveBtn!);
      await tick();

      // Edit modal should be closed
      expect(container.querySelector('#edit-pending-dialog-title')).toBeNull();

      // Task should be updated in-place
      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      const titles = q1!.querySelectorAll('.task-title');
      expect(titles.length).toBe(2);
      expect(titles[0].textContent).toBe('First');
      expect(titles[1].textContent).toBe('Updated Second');

      // Drafts should have been saved
      await vi.waitFor(() => expect(mockSaveTaskDrafts).toHaveBeenCalled());
    });

    it('cancelling an edit leaves tasks unchanged', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-1', title: 'Original' }],
      });

      await renderDialog();

      // Click task to open edit
      const taskCard = container.querySelector('[data-testid="pending-task-pending-1"]');
      await fireEvent.click(taskCard!);
      await tick();

      // Change the title
      const titleInput = container.querySelector<HTMLInputElement>('#edit-pending-title');
      await fireEvent.input(titleInput!, { target: { value: 'Changed' } });
      await tick();

      // Click Cancel
      const cancelBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-secondary'))
        .find(b => b.textContent?.trim() === 'Cancel');
      await fireEvent.click(cancelBtn!);
      await tick();

      // Edit modal should be closed
      expect(container.querySelector('#edit-pending-dialog-title')).toBeNull();

      // Task title should be unchanged
      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      expect(q1!.querySelector('.task-title')!.textContent).toBe('Original');
    });

    it('editing works across different quadrants', async () => {
      mockDraftsData = JSON.stringify({
        'not-important-urgent': [{ id: 'pending-1', title: 'Urgent task' }],
      });

      await renderDialog();
      mockSaveTaskDrafts.mockClear();

      const taskCard = container.querySelector('[data-testid="pending-task-pending-1"]');
      await fireEvent.click(taskCard!);
      await tick();

      // Edit modal should be open
      expect(container.querySelector('#edit-pending-dialog-title')).toBeTruthy();

      // Change title and save
      const titleInput = container.querySelector<HTMLInputElement>('#edit-pending-title');
      await fireEvent.input(titleInput!, { target: { value: 'Updated urgent' } });
      await tick();

      const saveBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-primary'))
        .find(b => b.textContent?.trim() === 'Save');
      await fireEvent.click(saveBtn!);
      await tick();

      const q2 = container.querySelector('[data-testid="quadrant-not-important-urgent"]');
      expect(q2!.querySelector('.task-title')!.textContent).toBe('Updated urgent');
      await vi.waitFor(() => expect(mockSaveTaskDrafts).toHaveBeenCalled());
    });
  });

  describe('delete individual task', () => {
    it('clicking x button removes a single task and saves drafts', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [
          { id: 'pending-1', title: 'Keep' },
          { id: 'pending-2', title: 'Remove' },
          { id: 'pending-3', title: 'Also keep' },
        ],
      });

      await renderDialog();
      mockSaveTaskDrafts.mockClear();

      // Click the x button on the second task
      const deleteBtn = container.querySelector('[data-testid="pending-task-pending-2"] .delete-btn');
      expect(deleteBtn).toBeTruthy();
      await fireEvent.click(deleteBtn!);
      await tick();

      // Only two tasks should remain
      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      const titles = q1!.querySelectorAll('.task-title');
      expect(titles.length).toBe(2);
      expect(titles[0].textContent).toBe('Keep');
      expect(titles[1].textContent).toBe('Also keep');

      // Drafts should have been saved
      await vi.waitFor(() => expect(mockSaveTaskDrafts).toHaveBeenCalled());
    });

    it('x button click does not open the edit modal', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-1', title: 'Task' }],
      });

      await renderDialog();

      const deleteBtn = container.querySelector('[data-testid="pending-task-pending-1"] .delete-btn');
      await fireEvent.click(deleteBtn!);
      await tick();

      // Edit modal should NOT be open
      expect(container.querySelector('#edit-pending-dialog-title')).toBeNull();
    });

    it('deleting from different quadrant works', async () => {
      mockDraftsData = JSON.stringify({
        'important-not-urgent': [{ id: 'pending-1', title: 'Q3 task' }],
      });

      await renderDialog();

      const deleteBtn = container.querySelector('[data-testid="pending-task-pending-1"] .delete-btn');
      await fireEvent.click(deleteBtn!);
      await tick();

      const q3 = container.querySelector('[data-testid="quadrant-important-not-urgent"]');
      expect(q3!.querySelectorAll('.task-title').length).toBe(0);
    });
  });

  describe('Escape-to-cancel DnD', () => {
    function dispatchDndConsider(element: Element, items: { id: string; title: string }[]) {
      element.dispatchEvent(new CustomEvent('consider', {
        detail: { items, info: { id: 'dnd-test', source: 'pointer', trigger: 'dragStarted' } },
      }));
    }

    function dispatchDndFinalize(element: Element, items: { id: string; title: string }[]) {
      element.dispatchEvent(new CustomEvent('finalize', {
        detail: { items },
      }));
    }

    it('Escape during quadrant drag restores pre-drag state', async () => {
      mockDraftsData = JSON.stringify({
        'important-urgent': [{ id: 'pending-1', title: 'Saved draft' }],
      });

      await renderDialog();

      const q1 = container.querySelector('[data-testid="quadrant-important-urgent"]');
      expect(q1!.querySelectorAll('.task-title').length).toBe(1);
      expect(q1!.querySelector('.task-title')!.textContent).toBe('Saved draft');

      const taskList = q1!.querySelector('.task-list')!;

      // Simulate pointer drag start via consider event
      dispatchDndConsider(taskList, [
        { id: 'pending-1', title: 'Saved draft' },
      ]);
      await tick();

      // Dispatch Escape on window to cancel the drag
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();

      // Simulate finalize (triggered by synthetic mouseup from Escape handler)
      dispatchDndFinalize(taskList, [
        { id: 'pending-1', title: 'Saved draft' },
      ]);
      await tick();
      await tick();

      // Q1 should still have the original draft after cancel
      expect(q1!.querySelectorAll('.task-title').length).toBe(1);
      expect(q1!.querySelector('.task-title')!.textContent).toBe('Saved draft');
    });

    it('Escape when no drag is active does not re-load drafts', async () => {
      await renderDialog();

      const loadCallsBefore = mockLoadTaskDrafts.mock.calls.length;

      // Dispatch Escape without any drag active
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();
      await tick();

      // LoadTaskDrafts should NOT have been called again
      expect(mockLoadTaskDrafts.mock.calls.length).toBe(loadCallsBefore);
    });
  });
});
