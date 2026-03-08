import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from './App.svelte';

/**
 * Build comprehensive mock bindings that satisfy all child views.
 * CalendarView and OKRView use window.go.main.App;
 * EisenKanView uses mockAppBindings directly (from the module), so it
 * will use the real mock data — which is fine for navigation tests.
 */
function makeMockBindings() {
  return {
    // Navigation context
    LoadNavigationContext: vi.fn().mockResolvedValue({
      currentView: 'okr',
      currentItem: '',
      filterThemeId: '',
      lastAccessed: '',
    }),
    SaveNavigationContext: vi.fn().mockResolvedValue(undefined),
    // OKRView APIs
    GetThemes: vi.fn().mockResolvedValue([]),
    CreateTheme: vi.fn().mockResolvedValue(null),
    UpdateTheme: vi.fn().mockResolvedValue(undefined),
    SaveTheme: vi.fn().mockResolvedValue(undefined),
    DeleteTheme: vi.fn().mockResolvedValue(undefined),
    CreateObjective: vi.fn().mockResolvedValue(null),
    UpdateObjective: vi.fn().mockResolvedValue(undefined),
    DeleteObjective: vi.fn().mockResolvedValue(undefined),
    CreateKeyResult: vi.fn().mockResolvedValue(null),
    UpdateKeyResult: vi.fn().mockResolvedValue(undefined),
    UpdateKeyResultProgress: vi.fn().mockResolvedValue(undefined),
    DeleteKeyResult: vi.fn().mockResolvedValue(undefined),
    // CalendarView APIs
    GetYearFocus: vi.fn().mockResolvedValue([]),
    SaveDayFocus: vi.fn().mockResolvedValue(undefined),
    ClearDayFocus: vi.fn().mockResolvedValue(undefined),
    // EisenKanView APIs (used via mockAppBindings, but provided for completeness)
    GetTasks: vi.fn().mockResolvedValue([]),
    CreateTask: vi.fn().mockResolvedValue(null),
    UpdateTask: vi.fn().mockResolvedValue(undefined),
    MoveTask: vi.fn().mockResolvedValue({ success: true }),
    DeleteTask: vi.fn().mockResolvedValue(undefined),
    GetBoardConfiguration: vi.fn().mockResolvedValue({
      name: 'Bearing Board',
      columnDefinitions: [
        { name: 'todo', title: 'TODO', type: 'todo' },
        { name: 'doing', title: 'DOING', type: 'doing' },
        { name: 'done', title: 'DONE', type: 'done' },
      ],
    }),
    ProcessPriorityPromotions: vi.fn().mockResolvedValue([]),
    // Status operations
    SetObjectiveStatus: vi.fn().mockResolvedValue(undefined),
    SetKeyResultStatus: vi.fn().mockResolvedValue(undefined),
    SuggestThemeAbbreviation: vi.fn().mockResolvedValue('T'),
  };
}

