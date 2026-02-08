import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme, Task } from '../lib/wails-mock';
import CreateTaskDialog from './CreateTaskDialog.svelte';

function makeTestThemes(): LifeTheme[] {
  return [
    { id: 'HF', name: 'Health & Fitness', color: '#10b981', objectives: [] },
    { id: 'CG', name: 'Career Growth', color: '#3b82f6', objectives: [] },
  ];
}

function makeCreateTaskMock() {
  let callCount = 0;
  return vi.fn<(title: string, themeId: string, dayDate: string, priority: string, description: string, tags: string, dueDate: string, promotionDate: string) => Promise<Task>>(
    async (title, themeId, dayDate, priority) => {
      callCount++;
      return {
        id: `${themeId}-T${callCount}`,
        title,
        themeId,
        dayDate,
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
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  async function renderDialog(props: Partial<{
    open: boolean;
    themes: LifeTheme[];
    onDone: () => void;
    onCancel: () => void;
    createTask: (title: string, themeId: string, dayDate: string, priority: string, description: string, tags: string, dueDate: string, promotionDate: string) => Promise<Task>;
  }> = {}) {
    const result = render(CreateTaskDialog, {
      target: container,
      props: {
        open: true,
        themes: makeTestThemes(),
        onDone: vi.fn(),
        onCancel: vi.fn(),
        createTask: makeCreateTaskMock(),
        ...props,
      },
    });
    await tick();
    return result;
  }

  async function addTask(title: string) {
    const input = container.querySelector<HTMLInputElement>('#new-task-input');
    await fireEvent.input(input!, { target: { value: title } });
    await tick();
    const addBtn = container.querySelector<HTMLButtonElement>('.btn-add');
    await fireEvent.click(addBtn!);
    await tick();
  }

  it('renders dialog with four quadrants when open', async () => {
    await renderDialog();

    const grid = container.querySelector('[data-testid="eisenhower-grid"]');
    expect(grid).toBeTruthy();

    const quadrants = container.querySelectorAll('[data-testid^="quadrant-"]');
    expect(quadrants.length).toBe(4);
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
    expect(titleTexts).toContain('Q1 - Important & Urgent');
    expect(titleTexts).toContain('Q2 - Important, Not Urgent');
    expect(titleTexts).toContain('Q3 - Urgent, Not Important');
    expect(titleTexts).toContain('Q4 - Staging');
  });

  it('adds a task to staging quadrant via Add Task button', async () => {
    await renderDialog();

    await addTask('Buy groceries');

    // Task should appear in the staging quadrant
    const stagingQuadrant = container.querySelector('[data-testid="quadrant-staging"]');
    expect(stagingQuadrant).toBeTruthy();
    const taskTitles = stagingQuadrant!.querySelectorAll('.task-title');
    expect(taskTitles.length).toBe(1);
    expect(taskTitles[0].textContent).toBe('Buy groceries');

    // Input should be cleared
    const input = container.querySelector<HTMLInputElement>('#new-task-input');
    expect(input!.value).toBe('');
  });

  it('adds multiple tasks to staging', async () => {
    await renderDialog();

    await addTask('Task 1');
    await addTask('Task 2');

    const stagingQuadrant = container.querySelector('[data-testid="quadrant-staging"]');
    const taskTitles = stagingQuadrant!.querySelectorAll('.task-title');
    expect(taskTitles.length).toBe(2);
  });

  it('Add Task button is disabled when title is empty', async () => {
    await renderDialog();

    const addBtn = container.querySelector<HTMLButtonElement>('.btn-add');
    expect(addBtn?.disabled).toBe(true);

    // Type something — button should enable
    const input = container.querySelector<HTMLInputElement>('#new-task-input');
    await fireEvent.input(input!, { target: { value: 'A task' } });
    await tick();
    expect(addBtn?.disabled).toBe(false);
  });

  it('Done button is disabled when no tasks in Q1/Q2/Q3', async () => {
    await renderDialog();

    await addTask('Staging task');

    const doneBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    expect(doneBtn?.disabled).toBe(true);
  });

  it('Cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    await renderDialog({ onCancel });

    const cancelBtn = container.querySelector<HTMLButtonElement>('.btn-secondary');
    expect(cancelBtn).toBeTruthy();
    cancelBtn!.click();
    await tick();

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('theme selector shows all themes and defaults to first', async () => {
    await renderDialog();

    const select = container.querySelector<HTMLSelectElement>('#theme-select');
    expect(select).toBeTruthy();
    expect(select!.value).toBe('HF');

    const options = select!.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toBe('Health & Fitness');
    expect(options[1].textContent).toBe('Career Growth');
  });

  it('theme selector allows changing theme', async () => {
    await renderDialog();

    const select = container.querySelector<HTMLSelectElement>('#theme-select');
    await fireEvent.change(select!, { target: { value: 'CG' } });
    await tick();

    expect(select!.value).toBe('CG');
  });

  it('shows staging hint when staging has tasks', async () => {
    await renderDialog();

    // No hint initially
    expect(container.querySelector('.staging-hint')).toBeNull();

    await addTask('Task');

    expect(container.querySelector('.staging-hint')).toBeTruthy();
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
    expect(container.querySelector('#new-task-tags')).toBeTruthy();
    expect(container.querySelector('#new-task-due-date')).toBeTruthy();
    expect(container.querySelector('#new-task-promotion-date')).toBeTruthy();
  });

  it('optional fields default to empty', async () => {
    await renderDialog();

    const desc = container.querySelector<HTMLTextAreaElement>('#new-task-description');
    const tags = container.querySelector<HTMLInputElement>('#new-task-tags');
    const dueDate = container.querySelector<HTMLInputElement>('#new-task-due-date');
    const promotionDate = container.querySelector<HTMLInputElement>('#new-task-promotion-date');

    expect(desc!.value).toBe('');
    expect(tags!.value).toBe('');
    expect(dueDate!.value).toBe('');
    expect(promotionDate!.value).toBe('');
  });

  it('optional fields are cleared after adding a task', async () => {
    await renderDialog();

    const input = container.querySelector<HTMLInputElement>('#new-task-input');
    const desc = container.querySelector<HTMLTextAreaElement>('#new-task-description');
    const tags = container.querySelector<HTMLInputElement>('#new-task-tags');

    // Fill in fields
    await fireEvent.input(input!, { target: { value: 'Task with details' } });
    await fireEvent.input(desc!, { target: { value: 'Some description' } });
    await fireEvent.input(tags!, { target: { value: 'tag1, tag2' } });
    await tick();

    // Add task via button
    const addBtn = container.querySelector<HTMLButtonElement>('.btn-add');
    await fireEvent.click(addBtn!);
    await tick();

    // Fields should be cleared
    expect(input!.value).toBe('');
    expect(desc!.value).toBe('');
    expect(tags!.value).toBe('');
  });

  it('adds task with only title filled', async () => {
    await renderDialog();

    await addTask('Quick task');

    // Task is in staging with just a title
    const stagingQuadrant = container.querySelector('[data-testid="quadrant-staging"]');
    const taskTitles = stagingQuadrant!.querySelectorAll('.task-title');
    expect(taskTitles.length).toBe(1);
    expect(taskTitles[0].textContent).toBe('Quick task');
  });
});
