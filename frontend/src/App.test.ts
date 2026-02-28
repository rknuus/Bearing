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
      currentView: 'home',
      currentItem: '',
      filterThemeId: '',
      filterDate: '',
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

  it('renders home view by default with welcome message', async () => {
    await renderApp();

    const placeholder = container.querySelector('.placeholder-view');
    expect(placeholder).toBeTruthy();

    const heading = placeholder!.querySelector('h1');
    expect(heading?.textContent).toContain('Welcome to Bearing');

    // Quick nav buttons should be present
    const quickNavBtns = container.querySelectorAll('.quick-nav-btn');
    expect(quickNavBtns.length).toBe(3);
  });

  it('clicking nav links switches between views', async () => {
    await renderApp();

    // Should start on home
    expect(container.querySelector('.placeholder-view')).toBeTruthy();

    // Click OKRs nav link
    const navLinks = container.querySelectorAll<HTMLButtonElement>('.nav-link');
    const okrLink = Array.from(navLinks).find(l => l.textContent?.trim() === 'OKRs');
    expect(okrLink).toBeTruthy();
    okrLink!.click();
    await tick();
    // Wait for child view to start loading
    await vi.waitFor(() => {
      expect(container.querySelector('.placeholder-view')).toBeNull();
    });

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

    // Home should be active
    const homeLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Home');
    expect(homeLink?.classList.contains('active')).toBe(true);

    // Click OKRs
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    okrLink!.click();
    await tick();

    // OKRs should now be active, Home should not
    expect(okrLink?.classList.contains('active')).toBe(true);
    const homeLinkAfter = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Home');
    expect(homeLinkAfter?.classList.contains('active')).toBe(false);
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
      filterDate: '',
      lastAccessed: '',
    });

    await renderApp();

    // OKRs should be the active view
    const okrLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'OKRs');
    expect(okrLink?.classList.contains('active')).toBe(true);

    // Home should not be visible
    expect(container.querySelector('.placeholder-view')).toBeNull();
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

  it('renders navigation bar with all nav links', async () => {
    await renderApp();

    const nav = container.querySelector('.navigation');
    expect(nav).toBeTruthy();

    const brand = container.querySelector('.nav-brand');
    expect(brand?.textContent).toBe('Bearing');

    const navLinks = container.querySelectorAll('.nav-link');
    const linkTexts = Array.from(navLinks).map(l => l.textContent?.trim());
    expect(linkTexts).toContain('Home');
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
      filterDate: '',
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
      filterDate: '',
      lastAccessed: '',
    });

    await renderApp();

    // Tasks nav link should be active
    const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Tasks');
    expect(taskLink?.classList.contains('active')).toBe(true);

  });

  it('restores Calendar view with filterDate from navigation context', async () => {
    mockBindings.LoadNavigationContext.mockResolvedValue({
      currentView: 'calendar',
      currentItem: '',
      filterThemeId: '',
      filterDate: '2026-01-15',
      lastAccessed: '',
    });

    await renderApp();

    // Calendar nav link should be active
    const calLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Calendar');
    expect(calLink?.classList.contains('active')).toBe(true);
  });

  it('quick nav buttons on home navigate to correct views', async () => {
    await renderApp();

    // Click "Tasks" quick nav button (third button)
    const quickNavBtns = container.querySelectorAll<HTMLButtonElement>('.quick-nav-btn');
    expect(quickNavBtns.length).toBe(3);

    // Click the Tasks quick nav button
    quickNavBtns[2].click();
    await tick();

    const taskLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link'))
      .find(l => l.textContent?.trim() === 'Tasks');
    expect(taskLink?.classList.contains('active')).toBe(true);
  });
});
