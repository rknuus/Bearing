<script lang="ts">
  /**
   * CalendarView Component
   *
   * Displays a weekday-aligned yearly calendar for mid-term planning.
   * Rows are weekdays (Mon–Sun), columns are 12 months × 3 (day number + text + week number).
   * Users can assign each day to a Life Theme and enter free text.
   */

  import { onMount } from 'svelte';
  import { mockAppBindings, type LifeTheme, type DayFocus } from '../lib/wails-mock';

  // Props
  interface Props {
    year?: number;
    onNavigateToTheme?: (themeId: string) => void;
    onNavigateToTasks?: (options?: { themeId?: string; date?: string }) => void;
    filterThemeId?: string;
  }

  let { year = new Date().getFullYear(), onNavigateToTheme, onNavigateToTasks, filterThemeId }: Props = $props();

  // State
  let themes = $state<LifeTheme[]>([]);
  let yearFocus = $state<Map<string, DayFocus>>(new Map());
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Day editor dialog state
  let editingDay = $state<{ date: string; month: number; day: number } | null>(null);
  let editThemeId = $state('');
  let editText = $state('');

  // Full month names for headers and dialog
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Get the Wails bindings (with mock fallback for browser testing)
  function getBindings() {
    return window.go?.main?.App ?? mockAppBindings;
  }

  // Track previous year to detect changes
  let previousYear = $state(year);

  // Load data on mount
  onMount(async () => {
    await loadData();
  });

  // Reload when year changes
  $effect(() => {
    if (year !== previousYear) {
      previousYear = year;
      loadData();
    }
  });

  async function loadData() {
    loading = true;
    error = null;

    try {
      const bindings = getBindings();

      const [themesResult, focusResult] = await Promise.all([
        bindings.GetThemes(),
        bindings.GetYearFocus(year),
      ]);

      themes = themesResult;

      const focusMap = new Map<string, DayFocus>();
      for (const entry of focusResult) {
        focusMap.set(entry.date, entry);
      }
      yearFocus = focusMap;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
      console.error('CalendarView: Failed to load data', e);
    } finally {
      loading = false;
    }
  }

  // --- Date computation helpers ---

  // Returns 0-6 (Mon=0, Tue=1, ..., Sun=6) for the 1st of the given month
  function getMonthStartWeekday(y: number, month: number): number {
    const jsDay = new Date(y, month, 1).getDay(); // 0=Sun, 1=Mon, ...
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  function getDaysInMonth(y: number, month: number): number {
    return new Date(y, month + 1, 0).getDate();
  }

  // Max calendar weeks any month spans in the given year
  function getMaxWeeks(y: number): number {
    let max = 0;
    for (let m = 0; m < 12; m++) {
      const start = getMonthStartWeekday(y, m);
      const days = getDaysInMonth(y, m);
      const weeks = Math.ceil((start + days) / 7);
      if (weeks > max) max = weeks;
    }
    return max;
  }

  // Grid row for a given day (0-indexed)
  function getDayRow(y: number, month: number, day: number): number {
    return getMonthStartWeekday(y, month) + day - 1;
  }

  function isSunday(row: number): boolean {
    return row % 7 === 6;
  }

  function isToday(month: number, day: number): boolean {
    const today = new Date();
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  }

  const shortMonthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  function formatDate(month: number, day: number): string {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  function displayDate(month: number, day: number): string {
    const d = String(day).padStart(2, '0');
    return `${d}-${shortMonthNames[month]}-${year}`;
  }

  // ISO week number (ISO 8601)
  function getISOWeekNumber(y: number, month: number, day: number): number {
    const date = new Date(y, month, day);
    const dayOfWeek = date.getDay() || 7; // Mon=1 ... Sun=7
    date.setDate(date.getDate() + 4 - dayOfWeek); // nearest Thursday
    const yearStart = new Date(date.getFullYear(), 0, 1);
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  function getThemeColor(month: number, day: number): string | null {
    const dateStr = formatDate(month, day);
    const focus = yearFocus.get(dateStr);
    if (!focus?.themeId) return null;
    const theme = themes.find(t => t.id === focus.themeId);
    return theme?.color ?? null;
  }

  function getDayText(month: number, day: number): string {
    const dateStr = formatDate(month, day);
    return yearFocus.get(dateStr)?.text ?? '';
  }

  // Derived: total rows and grid data
  let maxWeeks = $derived(getMaxWeeks(year));
  let totalRows = $derived(maxWeeks * 7);

  // Build grid cells for each month
  interface CellData {
    month: number;
    day: number;
    row: number; // 0-indexed grid row (excluding header)
    color: string | null;
    text: string;
    today: boolean;
    sunday: boolean;
    monday: boolean;
    weekNumber: number;
  }

  let gridCells = $derived.by(() => {
    const cells: CellData[] = [];
    for (let m = 0; m < 12; m++) {
      const days = getDaysInMonth(year, m);
      for (let d = 1; d <= days; d++) {
        const row = getDayRow(year, m, d);
        cells.push({
          month: m,
          day: d,
          row,
          color: getThemeColor(m, d),
          text: getDayText(m, d),
          today: isToday(m, d),
          sunday: isSunday(row),
          monday: row % 7 === 0,
          weekNumber: getISOWeekNumber(year, m, d),
        });
      }
    }
    return cells;
  });

  // Group cells by month for rendering
  let cellsByMonth = $derived.by(() => {
    const byMonth: CellData[][] = Array.from({ length: 12 }, () => []);
    for (const cell of gridCells) {
      byMonth[cell.month].push(cell);
    }
    return byMonth;
  });

  // --- Interaction handlers ---

  function handleThemeLegendClick(themeId: string) {
    if (onNavigateToTheme) {
      onNavigateToTheme(themeId);
    }
  }

  function handleDayClick(month: number, day: number) {
    const dateStr = formatDate(month, day);
    const focus = yearFocus.get(dateStr);

    editingDay = { date: dateStr, month, day };
    editThemeId = focus?.themeId ?? '';
    editText = focus?.text ?? '';
  }

  async function saveDayFocus() {
    if (!editingDay) return;

    try {
      const bindings = getBindings();

      if (!editThemeId && !editText) {
        await bindings.ClearDayFocus(editingDay.date);
        yearFocus.delete(editingDay.date);
      } else {
        const existing = yearFocus.get(editingDay.date);
        const dayFocus: DayFocus = {
          date: editingDay.date,
          themeId: editThemeId,
          notes: existing?.notes ?? '',
          text: editText
        };
        await bindings.SaveDayFocus(dayFocus);
        yearFocus.set(editingDay.date, dayFocus);
      }

      yearFocus = new Map(yearFocus);
      editingDay = null;
    } catch (e) {
      console.error('CalendarView: Failed to save day focus', e);
      alert('Failed to save: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  }

  function cancelEdit() {
    editingDay = null;
  }

  function prevYear() {
    year = year - 1;
  }

  function nextYear() {
    year = year + 1;
  }

  function goToCurrentYear() {
    year = new Date().getFullYear();
  }
</script>

<div class="calendar-view">
  <!-- Header -->
  <div class="calendar-header">
    <button class="nav-button" onclick={prevYear} aria-label="Previous year">
      &lt;
    </button>
    <h1 class="year-title">{year}</h1>
    <button class="nav-button" onclick={nextYear} aria-label="Next year">
      &gt;
    </button>
    <button class="today-button" onclick={goToCurrentYear}>
      Today
    </button>
  </div>

  {#if loading}
    <div class="loading">Loading calendar...</div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={loadData}>Retry</button>
    </div>
  {:else}
    <!-- Calendar Grid -->
    <div class="calendar-container">
      <div
        class="calendar-grid"
        style="grid-template-rows: auto repeat({totalRows}, 1.5rem);"
      >
        <!-- Header row: weekday label corner + month names spanning 3 cols each -->
        <div class="header-cell weekday-header"></div>
        {#each monthNames as name}
          <div class="header-cell month-header">{name}</div>
        {/each}

        <!-- Weekday labels (left column) -->
        {#each Array(totalRows) as _, rowIdx}
          <div
            class="weekday-label"
            class:sunday-bg={rowIdx % 7 === 6}
            style="grid-row: {rowIdx + 2}; grid-column: 1;"
          >
            {weekdayNames[rowIdx % 7]}
          </div>
        {/each}

        <!-- Day cells for each month -->
        {#each cellsByMonth as monthCells, monthIdx}
          {#each monthCells as cell}
            {@const numCol = 2 + monthIdx * 3}
            {@const textCol = 3 + monthIdx * 3}
            {@const weekCol = 4 + monthIdx * 3}
            {@const gridRow = cell.row + 2}
            {@const cellBg = cell.color ? `background-color: ${cell.color}20;` : (cell.sunday ? 'background-color: #eef2ff;' : '')}

            <!-- Day number cell -->
            <button
              class="day-num"
              class:today={cell.today}
              style="grid-row: {gridRow}; grid-column: {numCol}; {cellBg}"
              onclick={() => handleDayClick(cell.month, cell.day)}
              title={displayDate(cell.month, cell.day)}
            >
              {cell.day}
            </button>

            <!-- Text cell -->
            <button
              class="day-text"
              class:today={cell.today}
              style="grid-row: {gridRow}; grid-column: {textCol}; {cellBg}"
              onclick={() => handleDayClick(cell.month, cell.day)}
              title={cell.text || displayDate(cell.month, cell.day)}
            >
              {cell.text}
            </button>

            <!-- Week number cell (Monday rows only) -->
            {#if cell.monday}
              <div
                class="week-num"
                style="grid-row: {gridRow}; grid-column: {weekCol};"
              >
                {cell.weekNumber}
              </div>
            {/if}
          {/each}
        {/each}
      </div>
    </div>

    <!-- Theme Legend -->
    <div class="theme-legend">
      <span class="legend-label">Themes:</span>
      {#each themes as theme}
        <button
          class="legend-item"
          class:active={filterThemeId === theme.id}
          onclick={() => handleThemeLegendClick(theme.id)}
          title="Click to view theme"
        >
          <span class="legend-color" style="background-color: {theme.color};"></span>
          <span class="legend-name">{theme.name}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Day Editor Dialog -->
  {#if editingDay}
    <div
      class="dialog-overlay"
      role="presentation"
      onclick={cancelEdit}
      onkeydown={(e) => e.key === 'Escape' && cancelEdit()}
    >
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title" class="dialog-title">
          {displayDate(editingDay.month, editingDay.day)}
        </h2>

        <div class="form-group">
          <label for="theme-select">Theme</label>
          <select id="theme-select" bind:value={editThemeId}>
            <option value="">No theme</option>
            {#each themes as theme}
              <option value={theme.id}>{theme.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="text-input">Text</label>
          <input
            id="text-input"
            type="text"
            bind:value={editText}
            placeholder="Add text for this day..."
          />
        </div>

        <div class="dialog-actions">
          <button class="btn-secondary" onclick={cancelEdit}>Cancel</button>
          <button class="btn-primary" onclick={saveDayFocus}>Save</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .calendar-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    overflow: hidden;
  }

  /* Header */
  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .year-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    min-width: 80px;
    text-align: center;
  }

  .nav-button {
    padding: 0.5rem 1rem;
    background: #e5e7eb;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .nav-button:hover {
    background: #d1d5db;
  }

  .today-button {
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .today-button:hover {
    background: #1d4ed8;
  }

  /* Loading / Error states */
  .loading,
  .error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #6b7280;
  }

  .error {
    color: #dc2626;
  }

  .error button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  /* Calendar Container */
  .calendar-container {
    flex: 1;
    overflow: auto;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* Calendar Grid */
  .calendar-grid {
    display: grid;
    grid-template-columns: 50px repeat(12, 24px 1fr 24px);
    gap: 1px;
    background: #e5e7eb;
    font-size: 0.7rem;
    min-width: fit-content;
  }

  /* Header cells */
  .header-cell {
    background: #f3f4f6;
    padding: 0.375rem 0.25rem;
    text-align: center;
    font-weight: 600;
    color: #374151;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .weekday-header {
    position: sticky;
    left: 0;
    z-index: 20;
  }

  .month-header {
    grid-column: span 3;
  }

  /* Weekday label column */
  .weekday-label {
    background: #f9fafb;
    padding: 0 4px;
    font-weight: 500;
    color: #6b7280;
    position: sticky;
    left: 0;
    z-index: 5;
    display: flex;
    align-items: center;
  }

  /* Sunday background */
  .sunday-bg {
    background-color: #eef2ff;
  }

  /* Day number cells */
  .day-num {
    padding: 0 4px;
    text-align: right;
    font-size: 0.7rem;
    color: #6b7280;
    background: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    transition: background-color 0.1s;
  }

  /* Week number cells */
  .week-num {
    padding: 0 4px;
    font-size: 0.65rem;
    color: #9ca3af;
    background: #f9fafb;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .day-num:hover {
    background-color: #f3f4f6;
  }

  .day-num.today {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
    font-weight: bold;
    color: #1f2937;
  }

  /* Text cells */
  .day-text {
    padding: 0 4px;
    font-size: 0.7rem;
    color: #374151;
    background: white;
    border: none;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    display: flex;
    align-items: center;
    transition: background-color 0.1s;
  }

  .day-text:hover {
    background-color: #f3f4f6;
  }

  .day-text.today {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
  }

  /* Theme Legend */
  .theme-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 0;
    margin-top: 0.5rem;
    flex-shrink: 0;
  }

  .legend-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .legend-item:hover {
    background-color: #f3f4f6;
    border-color: #e5e7eb;
  }

  .legend-item.active {
    background-color: #eff6ff;
    border-color: #3b82f6;
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-name {
    font-size: 0.75rem;
    color: #4b5563;
  }

  /* Dialog Overlay */
  .dialog-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .dialog-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.375rem;
  }

  .form-group select,
  .form-group input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
  }

  .form-group select:focus,
  .form-group input[type="text"]:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  .btn-secondary {
    padding: 0.5rem 1rem;
    background: #e5e7eb;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-secondary:hover {
    background: #d1d5db;
  }

  .btn-primary {
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }
</style>
