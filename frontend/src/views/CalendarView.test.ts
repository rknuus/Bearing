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

function makeMockBindings(themes = makeTestThemes(), yearFocus = makeTestYearFocus()) {
  return {
    GetThemes: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(themes))),
    GetYearFocus: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(yearFocus))),
    SaveDayFocus: vi.fn().mockResolvedValue(undefined),
    ClearDayFocus: vi.fn().mockResolvedValue(undefined),
    LoadNavigationContext: vi.fn().mockResolvedValue({
      currentView: 'calendar',
      currentItem: '',
      filterThemeId: '',
      filterDate: '',
      lastAccessed: '',
    }),
    SaveNavigationContext: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CalendarView', () => {
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
      expect(mockBindings.ClearDayFocus).toHaveBeenCalledWith('2025-01-01');
    });
  });

  it('cancels edit dialog via cancel button', async () => {
    await renderView();

    // Open dialog
    const dayCell = container.querySelector<HTMLButtonElement>('.day-num');
    dayCell!.click();
    await tick();
    expect(container.querySelector('.dialog')).toBeTruthy();

    // Click cancel
    const cancelButton = container.querySelector<HTMLButtonElement>('.btn-secondary');
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

  it('shows error state with retry button on fetch failure', async () => {
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

    const errorEl = container.querySelector('.error');
    expect(errorEl).toBeTruthy();
    expect(errorEl?.textContent).toContain('Network error');

    // Retry button should be present
    const retryButton = errorEl?.querySelector('button');
    expect(retryButton).toBeTruthy();
    expect(retryButton?.textContent).toContain('Retry');

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
});
