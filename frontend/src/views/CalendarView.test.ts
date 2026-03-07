import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme, DayFocus } from '../lib/wails-mock';
import CalendarView from './CalendarView.svelte';
import { formatDate as formatDateLocale, formatMonthName } from '../lib/utils/date-format';

function makeTestThemes(): LifeTheme[] {
  return [
    {
      id: 'HF',
      name: 'Health & Fitness',
      color: '#22c55e',
      objectives: [],
    },
    {
      id: 'CG',
      name: 'Career Growth',
      color: '#3b82f6',
      objectives: [],
    },
  ];
}

function makeTestYearFocus(): DayFocus[] {
  return [
    { date: '2025-01-15', themeId: 'HF', notes: '', text: 'Gym day' },
    { date: '2025-03-10', themeId: 'CG', notes: '', text: 'Interview prep' },
  ];
}

describe('CalendarView', () => {
  let container: HTMLDivElement;
  let currentYearFocus: DayFocus[];

  function makeMockBindings(themes = makeTestThemes(), yearFocus = makeTestYearFocus()) {
    currentYearFocus = JSON.parse(JSON.stringify(yearFocus));
    return {
      GetThemes: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(themes))),
      GetYearFocus: vi.fn().mockImplementation(async () => JSON.parse(JSON.stringify(currentYearFocus))),
      SaveDayFocus: vi.fn().mockImplementation(async (day: DayFocus) => {
        const idx = currentYearFocus.findIndex(e => e.date === day.date);
        if (idx >= 0) currentYearFocus[idx] = day;
        else currentYearFocus.push(day);
      }),
      ClearDayFocus: vi.fn().mockImplementation(async (date: string) => {
        const idx = currentYearFocus.findIndex(e => e.date === date);
        if (idx >= 0) currentYearFocus[idx] = { ...currentYearFocus[idx], themeId: '' };
      }),
      GetTasks: vi.fn().mockResolvedValue([]),
      LogFrontend: vi.fn(),
      LoadNavigationContext: vi.fn().mockResolvedValue({
        currentView: 'calendar',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
      }),
      SaveNavigationContext: vi.fn().mockResolvedValue(undefined),
    };
  }

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

  async function renderView(props: { year?: number } = {}) {
    const result = render(CalendarView, {
      target: container,
      props: { year: 2025, ...props },
    });
    await tick();
    await vi.waitFor(() => {
      if (container.querySelector('.loading')) throw new Error('still loading');
    });
    await tick();
    return result;
  }

  it('renders calendar header with year and navigation buttons', async () => {
    await renderView();

    const yearTitle = container.querySelector('.year-title');
    expect(yearTitle?.textContent).toBe('2025');

    const navButtons = container.querySelectorAll('.nav-button');
    expect(navButtons.length).toBe(2);

    const todayButton = container.querySelector('.today-button');
    expect(todayButton?.textContent?.trim()).toBe('Today');
  });

  it('renders 12 month columns in the grid', async () => {
    await renderView();

    const monthHeaders = container.querySelectorAll('.month-header');
    expect(monthHeaders.length).toBe(12);
    expect(monthHeaders[0].textContent).toBe(formatMonthName(0));
    expect(monthHeaders[11].textContent).toBe(formatMonthName(11));
  });

  it('renders theme legend with theme names and colors', async () => {
    await renderView();

    const legendItems = container.querySelectorAll('.legend-item');
    expect(legendItems.length).toBe(2);

    const firstLegendName = legendItems[0].querySelector('.legend-name');
    expect(firstLegendName?.textContent).toBe('Health & Fitness');

    const firstLegendColor = legendItems[0].querySelector('.legend-color');
    expect(firstLegendColor).toBeTruthy();
    const style = (firstLegendColor as HTMLElement).style.backgroundColor;
    expect(style).toBeTruthy();
  });

  it('opens edit dialog when clicking a day cell', async () => {
    await renderView();

    // Click the first day-num cell
    const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
    expect(dayCell).toBeTruthy();
    dayCell!.click();
    await tick();

    const dialog = container.querySelector('.dialog');
    expect(dialog).toBeTruthy();

    const dialogTitle = container.querySelector('[role="dialog"] h2');
    expect(dialogTitle?.textContent).toBeTruthy();

    // Should have theme select and text input
    const themeSelect = dialog!.querySelector('#theme-select');
    expect(themeSelect).toBeTruthy();
    const textInput = dialog!.querySelector('#text-input');
    expect(textInput).toBeTruthy();
  });

  it('saves day focus when submitting dialog with theme and text', async () => {
    await renderView();

    // Click a day cell to open dialog
    const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
    dayCell!.click();
    await tick();

    // Fill in the form
    const themeSelect = container.querySelector<HTMLSelectElement>('#theme-select');
    const textInput = container.querySelector<HTMLInputElement>('#text-input');

    // Set values using fireEvent to trigger Svelte bindings
    await fireEvent.change(themeSelect!, { target: { value: 'HF' } });
    await tick();

    await fireEvent.input(textInput!, { target: { value: 'Test text' } });
    await tick();

    // Click save
    const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
    saveButton!.click();
    await tick();

    await vi.waitFor(() => {
      expect(mockBindings.SaveDayFocus).toHaveBeenCalled();
    });
  });

  it('clears day focus when submitting with empty fields', async () => {
    // Pre-populate a day with focus data so the clear path is exercised
    const yearFocus: DayFocus[] = [
      { date: '2025-01-01', themeId: 'HF', notes: '', text: 'Existing' },
    ];
    mockBindings = makeMockBindings(makeTestThemes(), yearFocus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).go = { main: { App: mockBindings } };

    await renderView();

    // Find and click the Jan 1 cell
    const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
    let targetCell: HTMLButtonElement | null = null;
    for (const cell of dayCells) {
      if (cell.title?.includes(formatDateLocale('2025-01-01'))) {
        targetCell = cell;
        break;
      }
    }
    expect(targetCell).toBeTruthy();
    targetCell!.click();
    await tick();

    // Clear the theme select to empty
    const themeSelect = container.querySelector<HTMLSelectElement>('#theme-select');
    await fireEvent.change(themeSelect!, { target: { value: '' } });
    await tick();

    // Clear text
    const textInput = container.querySelector<HTMLInputElement>('#text-input');
    await fireEvent.input(textInput!, { target: { value: '' } });
    await tick();

    // Click save
    const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
    saveButton!.click();
    await tick();

    await vi.waitFor(() => {
      expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2025-01-01', themeId: '', text: '' })
      );
    });
  });

  it('cancels edit dialog via cancel button', async () => {
    await renderView();

    // Open dialog
    const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
    dayCell!.click();
    await tick();
    expect(container.querySelector('.dialog')).toBeTruthy();

    // Click cancel (find by text to avoid matching the Add button)
    const cancelButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-secondary'))
      .find(btn => btn.textContent?.trim() === 'Cancel');
    cancelButton!.click();
    await tick();

    expect(container.querySelector('.dialog')).toBeNull();
  });

  it('navigates years with prev/next buttons', async () => {
    await renderView();

    expect(container.querySelector('.year-title')?.textContent).toBe('2025');

    // Click next year
    const navButtons = container.querySelectorAll<HTMLButtonElement>('.nav-button');
    const nextButton = navButtons[1];
    nextButton.click();
    await tick();

    await vi.waitFor(() => {
      if (container.querySelector('.loading')) throw new Error('still loading');
    });
    await tick();

    expect(container.querySelector('.year-title')?.textContent).toBe('2026');

    // Click prev year
    const prevButton = container.querySelectorAll<HTMLButtonElement>('.nav-button')[0];
    prevButton.click();
    await tick();

    await vi.waitFor(() => {
      if (container.querySelector('.loading')) throw new Error('still loading');
    });
    await tick();

    expect(container.querySelector('.year-title')?.textContent).toBe('2025');
  });

  it('shows loading state during data fetch', async () => {
    // Make GetThemes hang to observe loading state
    mockBindings.GetThemes.mockReturnValue(new Promise(() => {}));

    render(CalendarView, {
      target: container,
      props: { year: 2025 },
    });
    await tick();

    const loadingEl = container.querySelector('.loading');
    expect(loadingEl).toBeTruthy();
    expect(loadingEl?.textContent).toContain('Loading');
  });

  it('shows error banner on fetch failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockBindings.GetThemes.mockRejectedValue(new Error('Network error'));

    render(CalendarView, {
      target: container,
      props: { year: 2025 },
    });
    await tick();
    await vi.waitFor(() => {
      if (container.querySelector('.loading')) throw new Error('still loading');
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

    spy.mockRestore();
  });

  it('displays day text for days with focus data', async () => {
    await renderView();

    // Find all day-text elements and check if any contains our test text
    const dayTexts = container.querySelectorAll('.day-text');
    const textsContent = Array.from(dayTexts).map(el => el.textContent);
    expect(textsContent).toContain('Gym day');
    expect(textsContent).toContain('Interview prep');
  });

  describe('state-check verification', () => {
    it('detects state mismatch when backend diverges after save', async () => {
      await renderView();
      // Opt out of global error detection: this test deliberately triggers state-check errors
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      // Click Jan 15 day cell (has existing focus data with themeId 'HF')
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      let targetCell: HTMLButtonElement | null = null;
      for (const cell of dayCells) {
        if (cell.title?.includes(formatDateLocale('2025-01-15'))) {
          targetCell = cell;
          break;
        }
      }
      expect(targetCell).toBeTruthy();
      targetCell!.click();
      await tick();

      // Set theme to CG
      const themeSelect = container.querySelector<HTMLSelectElement>('#theme-select');
      await fireEvent.change(themeSelect!, { target: { value: 'CG' } });
      await tick();

      // Before saving, make GetYearFocus return divergent data for the verify call:
      // the saved date will have themeId 'CG' locally, but backend returns 'HF'
      mockBindings.GetYearFocus.mockResolvedValueOnce([
        { date: '2025-01-15', themeId: 'HF', notes: '', text: 'Gym day' },
        { date: '2025-03-10', themeId: 'CG', notes: '', text: 'Interview prep' },
      ]);

      // Click save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.SaveDayFocus).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // ErrorBanner should appear with the mismatch message
      await vi.waitFor(() => {
        const alert = container.querySelector('[role="alert"]');
        expect(alert).toBeTruthy();
        expect(alert!.textContent).toContain('Internal state mismatch detected');
      });

      // LogFrontend should have been called with the mismatch details
      expect(mockBindings.LogFrontend).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('themeId'),
        'state-check'
      );

      // Verify console.warn was called with [state-check] prefix
      const warnings = warnSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('[state-check]'));
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('OKR picker', () => {
    function themesWithOkrs(): LifeTheme[] {
      return [
        {
          id: 'HF',
          name: 'Health & Fitness',
          color: '#22c55e',
          objectives: [
            {
              id: 'HF-O1', parentId: 'HF', title: 'Run marathon', status: 'active',
              keyResults: [
                { id: 'HF-KR1', parentId: 'HF-O1', description: 'Complete 5K' },
              ],
            },
            {
              id: 'HF-O2', parentId: 'HF', title: 'Archived goal', status: 'archived',
              keyResults: [],
            },
          ],
        },
        { id: 'CG', name: 'Career Growth', color: '#3b82f6', objectives: [] },
      ];
    }

    async function openDialogWithTheme(themeId: string, okrIds?: string[]) {
      mockBindings = makeMockBindings(themesWithOkrs(), [
        { date: '2025-01-01', themeId, notes: '', text: '', okrIds },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      // Click Jan 1 cell
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.click();
      await tick();
      // Wait for GetTasks to resolve
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });
    }

    function expandOkrSection() {
      const headers = container.querySelectorAll<HTMLButtonElement>('.collapsible-header');
      const okrHeader = Array.from(headers).find(h => h.textContent?.includes('OKR'));
      okrHeader?.click();
    }

    it('shows OKR picker when theme with objectives is selected', async () => {
      await openDialogWithTheme('HF');
      expandOkrSection();
      await tick();

      const okrPicker = container.querySelector('.okr-picker');
      expect(okrPicker).toBeTruthy();

      const items = container.querySelectorAll('.okr-item');
      expect(items.length).toBe(2); // O1 + KR1 (O2 is archived)
    });

    it('shows hierarchical markers for objectives and key results', async () => {
      await openDialogWithTheme('HF');
      expandOkrSection();
      await tick();

      const objMarkers = container.querySelectorAll('.okr-marker-obj');
      expect(objMarkers.length).toBe(1);

      const krMarkers = container.querySelectorAll('.okr-marker-kr');
      expect(krMarkers.length).toBe(1);
    });

    it('hides OKR picker when no theme is selected', async () => {
      await openDialogWithTheme('');

      const okrPicker = container.querySelector('.okr-picker');
      expect(okrPicker).toBeNull();
    });

    it('toggles OKR item selection', async () => {
      await openDialogWithTheme('HF');
      expandOkrSection();
      await tick();

      const checkboxes = container.querySelectorAll<HTMLInputElement>('.okr-item input[type="checkbox"]');
      expect(checkboxes.length).toBe(2);
      expect(checkboxes[0].checked).toBe(false);

      checkboxes[0].click();
      await tick();
      expect(checkboxes[0].checked).toBe(true);

      checkboxes[0].click();
      await tick();
      expect(checkboxes[0].checked).toBe(false);
    });

    it('saves selected OKR IDs with day focus', async () => {
      await openDialogWithTheme('HF');
      expandOkrSection();
      await tick();

      // Select the first OKR item
      const checkbox = container.querySelector<HTMLInputElement>('.okr-item input[type="checkbox"]');
      checkbox!.click();
      await tick();

      // Click Save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
          expect.objectContaining({ okrIds: ['HF-O1'] })
        );
      });
    });

    it('warns when changing theme with existing OKR refs', async () => {
      mockBindings = makeMockBindings(themesWithOkrs(), [
        { date: '2025-01-01', themeId: 'HF', notes: '', text: '', okrIds: ['HF-O1'] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Confirm should be called when changing theme
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const themeSelect = container.querySelector<HTMLSelectElement>('#theme-select');
      await fireEvent.change(themeSelect!, { target: { value: 'CG' } });
      await tick();

      expect(confirmSpy).toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe('tag picker', () => {
    function expandTagSection() {
      const headers = container.querySelectorAll<HTMLButtonElement>('.collapsible-header');
      const tagHeader = Array.from(headers).find(h => h.textContent?.includes('Tags'));
      tagHeader?.click();
    }

    it('shows tags from tasks as toggleable pills', async () => {
      mockBindings = makeMockBindings();
      mockBindings.GetTasks.mockResolvedValue([
        { id: 'T1', title: 'Task 1', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['backend', 'api'] },
        { id: 'T2', title: 'Task 2', themeId: 'CG', priority: 'important-urgent', status: 'todo', tags: ['frontend'] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
      dayCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      expandTagSection();
      await tick();

      const tagPills = container.querySelectorAll('.tag-pill');
      expect(tagPills.length).toBe(3); // api, backend, frontend (sorted)
      const tagTexts = Array.from(tagPills).map(p => p.textContent?.trim());
      expect(tagTexts).toEqual(['api', 'backend', 'frontend']);
    });

    it('toggles tag selection', async () => {
      mockBindings = makeMockBindings();
      mockBindings.GetTasks.mockResolvedValue([
        { id: 'T1', title: 'Task 1', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['review'] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
      dayCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      expandTagSection();
      await tick();

      const tagPill = container.querySelector<HTMLButtonElement>('.tag-pill');
      expect(tagPill?.classList.contains('active')).toBe(false);

      tagPill!.click();
      await tick();
      expect(tagPill?.classList.contains('active')).toBe(true);

      tagPill!.click();
      await tick();
      expect(tagPill?.classList.contains('active')).toBe(false);
    });

    it('saves selected tags with day focus', async () => {
      mockBindings = makeMockBindings();
      mockBindings.GetTasks.mockResolvedValue([
        { id: 'T1', title: 'Task 1', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['review'] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
      dayCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      expandTagSection();
      await tick();

      // Select the tag
      const tagPill = container.querySelector<HTMLButtonElement>('.tag-pill');
      tagPill!.click();
      await tick();

      // Save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['review'] })
        );
      });
    });

    it('creates new tags via text input', async () => {
      mockBindings = makeMockBindings();
      mockBindings.GetTasks.mockResolvedValue([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
      dayCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      expandTagSection();
      await tick();

      // Type a new tag
      const tagInput = container.querySelector<HTMLInputElement>('.tag-input');
      expect(tagInput).toBeTruthy();
      await fireEvent.input(tagInput!, { target: { value: 'deep-work' } });
      await fireEvent.keyDown(tagInput!, { key: 'Enter' });
      await tick();

      // New tag should appear as active pill
      const activePills = container.querySelectorAll('.tag-pill.active');
      expect(activePills.length).toBe(1);
      expect(activePills[0].textContent?.trim()).toBe('deep-work');
    });

    it('expands tag section by default when day has existing tags', async () => {
      mockBindings = makeMockBindings(makeTestThemes(), [
        { date: '2025-01-01', themeId: 'HF', notes: '', text: '', tags: ['review'] },
      ]);
      mockBindings.GetTasks.mockResolvedValue([
        { id: 'T1', title: 'Task 1', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['review'] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Tag section should be expanded automatically
      const tagPills = container.querySelectorAll('.tag-pill');
      expect(tagPills.length).toBeGreaterThan(0);
    });
  });

  describe('tag-to-text auto-derivation', () => {
    function expandTagSection() {
      const headers = container.querySelectorAll<HTMLButtonElement>('.collapsible-header');
      const tagHeader = Array.from(headers).find(h => h.textContent?.includes('Tags'));
      tagHeader?.click();
    }

    async function openDayDialog(yearFocus: DayFocus[] = [], taskTags: string[] = ['review', 'meeting', 'demo']) {
      mockBindings = makeMockBindings(makeTestThemes(), yearFocus);
      mockBindings.GetTasks.mockResolvedValue(
        taskTags.map((tag, i) => ({ id: `T${i}`, title: `Task ${i}`, themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: [tag] }))
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dateStr = formatDateLocale('2025-01-01');
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(dateStr));
      targetCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });
    }

    function getTextInputValue(): string {
      return container.querySelector<HTMLInputElement>('#text-input')!.value;
    }

    it('auto-populates text when adding a tag to empty text', async () => {
      await openDayDialog();
      expandTagSection();
      await tick();

      // Click 'demo' tag pill
      const pills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
      const demoPill = Array.from(pills).find(p => p.textContent?.trim() === 'demo');
      demoPill!.click();
      await tick();

      expect(getTextInputValue()).toBe('demo');
    });

    it('auto-updates text when adding second tag', async () => {
      await openDayDialog();
      expandTagSection();
      await tick();

      const pills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
      const demoPill = Array.from(pills).find(p => p.textContent?.trim() === 'demo');
      const reviewPill = Array.from(pills).find(p => p.textContent?.trim() === 'review');

      demoPill!.click();
      await tick();
      expect(getTextInputValue()).toBe('demo');

      reviewPill!.click();
      await tick();
      expect(getTextInputValue()).toBe('demo, review');
    });

    it('auto-updates text when removing a tag', async () => {
      await openDayDialog([
        { date: '2025-01-01', themeId: 'HF', notes: '', text: 'demo, review', tags: ['demo', 'review'] },
      ]);
      // Tag section auto-expands when day has existing tags — don't toggle it
      await tick();

      // Remove 'review' by clicking its active pill
      const pills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
      const reviewPill = Array.from(pills).find(p => p.textContent?.trim() === 'review');
      reviewPill!.click();
      await tick();

      expect(getTextInputValue()).toBe('demo');
    });

    it('preserves user-edited text when tags change', async () => {
      await openDayDialog();
      expandTagSection();
      await tick();

      // Manually type custom text
      const textInput = container.querySelector<HTMLInputElement>('#text-input')!;
      await fireEvent.input(textInput, { target: { value: 'My custom note' } });
      await tick();

      // Add a tag — text should NOT change
      const pills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
      const demoPill = Array.from(pills).find(p => p.textContent?.trim() === 'demo');
      demoPill!.click();
      await tick();

      expect(getTextInputValue()).toBe('My custom note');
    });

    it('resumes auto-updating when text is edited back to match derived', async () => {
      await openDayDialog();
      expandTagSection();
      await tick();

      // Add a tag to get derived text
      const pills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
      const demoPill = Array.from(pills).find(p => p.textContent?.trim() === 'demo');
      const reviewPill = Array.from(pills).find(p => p.textContent?.trim() === 'review');

      demoPill!.click();
      await tick();
      expect(getTextInputValue()).toBe('demo');

      // Edit text to something custom
      const textInput = container.querySelector<HTMLInputElement>('#text-input')!;
      await fireEvent.input(textInput, { target: { value: 'custom' } });
      await tick();

      // Add another tag — text preserved
      reviewPill!.click();
      await tick();
      expect(getTextInputValue()).toBe('custom');

      // Edit text back to match current derived value
      await fireEvent.input(textInput, { target: { value: 'demo, review' } });
      await tick();

      // Remove review — should auto-update since text matches
      reviewPill!.click();
      await tick();
      expect(getTextInputValue()).toBe('demo');
    });

    it('clears text when all tags removed and text matched derived', async () => {
      await openDayDialog([
        { date: '2025-01-01', themeId: 'HF', notes: '', text: 'demo', tags: ['demo'] },
      ]);
      // Tag section auto-expands when day has existing tags — don't toggle it
      await tick();

      // Remove the only tag
      const pills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
      const demoPill = Array.from(pills).find(p => p.textContent?.trim() === 'demo');
      demoPill!.click();
      await tick();

      expect(getTextInputValue()).toBe('');
    });
  });

  describe('collapsible sections', () => {
    it('OKR section defaults to collapsed when no OKR refs exist', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: '2025-01-01', themeId: 'HF', notes: '', text: '' },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // OKR picker should not be visible (section collapsed)
      expect(container.querySelector('.okr-picker')).toBeNull();
    });

    it('OKR section defaults to expanded when day has existing OKR refs', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: '2025-01-01', themeId: 'HF', notes: '', text: '', okrIds: ['HF-O1'] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // OKR picker should be visible (section expanded)
      expect(container.querySelector('.okr-picker')).toBeTruthy();
    });

    it('clicking collapsible header toggles section visibility', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: '2025-01-01', themeId: 'HF', notes: '', text: '' },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.click();
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Initially collapsed
      expect(container.querySelector('.okr-picker')).toBeNull();

      // Click to expand
      const headers = container.querySelectorAll<HTMLButtonElement>('.collapsible-header');
      const okrHeader = Array.from(headers).find(h => h.textContent?.includes('OKR'));
      expect(okrHeader).toBeTruthy();
      okrHeader!.click();
      await tick();

      expect(container.querySelector('.okr-picker')).toBeTruthy();

      // Click to collapse again
      okrHeader!.click();
      await tick();

      expect(container.querySelector('.okr-picker')).toBeNull();
    });
  });
});
