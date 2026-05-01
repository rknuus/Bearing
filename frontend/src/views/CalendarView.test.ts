import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme, DayFocus, RoutineOccurrence } from '../lib/wails-mock';
import { parseCalendarDate, type CalendarDate } from '../lib/utils/date-utils';
import CalendarView from './CalendarView.svelte';
import { formatDate as formatDateLocale, formatMonthName, formatWeekdayShort } from '../lib/utils/date-format';

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
    { date: parseCalendarDate('2025-01-15'), themeIds: ['HF'], notes: '', text: 'Gym day' },
    { date: parseCalendarDate('2025-03-10'), themeIds: ['CG'], notes: '', text: 'Interview prep' },
  ];
}

describe('CalendarView', () => {
  let container: HTMLDivElement;
  let currentYearFocus: DayFocus[];

  function makeMockBindings(themes = makeTestThemes(), yearFocus = makeTestYearFocus()) {
    currentYearFocus = JSON.parse(JSON.stringify(yearFocus));
    return {
      GetHierarchy: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(themes))),
      GetYearFocus: vi.fn().mockImplementation(async () => JSON.parse(JSON.stringify(currentYearFocus))),
      SaveDayFocus: vi.fn().mockImplementation(async (day: DayFocus) => {
        const idx = currentYearFocus.findIndex(e => e.date === day.date);
        if (idx >= 0) currentYearFocus[idx] = day;
        else currentYearFocus.push(day);
      }),
      RecordRoutineCompletions: vi.fn().mockImplementation(async (day: DayFocus) => {
        const idx = currentYearFocus.findIndex(e => e.date === day.date);
        if (idx >= 0) currentYearFocus[idx] = day;
        else currentYearFocus.push(day);
      }),
      ClearDayFocus: vi.fn().mockImplementation(async (date: string) => {
        const idx = currentYearFocus.findIndex(e => e.date === date);
        if (idx >= 0) currentYearFocus[idx] = { ...currentYearFocus[idx], themeIds: undefined };
      }),
      GetTasks: vi.fn().mockResolvedValue([]),
      GetRoutines: vi.fn().mockResolvedValue([]),
      GetRoutinesForDate: vi.fn().mockResolvedValue([]),
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

  async function renderView(props: { year?: number; currentDate?: CalendarDate; onTodayFocusEdited?: () => void } = {}) {
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
    expect(todayButton?.textContent?.trim()).toBe('Current year');
  });

  it('renders 12 month columns in the grid', async () => {
    await renderView();

    const monthHeaders = container.querySelectorAll('.month-header');
    expect(monthHeaders.length).toBe(12);
    expect(monthHeaders[0].textContent).toBe(formatMonthName(0));
    expect(monthHeaders[11].textContent).toBe(formatMonthName(11));
  });

  it('renders weekday abbreviation cells for each month', async () => {
    await renderView();

    const weekdayCells = container.querySelectorAll('.day-weekday');
    // 365 days in 2025
    expect(weekdayCells.length).toBe(365);

    // Jan 1 2025 is a Wednesday
    const jsDay = new Date(2025, 0, 1).getDay();
    const expectedName = formatWeekdayShort((jsDay + 6) % 7);
    expect(weekdayCells[0].textContent?.trim()).toBe(expectedName);
  });

  it('applies Sunday tint to individual Sunday cells', async () => {
    await renderView();

    // Jan 5 2025 is a Sunday — find its day-num cell by title
    const sundayDate = formatDateLocale('2025-01-05');
    const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
    const sundayCell = Array.from(dayCells).find(c => c.title?.includes(sundayDate));
    expect(sundayCell).toBeTruthy();
    expect(sundayCell!.style.backgroundColor).toBe('rgb(238, 242, 255)');
  });

  it('applies theme tint only to text cells', async () => {
    await renderView();

    // Jan 15 has themeIds: ['HF'] — theme color #22c55e
    const jan15 = formatDateLocale('2025-01-15');
    const numCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
    const numCell = Array.from(numCells).find(c => c.title?.includes(jan15));
    expect(numCell).toBeTruthy();
    // Day-num should NOT have theme tint
    expect(numCell!.style.backgroundColor).toBeFalsy();

    // Text cell should have theme tint (find by inner text content span)
    const textContentSpans = container.querySelectorAll<HTMLSpanElement>('.day-text-content');
    const textSpan = Array.from(textContentSpans).find(c => c.textContent === 'Gym day');
    const textCell = textSpan?.closest('.day-text') as HTMLButtonElement | null;
    expect(textCell).toBeTruthy();
    expect(textCell!.style.backgroundColor).toBeTruthy();
  });

  it('renders multi-theme day cells with text', async () => {
    // Create year focus with 2 themes on Jan 20
    const multiThemeFocus: DayFocus[] = [
      { date: parseCalendarDate('2025-01-20'), themeIds: ['HF', 'CG'], notes: '', text: 'Multi-theme day' },
    ];
    mockBindings = makeMockBindings(makeTestThemes(), multiThemeFocus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).go = { main: { App: mockBindings } };
    await renderView();

    // Verify multi-theme day renders correctly with text content
    const dayTextSpans = container.querySelectorAll('.day-text-content');
    const textsContent = Array.from(dayTextSpans).map(el => el.textContent);
    expect(textsContent).toContain('Multi-theme day');

    // Verify the cell exists and doesn't use single-theme background-color
    // (JSDOM cannot parse linear-gradient, so we verify data flow only;
    // gradient rendering is validated in the real WebView)
    const jan20 = formatDateLocale('2025-01-20');
    const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
    const cell = Array.from(dayCells).find(c => c.title?.includes(jan20));
    expect(cell).toBeTruthy();
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

  it('opens edit dialog when double-clicking a day cell', async () => {
    await renderView();

    // Click the first day-num cell
    const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
    expect(dayCell).toBeTruthy();
    dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    await vi.waitFor(() => {
      if (!container.querySelector('.dialog')) throw new Error('dialog not open');
    });

    const dialog = container.querySelector('.dialog');
    expect(dialog).toBeTruthy();

    const dialogTitle = container.querySelector('[role="dialog"] h2');
    expect(dialogTitle?.textContent).toBeTruthy();

    // Should have theme tree and text input
    const themeTree = dialog!.querySelector('.theme-okr-tree');
    expect(themeTree).toBeTruthy();
    const textInput = dialog!.querySelector('#text-input');
    expect(textInput).toBeTruthy();
  });

  it('saves day focus when submitting dialog with theme and text', async () => {
    await renderView();

    // Click a day cell to open dialog
    const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
    dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    await vi.waitFor(() => {
      if (!container.querySelector('.dialog')) throw new Error('dialog not open');
    });

    // Fill in the form — select theme via checkbox
    const themeCheckboxes = container.querySelectorAll<HTMLInputElement>('.tree-theme-item .tree-checkbox-label input[type="checkbox"]');
    themeCheckboxes[0].click(); // Check first theme (HF)
    await tick();

    const textInput = container.querySelector<HTMLInputElement>('#text-input');
    await fireEvent.input(textInput!, { target: { value: 'Test text' } });
    await tick();

    // Click save
    const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
    saveButton!.click();
    await tick();

    await vi.waitFor(() => {
      expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
    });
  });

  it('clears day focus when submitting with empty fields', async () => {
    // Pre-populate a day with focus data so the clear path is exercised
    const yearFocus: DayFocus[] = [
      { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: 'Existing' },
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
    targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    await vi.waitFor(() => {
      if (!container.querySelector('.dialog')) throw new Error('dialog not open');
    });

    // Uncheck the theme to clear it
    const themeCheckbox = container.querySelector<HTMLInputElement>('.tree-theme-item .tree-checkbox-label input[type="checkbox"]:checked');
    if (themeCheckbox) {
      themeCheckbox.click();
      await tick();
    }

    // Clear text
    const textInput = container.querySelector<HTMLInputElement>('#text-input');
    await fireEvent.input(textInput!, { target: { value: '' } });
    await tick();

    // Click save
    const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
    saveButton!.click();
    await tick();

    await vi.waitFor(() => {
      expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2025-01-01', text: '' }),
        expect.any(Array),
      );
      // themeIds should be undefined (no themes selected)
      const call = mockBindings.RecordRoutineCompletions.mock.calls.find(
        (c: unknown[]) => (c[0] as DayFocus).date === '2025-01-01'
      );
      expect(call).toBeTruthy();
      expect((call![0] as DayFocus).themeIds).toBeUndefined();
    });
  });

  it('cancels edit dialog via cancel button', async () => {
    await renderView();

    // Open dialog
    const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
    dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    await vi.waitFor(() => {
      if (!container.querySelector('.dialog')) throw new Error('dialog not open');
    });

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
    // Make GetHierarchy hang to observe loading state
    mockBindings.GetHierarchy.mockReturnValue(new Promise(() => {}));

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
    mockBindings.GetHierarchy.mockRejectedValue(new Error('Network error'));

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

    // Find all day-text-content spans and check if any contains our test text
    const dayTextSpans = container.querySelectorAll('.day-text-content');
    const textsContent = Array.from(dayTextSpans).map(el => el.textContent);
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
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Set theme to CG via checkbox
      const themeCheckboxes = container.querySelectorAll<HTMLInputElement>('.tree-theme-item .tree-checkbox-label input[type="checkbox"]');
      // CG is the second theme
      themeCheckboxes[1].click();
      await tick();

      // Before saving, make GetYearFocus return divergent data for the verify call:
      // the saved date will have themeIds ['CG'] locally, but backend returns ['HF']
      mockBindings.GetYearFocus.mockResolvedValueOnce([
        { date: parseCalendarDate('2025-01-15'), themeIds: ['HF'], notes: '', text: 'Gym day' },
        { date: parseCalendarDate('2025-03-10'), themeIds: ['CG'], notes: '', text: 'Interview prep' },
      ]);

      // Click save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
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
        expect.stringContaining('themeIds'),
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
        { date: parseCalendarDate('2025-01-01'), themeIds: themeId ? [themeId] : undefined, notes: '', text: '', okrIds },
      ]);
      // Mock saved fold state so themes and objectives are expanded for OKR picker tests
      if (themeId) {
        const themes = themesWithOkrs();
        const theme = themes.find(t => t.id === themeId);
        const expandedIds = [themeId];
        if (theme) {
          for (const obj of theme.objectives) {
            if (obj.status !== 'archived') expandedIds.push(obj.id);
          }
        }
        mockBindings.LoadNavigationContext.mockResolvedValue({
          currentView: 'calendar',
          currentItem: '',
          filterThemeId: '',
          lastAccessed: '',
          calendarDayEditorDate: '2025-01-01',
          calendarDayEditorExpandedIds: expandedIds,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      // Click Jan 1 cell
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      // Wait for GetTasks to resolve
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });
    }

    it('shows OKR items when theme with objectives is checked', async () => {
      await openDialogWithTheme('HF');

      // Theme HF is pre-checked, so its objectives should be visible
      const objItems = container.querySelectorAll('.tree-objective-item');
      expect(objItems.length).toBe(1); // O1 visible (O2 is archived)

      const krItems = container.querySelectorAll('.tree-kr-item');
      expect(krItems.length).toBe(1); // KR1 visible
    });

    it('shows hierarchical markers for objectives and key results', async () => {
      await openDialogWithTheme('HF');

      const objMarkers = container.querySelectorAll('.tree-marker-obj');
      expect(objMarkers.length).toBe(1);

      const krMarkers = container.querySelectorAll('.tree-marker-kr');
      expect(krMarkers.length).toBe(1);
    });

    it('hides OKR items when no theme is checked', async () => {
      await openDialogWithTheme('');

      // No theme checked, so no objectives visible
      const objItems = container.querySelectorAll('.tree-objective-item');
      expect(objItems.length).toBe(0);
    });

    it('toggles OKR item selection', async () => {
      await openDialogWithTheme('HF');

      // Get OKR checkboxes (not theme checkboxes)
      const okrCheckboxes = container.querySelectorAll<HTMLInputElement>('.tree-objective-item .tree-checkbox-label input[type="checkbox"], .tree-kr-item .tree-checkbox-label input[type="checkbox"]');
      expect(okrCheckboxes.length).toBe(2);
      expect(okrCheckboxes[0].checked).toBe(false);

      okrCheckboxes[0].click();
      await tick();
      expect(okrCheckboxes[0].checked).toBe(true);

      okrCheckboxes[0].click();
      await tick();
      expect(okrCheckboxes[0].checked).toBe(false);
    });

    it('saves selected OKR IDs with day focus', async () => {
      await openDialogWithTheme('HF');

      // Select the first OKR item (objective)
      const okrCheckbox = container.querySelector<HTMLInputElement>('.tree-objective-item .tree-checkbox-label input[type="checkbox"]');
      okrCheckbox!.click();
      await tick();

      // Click Save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalledWith(
          expect.objectContaining({ okrIds: ['HF-O1'] }),
          expect.any(Array),
        );
      });
    });

    it('clears OKR refs when unchecking a theme', async () => {
      await openDialogWithTheme('HF', ['HF-O1']);

      // OKR should be pre-selected
      const okrCheckbox = container.querySelector<HTMLInputElement>('.tree-objective-item .tree-checkbox-label input[type="checkbox"]');
      expect(okrCheckbox!.checked).toBe(true);

      // Uncheck the theme
      const themeCheckbox = container.querySelector<HTMLInputElement>('.tree-theme-item .tree-checkbox-label input[type="checkbox"]:checked');
      themeCheckbox!.click();
      await tick();

      // Save and verify OKR refs cleared
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
        const call = mockBindings.RecordRoutineCompletions.mock.calls[0];
        expect((call[0] as DayFocus).themeIds).toBeUndefined();
      });
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
      dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
      dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
      dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['review'] }),
          expect.any(Array),
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
      dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: '', tags: ['review'] },
      ]);
      mockBindings.GetTasks.mockResolvedValue([
        { id: 'T1', title: 'Task 1', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['review'] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: 'demo, review', tags: ['demo', 'review'] },
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

    it('auto-derives text after user clears custom text and adds tags', async () => {
      await openDayDialog([
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: 'custom note', tags: ['demo'] },
      ]);
      // Tag section auto-expands when day has existing tags
      await tick();

      // Clear the text field
      const textInput = container.querySelector<HTMLInputElement>('#text-input')!;
      await fireEvent.input(textInput, { target: { value: '' } });
      await tick();

      // Add a new tag — text should auto-derive since it's now empty
      const pills = container.querySelectorAll<HTMLButtonElement>('.tag-pill');
      const reviewPill = Array.from(pills).find(p => p.textContent?.trim() === 'review');
      reviewPill!.click();
      await tick();

      expect(getTextInputValue()).toBe('demo, review');
    });

    it('clears text when all tags removed and text matched derived', async () => {
      await openDayDialog([
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: 'demo', tags: ['demo'] },
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

  describe('theme-okr tree in dialog', () => {
    it('starts collapsed when theme is selected but no saved fold state', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: '' },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Theme checkbox should be checked but objectives collapsed (no saved fold state)
      const themeCheckbox = container.querySelector('.tree-theme-item input[type="checkbox"]') as HTMLInputElement;
      expect(themeCheckbox.checked).toBe(true);
      expect(container.querySelector('.tree-objective-item')).toBeNull();
    });

    it('shows checked OKR when day has existing OKR refs and saved fold state', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: '', okrIds: ['HF-O1'] },
      ]);
      // Mock saved fold state for this day with HF expanded
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'calendar',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
        calendarDayEditorDate: '2025-01-01',
        calendarDayEditorExpandedIds: ['HF'],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Objective checkbox should be checked and visible (fold state restored)
      const objCheckbox = container.querySelector('.tree-objective-item input[type="checkbox"]') as HTMLInputElement;
      expect(objCheckbox.checked).toBe(true);
    });

    it('toggling expand button shows and hides objectives', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: parseCalendarDate('2025-01-01'), notes: '', text: '' },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // No theme expanded — objectives not shown
      expect(container.querySelector('.tree-objective-item')).toBeNull();

      // Click expand button to show objectives
      const expandBtn = container.querySelector<HTMLButtonElement>('.tree-expand-button');
      expandBtn!.click();
      await tick();

      expect(container.querySelector('.tree-objective-item')).toBeTruthy();

      // Click expand button again to collapse
      expandBtn!.click();
      await tick();

      expect(container.querySelector('.tree-objective-item')).toBeNull();
    });
  });

  describe('fold state persistence', () => {
    it('starts collapsed for a new day (no saved fold state)', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: '' },
      ]);
      // NavigationContext has fold state for a different day
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'calendar',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
        calendarDayEditorDate: '2025-01-02',
        calendarDayEditorExpandedIds: ['HF'],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Objectives should not be visible (collapsed)
      expect(container.querySelector('.tree-objective-item')).toBeNull();
    });

    it('restores fold state for the same day', async () => {
      const themes: LifeTheme[] = [{
        id: 'HF', name: 'Health', color: '#22c55e',
        objectives: [{ id: 'HF-O1', parentId: 'HF', title: 'Goal', status: 'active', keyResults: [] }],
      }];
      mockBindings = makeMockBindings(themes, [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: '' },
      ]);
      // NavigationContext has fold state for this exact day
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'calendar',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
        calendarDayEditorDate: '2025-01-01',
        calendarDayEditorExpandedIds: ['HF'],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(formatDateLocale('2025-01-01')));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Objectives should be visible (fold state restored)
      expect(container.querySelector('.tree-objective-item')).toBeTruthy();
    });

    it('persists fold state on save', async () => {
      await renderView();

      // Open a day dialog
      const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
      dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Click save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
      });

      // Wait for the async NavigationContext persistence
      await vi.waitFor(() => {
        expect(mockBindings.SaveNavigationContext).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarDayEditorDate: expect.any(String),
            calendarDayEditorExpandedIds: expect.any(Array),
          })
        );
      });
    });

    it('persists fold state on cancel', async () => {
      await renderView();

      // Open a day dialog
      const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
      dayCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Click cancel
      const cancelButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-secondary'))
        .find(btn => btn.textContent?.trim() === 'Cancel');
      cancelButton!.click();
      await tick();

      // Wait for the async NavigationContext persistence
      await vi.waitFor(() => {
        expect(mockBindings.SaveNavigationContext).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarDayEditorDate: expect.any(String),
            calendarDayEditorExpandedIds: expect.any(Array),
          })
        );
      });
    });
  });

  describe('cell selection and copy/paste', () => {
    it('single-click selects text cell', async () => {
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');
      textCells[0].click();
      await tick();

      expect(textCells[0].classList.contains('selected')).toBe(true);
    });

    it('clicking another cell moves selection', async () => {
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');
      textCells[0].click();
      await tick();
      expect(textCells[0].classList.contains('selected')).toBe(true);

      textCells[1].click();
      await tick();
      expect(textCells[0].classList.contains('selected')).toBe(false);
      expect(textCells[1].classList.contains('selected')).toBe(true);
    });

    it('shift+click extends selection within month', async () => {
      await renderView();

      // All text cells in month 0 (January) are the first 31
      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');
      // Click day 1 (index 0)
      textCells[0].click();
      await tick();

      // Shift+click day 3 (index 2) — same month
      textCells[2].dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
      await tick();

      expect(textCells[0].classList.contains('selected')).toBe(true);
      expect(textCells[1].classList.contains('selected')).toBe(true);
      expect(textCells[2].classList.contains('selected')).toBe(true);
    });

    it('shift+click across months does nothing special', async () => {
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');
      // Click day 1 of January (index 0)
      textCells[0].click();
      await tick();

      // Shift+click day 1 of February (index 31, since January has 31 days)
      textCells[31].dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
      await tick();

      // Since months differ, shift+click acts as a single click on the new cell
      expect(textCells[0].classList.contains('selected')).toBe(false);
      expect(textCells[31].classList.contains('selected')).toBe(true);
    });

    it('ctrl+C copies focus data and ctrl+V pastes to target', async () => {
      // Set up data: Jan 15 has focus data
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');
      // Find Jan 15 text cell (index 14 since Jan day 1 = index 0)
      textCells[14].click();
      await tick();

      // Copy with Ctrl+C
      const calendarView = container.querySelector('.calendar-view')!;
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      await tick();

      // Select an empty cell (Jan 20, index 19)
      textCells[19].click();
      await tick();

      // Paste with Ctrl+V
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
          expect.objectContaining({
            date: '2025-01-20',
            themeIds: ['HF'],
            text: 'Gym day',
          })
        );
      });
    });

    it('paste single day preserves target notes', async () => {
      // Target day has existing notes
      const yearFocus: DayFocus[] = [
        { date: parseCalendarDate('2025-01-15'), themeIds: ['HF'], notes: '', text: 'Gym day', okrIds: ['O1'], tags: ['fitness'] },
        { date: parseCalendarDate('2025-01-20'), themeIds: undefined, notes: 'important note', text: '' },
      ];
      mockBindings = makeMockBindings(makeTestThemes(), yearFocus);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');

      // Select and copy Jan 15
      textCells[14].click();
      await tick();
      const calendarView = container.querySelector('.calendar-view')!;
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      await tick();

      // Select and paste to Jan 20
      textCells[19].click();
      await tick();
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
          expect.objectContaining({
            date: '2025-01-20',
            themeIds: ['HF'],
            text: 'Gym day',
            notes: 'important note',
            okrIds: ['O1'],
            tags: ['fitness'],
          })
        );
      });
    });

    it('paste multi-day range clamped to month', async () => {
      // Set up 3 days of data in January
      const yearFocus: DayFocus[] = [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: 'Day 1' },
        { date: parseCalendarDate('2025-01-02'), themeIds: ['CG'], notes: '', text: 'Day 2' },
        { date: parseCalendarDate('2025-01-03'), themeIds: undefined, notes: '', text: 'Day 3' },
      ];
      mockBindings = makeMockBindings(makeTestThemes(), yearFocus);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');

      // Select days 1-3 using click + shift+click
      textCells[0].click();
      await tick();
      textCells[2].dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
      await tick();

      // Copy
      const calendarView = container.querySelector('.calendar-view')!;
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      await tick();

      // Select day 30 of January (index 29) — only 31 days in Jan, so only 2 should paste
      textCells[29].click();
      await tick();

      // Paste
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
      await tick();

      await vi.waitFor(() => {
        // Day 30 and 31 should be pasted, day 32 would exceed month
        expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
          expect.objectContaining({ date: '2025-01-30', text: 'Day 1' })
        );
        expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
          expect.objectContaining({ date: '2025-01-31', text: 'Day 2' })
        );
        // Should NOT have pasted a 3rd day (Feb 1 would be day 32)
        const calls = mockBindings.SaveDayFocus.mock.calls;
        const pastedDates = calls.map((c: unknown[]) => (c[0] as DayFocus).date);
        expect(pastedDates).not.toContain('2025-02-01');
      });
    });

    it('paste overwrites existing data', async () => {
      const yearFocus: DayFocus[] = [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: 'Source' },
        { date: parseCalendarDate('2025-01-10'), themeIds: ['CG'], notes: 'keep notes', text: 'Old target text' },
      ];
      mockBindings = makeMockBindings(makeTestThemes(), yearFocus);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');

      // Copy day 1
      textCells[0].click();
      await tick();
      const calendarView = container.querySelector('.calendar-view')!;
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      await tick();

      // Paste to day 10
      textCells[9].click();
      await tick();
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.SaveDayFocus).toHaveBeenCalledWith(
          expect.objectContaining({
            date: '2025-01-10',
            themeIds: ['HF'],
            text: 'Source',
            notes: 'keep notes', // notes preserved from existing
          })
        );
      });
    });

    it('escape clears selection', async () => {
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');
      textCells[0].click();
      await tick();
      expect(textCells[0].classList.contains('selected')).toBe(true);

      const calendarView = container.querySelector('.calendar-view')!;
      calendarView.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();

      expect(textCells[0].classList.contains('selected')).toBe(false);
      const selectedCount = container.querySelectorAll('.day-text.selected').length;
      expect(selectedCount).toBe(0);
    });

    it('click outside grid clears selection', async () => {
      await renderView();

      const textCells = container.querySelectorAll<HTMLButtonElement>('.day-text');
      textCells[0].click();
      await tick();
      expect(textCells[0].classList.contains('selected')).toBe(true);

      // Click the header area (outside the grid)
      const header = container.querySelector<HTMLElement>('.calendar-header')!;
      header.click();
      await tick();

      expect(textCells[0].classList.contains('selected')).toBe(false);
      const selectedCount = container.querySelectorAll('.day-text.selected').length;
      expect(selectedCount).toBe(0);
    });
  });

  describe('routine-task bridge', () => {
    function makeRoutineOccurrences(): RoutineOccurrence[] {
      return [
        {
          routineId: 'R1',
          description: 'Morning run',
          date: parseCalendarDate('2025-01-01'),
          status: 'scheduled',
          checked: false,
        },
        {
          routineId: 'R2',
          description: 'Evening stretch',
          date: parseCalendarDate('2025-01-01'),
          status: 'overdue',
          checked: false,
        },
      ];
    }

    async function openDialogWithRoutines(
      routines: RoutineOccurrence[] = makeRoutineOccurrences(),
      yearFocus: DayFocus[] = [],
    ) {
      mockBindings = makeMockBindings(makeTestThemes(), yearFocus);
      mockBindings.GetRoutinesForDate.mockResolvedValue(routines);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      const dateStr = formatDateLocale('2025-01-01');
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const targetCell = Array.from(dayCells).find(c => c.title?.includes(dateStr));
      targetCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });
      // Wait for GetRoutinesForDate to resolve
      await tick();
    }

    it('adds Routine tag when first routine is checked', async () => {
      await openDialogWithRoutines();

      // Check the first routine
      const routineCheckboxes = container.querySelectorAll<HTMLInputElement>('.routine-check input[type="checkbox"]');
      expect(routineCheckboxes.length).toBeGreaterThanOrEqual(1);
      routineCheckboxes[0].click();
      await tick();

      // Verify "Routine" tag is now in the tag pills
      // The tag section should show Routine as active (it's auto-managed)
      // Save and verify the tag is included
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
        const call = mockBindings.RecordRoutineCompletions.mock.calls[0];
        const savedDay = call[0] as DayFocus;
        expect(savedDay.tags).toContain('Routine');
        expect(savedDay.routineChecks).toContain('R1');
      });
    });

    it('removes Routine tag when last routine is unchecked', async () => {
      // Start with one routine already checked
      const routines = makeRoutineOccurrences();
      routines[0].checked = true;
      const yearFocus: DayFocus[] = [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: '', tags: ['Routine'], routineChecks: ['R1'] },
      ];

      await openDialogWithRoutines(routines, yearFocus);

      // Uncheck the only checked routine (R1)
      const routineCheckboxes = container.querySelectorAll<HTMLInputElement>('.routine-check input[type="checkbox"]');
      // R1 is the first checkbox, and it should be checked
      const r1Checkbox = Array.from(routineCheckboxes).find(cb => cb.checked);
      expect(r1Checkbox).toBeTruthy();
      r1Checkbox!.click();
      await tick();

      // Save and verify the tag is removed
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
        const call = mockBindings.RecordRoutineCompletions.mock.calls[0];
        const savedDay = call[0] as DayFocus;
        // Tags should not contain Routine (either undefined or missing)
        expect(savedDay.tags ?? []).not.toContain('Routine');
      });
    });

    it('calls RecordRoutineCompletions with current day focus and previous checks snapshot', async () => {
      // Start with R1 already checked
      const routines = makeRoutineOccurrences();
      routines[0].checked = true;
      const yearFocus: DayFocus[] = [
        { date: parseCalendarDate('2025-01-01'), themeIds: ['HF'], notes: '', text: '', routineChecks: ['R1'] },
      ];

      await openDialogWithRoutines(routines, yearFocus);

      // Check R2 as well
      const routineCheckboxes = container.querySelectorAll<HTMLInputElement>('.routine-check input[type="checkbox"]');
      const uncheckedBox = Array.from(routineCheckboxes).find(cb => !cb.checked);
      expect(uncheckedBox).toBeTruthy();
      uncheckedBox!.click();
      await tick();

      // Save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
        const call = mockBindings.RecordRoutineCompletions.mock.calls[0];

        // Arg 0: DayFocus carries the new check set.
        const savedDay = call[0] as DayFocus;
        expect(savedDay.routineChecks).toEqual(expect.arrayContaining(['R1', 'R2']));

        // Arg 1: previousChecks — the snapshot before edits. Backend
        // derives overdue/description server-side; no client-supplied
        // routine metadata is passed (atomicity initiative #105).
        const prevChecks = call[1] as string[];
        expect(prevChecks).toEqual(['R1']);
      });
    });

    it('renders overdue routine without suffix when missedCount is undefined', async () => {
      const routines: RoutineOccurrence[] = [
        {
          routineId: 'R-OVD',
          description: 'Evening stretch',
          date: parseCalendarDate('2024-12-30'),
          status: 'overdue',
          checked: false,
        },
      ];
      await openDialogWithRoutines(routines);

      const overdueRow = container.querySelector<HTMLElement>('.routine-row.overdue');
      expect(overdueRow).toBeTruthy();
      const desc = overdueRow!.querySelector<HTMLElement>('.routine-desc');
      expect(desc).toBeTruthy();
      expect(desc!.textContent).toContain('Evening stretch');
      expect(desc!.textContent).not.toContain('missed');
    });

    it('renders overdue routine without suffix when missedCount is 1', async () => {
      const routines: RoutineOccurrence[] = [
        {
          routineId: 'R-OVD',
          description: 'Evening stretch',
          date: parseCalendarDate('2024-12-30'),
          status: 'overdue',
          checked: false,
          missedCount: 1,
        },
      ];
      await openDialogWithRoutines(routines);

      const overdueRow = container.querySelector<HTMLElement>('.routine-row.overdue');
      expect(overdueRow).toBeTruthy();
      const desc = overdueRow!.querySelector<HTMLElement>('.routine-desc');
      expect(desc).toBeTruthy();
      expect(desc!.textContent).toContain('Evening stretch');
      expect(desc!.textContent).not.toContain('missed');
    });

    it('renders overdue routine with suffix when missedCount is 5 and preserves overdue class', async () => {
      const routines: RoutineOccurrence[] = [
        {
          routineId: 'R-OVD',
          description: 'Evening stretch',
          date: parseCalendarDate('2024-12-30'),
          status: 'overdue',
          checked: false,
          missedCount: 5,
        },
      ];
      await openDialogWithRoutines(routines);

      const overdueRow = container.querySelector<HTMLElement>('.routine-row.overdue');
      expect(overdueRow).toBeTruthy();
      // Existing styling is unchanged — the .overdue class is still applied.
      expect(overdueRow!.classList.contains('overdue')).toBe(true);
      const desc = overdueRow!.querySelector<HTMLElement>('.routine-desc');
      expect(desc).toBeTruthy();
      expect(desc!.textContent).toContain('Evening stretch');
      expect(desc!.textContent).toContain('5 missed');
    });
  });

  describe('onTodayFocusEdited callback', () => {
    it('calls onTodayFocusEdited when saving today\'s focus', async () => {
      const todayStr = parseCalendarDate('2025-01-15');
      const onTodayFocusEdited = vi.fn();
      await renderView({ currentDate: todayStr, onTodayFocusEdited });

      // Double-click the Jan 15 cell (which matches currentDate)
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const jan15Cell = Array.from(dayCells).find(cell => cell.textContent?.trim() === '15');
      jan15Cell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Select a theme and save
      const themeCheckboxes = container.querySelectorAll<HTMLInputElement>('.tree-theme-item .tree-checkbox-label input[type="checkbox"]');
      themeCheckboxes[0].click();
      await tick();

      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
      });
      expect(onTodayFocusEdited).toHaveBeenCalledOnce();
    });

    it('does not call onTodayFocusEdited when saving a non-today focus', async () => {
      const todayStr = parseCalendarDate('2025-01-20');
      const onTodayFocusEdited = vi.fn();
      await renderView({ currentDate: todayStr, onTodayFocusEdited });

      // Double-click Jan 15 cell (not today)
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const jan15Cell = Array.from(dayCells).find(cell => cell.textContent?.trim() === '15');
      jan15Cell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Select a theme and save
      const themeCheckboxes = container.querySelectorAll<HTMLInputElement>('.tree-theme-item .tree-checkbox-label input[type="checkbox"]');
      themeCheckboxes[0].click();
      await tick();

      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalled();
      });
      expect(onTodayFocusEdited).not.toHaveBeenCalled();
    });
  });

  describe('save error handling', () => {
    it('shows ErrorBanner inside the dialog when save fails', async () => {
      // Suppress expected console.error from the catch block
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockBindings.RecordRoutineCompletions.mockRejectedValueOnce(new Error('network timeout'));
      await renderView();

      // Double-click Jan 15 cell to open editor dialog
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const jan15Cell = Array.from(dayCells).find(cell => cell.textContent?.trim() === '15');
      jan15Cell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Click save
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      // ErrorBanner should appear inside the dialog with the rollback
      // message (prefixed) plus the underlying error detail.
      await vi.waitFor(() => {
        const dialog = container.querySelector('.dialog');
        const alert = dialog!.querySelector('[role="alert"]');
        expect(alert).toBeTruthy();
        expect(alert!.textContent).toContain('Internal state mismatch');
        expect(alert!.textContent).toContain('network timeout');
      });

      // Dialog should remain open so user can retry
      expect(container.querySelector('.dialog')).toBeTruthy();
    });

    it('clears ErrorBanner when save is retried', async () => {
      // Suppress expected console.error from the catch block
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockBindings.RecordRoutineCompletions.mockRejectedValueOnce(new Error('network timeout'));
      await renderView();

      // Double-click Jan 15 cell to open editor dialog
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const jan15Cell = Array.from(dayCells).find(cell => cell.textContent?.trim() === '15');
      jan15Cell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // First save attempt fails
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        const dialog = container.querySelector('.dialog');
        expect(dialog!.querySelector('[role="alert"]')).toBeTruthy();
      });

      // Second save attempt succeeds — error should be cleared
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.RecordRoutineCompletions).toHaveBeenCalledTimes(2);
      });

      // After successful save, dialog closes and no error banner on page
      await vi.waitFor(() => {
        expect(container.querySelector('.dialog')).toBeNull();
      });
    });

    it('clears ErrorBanner when dismiss is clicked', async () => {
      // Suppress expected console.error from the catch block
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockBindings.RecordRoutineCompletions.mockRejectedValueOnce(new Error('server error'));
      await renderView();

      // Double-click Jan 15 cell to open editor dialog
      const dayCells = container.querySelectorAll<HTMLButtonElement>('.day-num');
      const jan15Cell = Array.from(dayCells).find(cell => cell.textContent?.trim() === '15');
      jan15Cell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
      await vi.waitFor(() => {
        if (!container.querySelector('.dialog')) throw new Error('dialog not open');
      });

      // Save fails
      const saveButton = container.querySelector<HTMLButtonElement>('.btn-primary');
      saveButton!.click();
      await tick();

      await vi.waitFor(() => {
        const dialog = container.querySelector('.dialog');
        expect(dialog!.querySelector('[role="alert"]')).toBeTruthy();
      });

      // Click dismiss button on the error banner
      const dialog = container.querySelector('.dialog');
      const dismissButton = dialog!.querySelector('[role="alert"] button');
      expect(dismissButton).toBeTruthy();
      await fireEvent.click(dismissButton!);
      await tick();

      // Error banner should be gone, dialog still open
      expect(dialog!.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('.dialog')).toBeTruthy();
    });
  });
});