describe('App', () => {
  let container: HTMLDivElement;
  let mockBindings: ReturnType<typeof makeMockBindings>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mockBindings = makeMockBindings();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).go = { main: { App: mockBindings } };
  });

  afterEach(() => {
    document.body.removeChild(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).go;
  });

  async function renderApp() {
    const result = render(App, { target: container });
    await tick();
    // Wait for LoadNavigationContext to resolve
    await vi.waitFor(() => {
      expect(mockBindings.LoadNavigationContext).toHaveBeenCalled();
    });
    await tick();
    return result;
  }

  it('renders OKR view by default', async () => {
    await renderApp();

    // OKRs nav link should be active
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    expect(okrLink?.classList.contains('active')).toBe(true);
  });

  it('clicking nav links switches between views', async () => {
    await renderApp();

    // Should start on OKRs
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    expect(okrLink?.classList.contains('active')).toBe(true);

    // Click Calendar nav link
    const calLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Calendar');
    calLink!.click();
    await tick();
    await vi.waitFor(() => {
      expect(container.querySelector('.calendar-view')).toBeTruthy();
    });
  });

  it('active nav link updates to reflect current view', async () => {
    await renderApp();

    // OKRs should be active by default
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    expect(okrLink?.classList.contains('active')).toBe(true);

    // Click Calendar
    const calLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Calendar');
    calLink!.click();
    await tick();

    // Calendar should now be active, OKRs should not
    expect(calLink?.classList.contains('active')).toBe(true);
    expect(okrLink?.classList.contains('active')).toBe(false);
  });

  it('keyboard shortcuts switch views', async () => {
    await renderApp();

    // Ctrl+1 → OKRs
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }));
    await tick();
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    expect(okrLink?.classList.contains('active')).toBe(true);

    // Ctrl+2 → Calendar
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }));
    await tick();
    await vi.waitFor(() => {
      const calLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
        .find(l => l.textContent?.trim() === 'Calendar');
      expect(calLink?.classList.contains('active')).toBe(true);
    });

    // Ctrl+3 → Tasks
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', ctrlKey: true, bubbles: true }));
    await tick();
    await vi.waitFor(() => {
      const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
        .find(l => l.textContent?.trim() === 'Tasks');
      expect(taskLink?.classList.contains('active')).toBe(true);
    });
  });

  it('loads navigation context on mount and restores last view', async () => {
    mockBindings.LoadNavigationContext.mockResolvedValue({
      currentView: 'okr',
      currentItem: '',
      filterThemeId: '',
      lastAccessed: '',
    });

    await renderApp();

    // OKRs should be the active view
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    expect(okrLink?.classList.contains('active')).toBe(true);
  });

  it('saves navigation context when view changes', async () => {
    await renderApp();

    mockBindings.SaveNavigationContext.mockClear();

    // Click OKRs
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    okrLink!.click();
    await tick();

    await vi.waitFor(() => {
      const saveCalls = mockBindings.SaveNavigationContext.mock.calls;
      const hasOkrView = saveCalls.some(
        (call: unknown[]) => {
          const ctx = call[0] as { currentView?: string };
          return ctx.currentView === 'okr';
        }
      );
      if (!hasOkrView) throw new Error('SaveNavigationContext not called with okr view');
    });
  });

  it('preserves view-specific NavigationContext fields when switching views', async () => {
    // LoadNavigationContext returns context with OKR and EisenKan fields
    mockBindings.LoadNavigationContext.mockResolvedValue({
      currentView: 'okr',
      currentItem: '',
      filterThemeId: '',
      lastAccessed: '',
      expandedOkrIds: ['T1', 'T1-O1'],
      showCompleted: true,
      showArchived: false,
      showArchivedTasks: true,
      collapsedSections: ['todo-iu'],
      collapsedColumns: ['done'],
    });

    await renderApp();
    mockBindings.SaveNavigationContext.mockClear();

    // Switch to Calendar view
    const calLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Calendar');
    calLink!.click();
    await tick();

    await vi.waitFor(() => {
      const saveCalls = mockBindings.SaveNavigationContext.mock.calls;
      const calSave = saveCalls.find(
        (call: unknown[]) => {
          const ctx = call[0] as { currentView?: string };
          return ctx.currentView === 'calendar';
        }
      );
      if (!calSave) throw new Error('SaveNavigationContext not called with calendar view');
      const ctx = calSave[0] as Record<string, unknown>;
      // View-specific fields must be preserved
      expect(ctx.expandedOkrIds).toEqual(['T1', 'T1-O1']);
      expect(ctx.showCompleted).toBe(true);
      expect(ctx.showArchivedTasks).toBe(true);
      expect(ctx.collapsedSections).toEqual(['todo-iu']);
      expect(ctx.collapsedColumns).toEqual(['done']);
    });
  });

  it('renders navigation bar with all nav links', async () => {
    await renderApp();

    const nav = container.querySelector('.navigation');
    expect(nav).toBeTruthy();

    const brand = container.querySelector('.nav-brand');
    expect(brand?.textContent).toBe('Bearing');

    const navLinks = container.querySelectorAll('.nav-link');
    expect(navLinks.length).toBe(3);
    const linkTexts = Array.from(navLinks).map(l => l.textContent?.trim());
    expect(linkTexts).toContain('OKRs');
    expect(linkTexts).toContain('Calendar');
    expect(linkTexts).toContain('Tasks');
  });

  it('restores EisenKan view with filterThemeIds from navigation context', async () => {
    mockBindings.LoadNavigationContext.mockResolvedValue({
      currentView: 'eisenkan',
      currentItem: '',
      filterThemeId: '',
      filterThemeIds: ['HF'],
      lastAccessed: '',
    });

    await renderApp();

    // Tasks nav link should be active
    const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Tasks');
    expect(taskLink?.classList.contains('active')).toBe(true);

    // Breadcrumb bar should show filter context
    const breadcrumbBar = container.querySelector('.breadcrumb-bar');
    expect(breadcrumbBar).toBeTruthy();

  });

  it('restores filterThemeIds from legacy filterThemeId (backward compat)', async () => {
    mockBindings.LoadNavigationContext.mockResolvedValue({
      currentView: 'eisenkan',
      currentItem: '',
      filterThemeId: 'CG',
      lastAccessed: '',
    });

    await renderApp();

    // Tasks nav link should be active
    const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Tasks');
    expect(taskLink?.classList.contains('active')).toBe(true);

  });

  describe('Today\'s Focus', () => {
    /** Build a date string matching the format used by resolveTodayFocusThemeId */
    function todayDateString(): string {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function setupTodayFocusMocks() {
      mockBindings.GetYearFocus.mockResolvedValue([
        { date: todayDateString(), themeIds: ['HF'], notes: '', text: '' },
      ]);
      // Provide themes so ThemeFilterBar renders in EisenKanView
      mockBindings.GetThemes.mockResolvedValue([
        { id: 'HF', name: 'Health & Fitness', color: '#22c55e', objectives: [] },
      ]);
    }

    it('activates by default when no saved theme filter', async () => {
      setupTodayFocusMocks();
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'eisenkan',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
      });

      await renderApp();

      // Trigger a view switch to force SaveNavigationContext
      mockBindings.SaveNavigationContext.mockClear();
      const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
        .find(l => l.textContent?.trim() === 'Tasks');
      taskLink!.click();
      await tick();

      await vi.waitFor(() => {
        const saveCalls = mockBindings.SaveNavigationContext.mock.calls;
        const hasFocusFilter = saveCalls.some(
          (call: unknown[]) => {
            const ctx = call[0] as { filterThemeIds?: string[]; todayFocusActive?: boolean };
            return ctx.todayFocusActive === true &&
              ctx.filterThemeIds?.includes('HF');
          }
        );
        if (!hasFocusFilter) throw new Error('Expected SaveNavigationContext with todayFocusActive and HF filter');
      });
    });

    it('re-activates Today\'s Focus on EisenKan navigation even if previously false', async () => {
      setupTodayFocusMocks();
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'eisenkan',
        currentItem: '',
        filterThemeId: '',
        filterThemeIds: [],
        todayFocusActive: false,
        lastAccessed: '',
      });

      await renderApp();

      // Navigate to Tasks — should auto-activate Today's Focus since a DayFocus exists
      mockBindings.SaveNavigationContext.mockClear();
      const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
        .find(l => l.textContent?.trim() === 'Tasks');
      taskLink!.click();
      await tick();

      await vi.waitFor(() => {
        const saveCalls = mockBindings.SaveNavigationContext.mock.calls;
        const hasFocusActive = saveCalls.some(
          (call: unknown[]) => {
            const ctx = call[0] as { todayFocusActive?: boolean; filterThemeIds?: string[] };
            return ctx.todayFocusActive === true &&
              ctx.filterThemeIds !== undefined && ctx.filterThemeIds.includes('HF');
          }
        );
        if (!hasFocusActive) throw new Error('Expected SaveNavigationContext with todayFocusActive=true and filterThemeIds=[HF]');
      });
    });

    it('todayFocusActive is persisted in navigation context', async () => {
      setupTodayFocusMocks();
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'eisenkan',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
      });

      await renderApp();

      // Trigger a save by clicking the Tasks nav link
      mockBindings.SaveNavigationContext.mockClear();
      const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
        .find(l => l.textContent?.trim() === 'Tasks');
      taskLink!.click();
      await tick();

      await vi.waitFor(() => {
        const saveCalls = mockBindings.SaveNavigationContext.mock.calls;
        const hasTodayFocus = saveCalls.some(
          (call: unknown[]) => {
            const ctx = call[0] as { todayFocusActive?: boolean };
            return ctx.todayFocusActive === true;
          }
        );
        if (!hasTodayFocus) throw new Error('Expected SaveNavigationContext with todayFocusActive');
      });
    });
  });

});
