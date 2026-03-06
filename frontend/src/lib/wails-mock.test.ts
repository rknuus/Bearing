import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mockAppBindings } from './wails-mock';

describe('LogFrontend', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls console.error for error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAppBindings.LogFrontend('error', 'something broke', 'App.svelte');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[error] something broke (App.svelte)');
  });

  it('calls console.warn for warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockAppBindings.LogFrontend('warn', 'something suspicious', 'TaskView.svelte');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[warn] something suspicious (TaskView.svelte)');
  });

  it('calls console.log for info level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockAppBindings.LogFrontend('info', 'page loaded', 'main.ts');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[info] page loaded (main.ts)');
  });

  it('calls console.log for unknown level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockAppBindings.LogFrontend('debug', 'trace data', 'utils.ts');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[debug] trace data (utils.ts)');
  });
});

describe('Column CRUD', () => {
  let originalConfig: Awaited<ReturnType<typeof mockAppBindings.GetBoardConfiguration>>;

  beforeEach(async () => {
    // Snapshot original config and restore after each test by reordering/removing
    originalConfig = await mockAppBindings.GetBoardConfiguration();
  });

  afterEach(async () => {
    // Restore to default: remove any extra columns, then reorder to original
    const current = await mockAppBindings.GetBoardConfiguration();
    const originalSlugs = new Set(originalConfig.columnDefinitions.map(c => c.name));
    for (const col of current.columnDefinitions) {
      if (!originalSlugs.has(col.name) && col.type === 'doing') {
        // Remove tasks from column first (move to todo)
        const tasks = await mockAppBindings.GetTasks();
        for (const t of tasks) {
          if (t.status === col.name) {
            await mockAppBindings.MoveTask(t.id, 'todo');
          }
        }
        await mockAppBindings.RemoveColumn(col.name);
      }
    }
    // Restore original column titles via rename if needed
    const afterRemoval = await mockAppBindings.GetBoardConfiguration();
    for (const origCol of originalConfig.columnDefinitions) {
      const cur = afterRemoval.columnDefinitions.find(c => c.name === origCol.name);
      if (cur && cur.title !== origCol.title) {
        await mockAppBindings.RenameColumn(cur.name, origCol.title);
      }
    }
  });

  it('AddColumn inserts a doing column after the specified slug', async () => {
    const config = await mockAppBindings.AddColumn('Review', 'doing');
    const names = config.columnDefinitions.map(c => c.name);
    expect(names).toEqual(['todo', 'doing', 'review', 'done']);
    const review = config.columnDefinitions.find(c => c.name === 'review');
    expect(review?.type).toBe('doing');
    expect(review?.title).toBe('Review');
  });

  it('AddColumn rejects duplicate slug', async () => {
    await expect(mockAppBindings.AddColumn('Doing', 'todo')).rejects.toThrow('already exists');
  });

  it('AddColumn rejects reserved slug "archived"', async () => {
    await expect(mockAppBindings.AddColumn('Archived', 'todo')).rejects.toThrow('reserved');
  });

  it('AddColumn rejects insert after done', async () => {
    await expect(mockAppBindings.AddColumn('After Done', 'done')).rejects.toThrow('cannot insert after');
  });

  it('RemoveColumn removes an empty doing column', async () => {
    await mockAppBindings.AddColumn('Review', 'doing');
    const config = await mockAppBindings.RemoveColumn('review');
    const names = config.columnDefinitions.map(c => c.name);
    expect(names).toEqual(['todo', 'doing', 'done']);
  });

  it('RemoveColumn rejects non-empty column', async () => {
    // 'doing' column has mock tasks
    await expect(mockAppBindings.RemoveColumn('doing')).rejects.toThrow('cannot delete column');
  });

  it('RemoveColumn rejects todo/done columns', async () => {
    await expect(mockAppBindings.RemoveColumn('todo')).rejects.toThrow('only custom columns');
    await expect(mockAppBindings.RemoveColumn('done')).rejects.toThrow('only custom columns');
  });

  it('RenameColumn updates title and slug, migrates task statuses', async () => {
    // Move a task to doing, then rename doing to in-progress
    await mockAppBindings.MoveTask('CG-T2', 'doing');
    const config = await mockAppBindings.RenameColumn('doing', 'In Progress');
    expect(config.columnDefinitions.map(c => c.name)).toEqual(['todo', 'in-progress', 'done']);
    const tasks = await mockAppBindings.GetTasks();
    const movedTask = tasks.find(t => t.id === 'CG-T2');
    expect(movedTask?.status).toBe('in-progress');
    // Rename back
    await mockAppBindings.RenameColumn('in-progress', 'DOING');
  });

  it('RenameColumn title-only change (same slug)', async () => {
    const config = await mockAppBindings.RenameColumn('doing', 'Doing');
    const col = config.columnDefinitions.find(c => c.name === 'doing');
    expect(col?.title).toBe('Doing');
  });

  it('RenameColumn rejects duplicate slug', async () => {
    await expect(mockAppBindings.RenameColumn('doing', 'DONE')).rejects.toThrow('already exists');
  });

  it('ReorderColumns reorders doing columns between bookends', async () => {
    await mockAppBindings.AddColumn('Review', 'doing');
    const config = await mockAppBindings.ReorderColumns(['todo', 'review', 'doing', 'done']);
    expect(config.columnDefinitions.map(c => c.name)).toEqual(['todo', 'review', 'doing', 'done']);
    // Reorder back and cleanup
    await mockAppBindings.ReorderColumns(['todo', 'doing', 'review', 'done']);
    await mockAppBindings.RemoveColumn('review');
  });

  it('ReorderColumns rejects todo not first', async () => {
    await expect(mockAppBindings.ReorderColumns(['doing', 'todo', 'done'])).rejects.toThrow('first column cannot be moved');
  });

  it('ReorderColumns rejects done not last', async () => {
    await expect(mockAppBindings.ReorderColumns(['todo', 'done', 'doing'])).rejects.toThrow('last column cannot be moved');
  });
});
