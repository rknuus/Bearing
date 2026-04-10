import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Task, LifeTheme } from '../lib/wails-mock';
import type { Timestamp } from '../lib/utils/date-utils';
import EditTaskDialog from './EditTaskDialog.svelte';

function makeTestThemes(): LifeTheme[] {
  return [
    { id: 'HF', name: 'Health & Fitness', color: '#10b981', objectives: [] },
    { id: 'CG', name: 'Career Growth', color: '#3b82f6', objectives: [] },
  ];
}

function makeTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'HF-T1',
    title: 'Exercise daily',
    description: 'Do 30 minutes of cardio',
    themeId: 'HF',
    priority: 'important-urgent',
    tags: ['health', 'morning'],
    createdAt: '2026-01-31T08:00:00Z' as Timestamp,
    updatedAt: '2026-01-31T08:00:00Z' as Timestamp,
    ...overrides,
  };
}

describe('EditTaskDialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderDialog(props: {
    task: Task | null;
    themes?: LifeTheme[];
    onSave?: (t: Task) => Promise<void>;
    onCancel?: () => void;
  }) {
    const result = render(EditTaskDialog, {
      target: container,
      props: {
        task: props.task,
        themes: props.themes ?? makeTestThemes(),
        onSave: props.onSave ?? (async () => {}),
        onCancel: props.onCancel ?? (() => {}),
      },
    });
    await tick();
    return result;
  }

  it('does not render dialog when task is null', async () => {
    await renderDialog({ task: null });

    const dialog = container.querySelector('.dialog');
    expect(dialog).toBeNull();
  });

  it('renders dialog when task is provided', async () => {
    await renderDialog({ task: makeTestTask() });

    const dialog = container.querySelector('.dialog');
    expect(dialog).toBeTruthy();

    const title = dialog!.querySelector('h2');
    expect(title?.textContent).toBe('Edit Task');
  });

  it('pre-populates form fields from task', async () => {
    const task = makeTestTask();
    await renderDialog({ task });

    const titleInput = container.querySelector<HTMLInputElement>('#edit-task-title');
    expect(titleInput?.value).toBe('Exercise daily');

    const descInput = container.querySelector<HTMLTextAreaElement>('#edit-task-description');
    expect(descInput?.value).toBe('Do 30 minutes of cardio');

    // Tags are rendered via TagEditor with active pills
    const activePills = container.querySelectorAll('.tag-pill.active');
    const activeTagTexts = Array.from(activePills).map(p => p.textContent?.trim());
    expect(activeTagTexts).toContain('health');
    expect(activeTagTexts).toContain('morning');

    const themeSelect = container.querySelector<HTMLSelectElement>('#edit-task-theme');
    expect(themeSelect?.value).toBe('HF');
  });

  it('calls onSave with updated task data', async () => {
    const onSave = vi.fn<(t: Task) => Promise<void>>().mockResolvedValue(undefined);
    await renderDialog({ task: makeTestTask(), onSave });

    const titleInput = container.querySelector<HTMLInputElement>('#edit-task-title');
    await fireEvent.input(titleInput!, { target: { value: 'Updated title' } });
    await tick();

    const saveBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    saveBtn!.click();
    await tick();

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedTask = onSave.mock.calls[0][0];
    expect(savedTask.title).toBe('Updated title');
    expect(savedTask.id).toBe('HF-T1');
    expect(savedTask.themeId).toBe('HF');
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn();
    await renderDialog({ task: makeTestTask(), onCancel });

    const cancelBtn = container.querySelector<HTMLButtonElement>('.btn-secondary');
    cancelBtn!.click();
    await tick();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('save button is disabled when submitting', async () => {
    let resolvePromise: () => void;
    const savePromise = new Promise<void>(resolve => { resolvePromise = resolve; });
    const onSave = vi.fn<(t: Task) => Promise<void>>().mockReturnValue(savePromise);

    await renderDialog({ task: makeTestTask(), onSave });

    const saveBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    expect(saveBtn?.disabled).toBe(false);

    saveBtn!.click();
    await tick();

    expect(saveBtn?.disabled).toBe(true);
    expect(saveBtn?.textContent?.trim()).toBe('Saving...');

    resolvePromise!();
    await tick();
    await vi.waitFor(() => {
      expect(saveBtn?.disabled).toBe(false);
    });
  });

  it('save button is disabled when title is empty', async () => {
    await renderDialog({ task: makeTestTask() });

    const titleInput = container.querySelector<HTMLInputElement>('#edit-task-title');
    await fireEvent.input(titleInput!, { target: { value: '' } });
    await tick();

    const saveBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    expect(saveBtn?.disabled).toBe(true);
  });

  it('focuses the title input when dialog opens with a task', async () => {
    await renderDialog({ task: makeTestTask() });

    const titleInput = container.querySelector<HTMLInputElement>('#edit-task-title');
    expect(document.activeElement).toBe(titleInput);
  });

  it('displays error when onSave throws', async () => {
    const onSave = vi.fn<(t: Task) => Promise<void>>().mockRejectedValue(new Error('Rule violation: too many Q1 tasks'));

    await renderDialog({ task: makeTestTask(), onSave });

    const saveBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    saveBtn!.click();
    await tick();

    await vi.waitFor(() => {
      const errorArea = container.querySelector('.error-banner');
      expect(errorArea).toBeTruthy();
      expect(errorArea?.textContent).toContain('Rule violation: too many Q1 tasks');
    });
  });

  it('saves tags added via TagEditor', async () => {
    const onSave = vi.fn<(t: Task) => Promise<void>>().mockResolvedValue(undefined);
    await renderDialog({ task: makeTestTask({ tags: ['health'] }), onSave });

    // 'health' should be active
    const activePills = container.querySelectorAll('.tag-pill.active');
    expect(activePills.length).toBe(1);
    expect(activePills[0].textContent?.trim()).toBe('health');

    // Add a new tag via the TagEditor input
    const tagInput = container.querySelector<HTMLInputElement>('.tag-editor .tag-input');
    await fireEvent.input(tagInput!, { target: { value: 'alpha' } });
    await tick();
    await fireEvent.keyDown(tagInput!, { key: 'Enter' });
    await tick();

    const saveBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    saveBtn!.click();
    await tick();

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedTask = onSave.mock.calls[0][0];
    expect(savedTask.tags).toContain('health');
    expect(savedTask.tags).toContain('alpha');
  });
});
