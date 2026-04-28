import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mockAppBindings } from './wails-mock';
import { setClockForTesting, resetClock } from './utils/clock';
import type { RoutineOccurrence } from './wails-mock';

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

describe('GetRoutinesForDate — collapse, absorption, today-gate', () => {
  // Frozen "today" for deterministic tests: Jan 10 2026 (Saturday).
  const TODAY = '2026-01-10';
  let routineId = '';

  // Helper: set the mock clock and return a CalendarDate string for a given Date.
  function freezeToday(dateStr: string): void {
    const [y, m, d] = dateStr.split('-').map(Number);
    setClockForTesting(() => new Date(y, m - 1, d, 12, 0, 0));
  }

  // Helper: persist completion checks for routineId across the given dates.
  async function recordChecks(dates: string[]): Promise<void> {
    for (const date of dates) {
      await mockAppBindings.SaveDayFocus({
        date: date as unknown as import('./utils/date-utils').CalendarDate,
        notes: '',
        text: '',
        routineChecks: [routineId],
      });
    }
  }

  // Helper: clear any existing year-focus entries that would carry checks across tests.
  async function clearChecks(dates: string[]): Promise<void> {
    for (const date of dates) {
      await mockAppBindings.SaveDayFocus({
        date: date as unknown as import('./utils/date-utils').CalendarDate,
        notes: '',
        text: '',
        routineChecks: [],
      });
    }
  }

  // Helper: filter occurrences down to overdue entries for routineId.
  function overdueFor(occurrences: RoutineOccurrence[], id: string): RoutineOccurrence[] {
    return occurrences.filter(o => o.routineId === id && o.status === 'overdue');
  }

  beforeEach(async () => {
    freezeToday(TODAY);
    // Create a fresh daily routine starting Jan 1, 2026 (well before TODAY).
    const result = await mockAppBindings.Establish({
      parentId: '',
      goalType: 'routine',
      description: 'Test daily routine',
      repeatPattern: { frequency: 'daily', interval: 1, startDate: '2026-01-01' },
    });
    routineId = result.routine!.id;
  });

  afterEach(async () => {
    // Remove any year-focus entries that referenced the test routine.
    const allDates: string[] = [];
    for (let day = 1; day <= 31; day++) {
      allDates.push(`2026-01-${String(day).padStart(2, '0')}`);
    }
    await clearChecks(allDates);
    if (routineId) {
      await mockAppBindings.Dismiss(routineId);
      routineId = '';
    }
    resetClock();
  });

  it('collapses N missed days into one overdue entry with missedCount = N', async () => {
    // Daily routine running Jan 1..Jan 9 with no checks → 9 missed days when viewed on Jan 10.
    const occurrences = await mockAppBindings.GetRoutinesForDate(TODAY);
    const overdue = overdueFor(occurrences, routineId);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].missedCount).toBe(9);
    expect(overdue[0].date).toBe('2026-01-09');
    expect(overdue[0].checked).toBe(false);
  });

  it('absorbs overdue dates ≤ max completion when completions exist', async () => {
    // Check the routine on Jan 5 — that absorbs Jan 1..5. Remaining overdue: Jan 6..9 = 4.
    await recordChecks(['2026-01-05']);
    const occurrences = await mockAppBindings.GetRoutinesForDate(TODAY);
    const overdue = overdueFor(occurrences, routineId);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].missedCount).toBe(4);
    expect(overdue[0].date).toBe('2026-01-09');
  });

  it('absorption: a check on day N → 0 overdue on day N+1 editor', async () => {
    // Freeze "today" to Jan 6 so the editor view is for Jan 6 = today.
    freezeToday('2026-01-06');
    // Record a check on Jan 5. Yesterday = Jan 5. Occurrences Jan 1..5 are all absorbed by max=Jan 5.
    await recordChecks(['2026-01-05']);
    const occurrences = await mockAppBindings.GetRoutinesForDate('2026-01-06');
    const overdue = overdueFor(occurrences, routineId);
    expect(overdue).toHaveLength(0);
  });

  it('today-gate: past-date editor shows no overdue entries', async () => {
    // Today is Jan 10, but viewing the Jan 8 editor — must emit no overdue regardless of missed history.
    const occurrences = await mockAppBindings.GetRoutinesForDate('2026-01-08');
    const overdue = overdueFor(occurrences, routineId);
    expect(overdue).toHaveLength(0);
  });

  it('today-gate: future-date editor shows no overdue entries', async () => {
    // Today is Jan 10, viewing the Jan 12 editor — overdue would otherwise compute against Jan 11.
    const occurrences = await mockAppBindings.GetRoutinesForDate('2026-01-12');
    const overdue = overdueFor(occurrences, routineId);
    expect(overdue).toHaveLength(0);
  });

  it('sporadic routines are unchanged by overdue logic', async () => {
    // Create a sporadic (no repeatPattern) routine.
    const result = await mockAppBindings.Establish({
      parentId: '',
      goalType: 'routine',
      description: 'Sporadic test routine',
    });
    const sporadicId = result.routine!.id;
    try {
      const occurrences = await mockAppBindings.GetRoutinesForDate(TODAY);
      const sporadic = occurrences.filter(o => o.routineId === sporadicId);
      expect(sporadic).toHaveLength(1);
      expect(sporadic[0].status).toBe('sporadic');
      expect(sporadic[0].missedCount).toBeUndefined();
      // And no overdue entries are emitted for the sporadic routine.
      expect(overdueFor(occurrences, sporadicId)).toHaveLength(0);
    } finally {
      await mockAppBindings.Dismiss(sporadicId);
    }
  });
});
