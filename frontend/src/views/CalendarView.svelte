<script lang="ts">
  /**
   * CalendarView Component
   *
   * Displays a day-of-month-aligned yearly calendar for mid-term planning.
   * Rows are days 1–31, columns are 12 months × 3 (day number + weekday + text).
   * Users can assign each day to a Life Theme and enter free text.
   */

  import { SvelteMap } from 'svelte/reactivity';
  import { type LifeTheme, type DayFocus } from '../lib/wails-mock';
  import { Dialog, Button, ErrorBanner, TagEditor, ThemeOKRTree } from '../lib/components';
  import { getBindings, extractError } from '../lib/utils/bindings';
  import { checkStateFromData } from '../lib/utils/state-check';
  import { formatDate as formatDateLocale, formatMonthName, formatWeekdayShort } from '../lib/utils/date-format';

  // Props
  interface Props {
    year?: number;
    onNavigateToTheme?: (themeId: string) => void;
    onNavigateToTasks?: (options?: { themeId?: string; date?: string }) => void;
    filterThemeIds?: string[];
  }

  let { year = new Date().getFullYear(), onNavigateToTheme, onNavigateToTasks: _onNavigateToTasks, filterThemeIds = [] }: Props = $props();

  // State
  let themes = $state<LifeTheme[]>([]);
  let yearFocus = new SvelteMap<string, DayFocus>();
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Day editor dialog state
  let editingDay = $state<{ date: string; month: number; day: number } | null>(null);
  let editThemeIds = $state<string[]>([]);
  let editText = $state('');
  let editOkrIds = $state<string[]>([]);
  let editTags = $state<string[]>([]);
  let prevDerivedText = $state('');
  let availableTags = $state<string[]>([]);
  let tagSectionOpen = $state(false);
  let editSelectExpandedIds = $state<string[]>([]);

  // Selection state
  let selectedCells = $state<Array<{month: number; day: number}>>([]);
  let anchorCell = $state<{month: number; day: number} | null>(null);

  // Clipboard (persists across year navigation)
  interface ClipboardEntry { themeIds?: string[]; text: string; okrIds?: string[]; tags?: string[] }
  let clipboard = $state<ClipboardEntry[]>([]);

  // Full month names for headers and dialog
  const monthNames = Array.from({ length: 12 }, (_, i) => formatMonthName(i));


  // Load data on mount and reload when year changes
  $effect(() => {
    loadData();
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

      yearFocus.clear();
      for (const entry of focusResult) {
        yearFocus.set(entry.date, entry);
      }
    } catch (e) {
      error = extractError(e);
      console.error('CalendarView: Failed to load data', e);
    } finally {
      loading = false;
    }
  }

  // --- Date computation helpers ---

  function getDaysInMonth(y: number, month: number): number {
    return new Date(y, month + 1, 0).getDate();
  }

  function isSundayDate(y: number, month: number, day: number): boolean {
    return new Date(y, month, day).getDay() === 0;
  }

  function getWeekdayName(y: number, month: number, day: number): string {
    const jsDay = new Date(y, month, day).getDay();
    return formatWeekdayShort((jsDay + 6) % 7);
  }

  function isToday(month: number, day: number): boolean {
    const today = new Date();
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  }

  function formatDate(month: number, day: number): string {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  function displayDate(month: number, day: number): string {
    return formatDateLocale(formatDate(month, day));
  }

  function getThemeColors(month: number, day: number): string[] {
    const dateStr = formatDate(month, day);
    const focus = yearFocus.get(dateStr);
    if (!focus?.themeIds || focus.themeIds.length === 0) return [];
    const colors: string[] = [];
    for (const tid of focus.themeIds) {
      const theme = themes.find(t => t.id === tid);
      if (theme) colors.push(theme.color);
    }
    return colors;
  }

  /** Convert hex color to rgba with given alpha. */
  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Return 'white' or 'black' for best contrast against the given hex color. */
  function textColorForBg(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return luminance > 0.179 ? 'black' : 'white';
  }

  /** Convert an array of theme colors to a CSS background value. */
  function themeColorsToBackground(colors: string[]): string {
    if (colors.length === 0) return '';
    if (colors.length === 1) return hexToRgba(colors[0], 1);
    const stops = colors.map((c, i) => `${hexToRgba(c, 1)} ${(i * 100) / (colors.length - 1)}%`);
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }

  function getDayText(month: number, day: number): string {
    const dateStr = formatDate(month, day);
    return yearFocus.get(dateStr)?.text ?? '';
  }

  // Build grid cells for each month
  interface CellData {
    month: number;
    day: number;
    row: number; // 0-indexed grid row (day - 1)
    colors: string[];
    text: string;
    today: boolean;
    sunday: boolean;
    weekdayName: string;
  }

  let gridCells = $derived.by(() => {
    const cells: CellData[] = [];
    for (let m = 0; m < 12; m++) {
      const days = getDaysInMonth(year, m);
      for (let d = 1; d <= days; d++) {
        cells.push({
          month: m,
          day: d,
          row: d - 1,
          colors: getThemeColors(m, d),
          text: getDayText(m, d),
          today: isToday(m, d),
          sunday: isSundayDate(year, m, d),
          weekdayName: getWeekdayName(year, m, d),
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

  async function handleDayClick(month: number, day: number) {
    const dateStr = formatDate(month, day);
    const focus = yearFocus.get(dateStr);

    editThemeIds = focus?.themeIds ? [...focus.themeIds] : [];
    editText = focus?.text ?? '';
    editOkrIds = focus?.okrIds ? [...focus.okrIds] : [];
    editTags = focus?.tags ? [...focus.tags] : [];
    prevDerivedText = editTags.join(', ');
    tagSectionOpen = (focus?.tags?.length ?? 0) > 0;

    // Restore fold state if this is the same day as last edited
    try {
      const ctx = await getBindings().LoadNavigationContext();
      if (ctx?.calendarDayEditorDate === dateStr && ctx.calendarDayEditorExpandedIds) {
        editSelectExpandedIds = [...ctx.calendarDayEditorExpandedIds];
      } else {
        editSelectExpandedIds = [];
      }
    } catch {
      editSelectExpandedIds = [];
    }

    // Set editingDay last so the dialog renders with correct fold state
    editingDay = { date: dateStr, month, day };

    // Fetch available tags from tasks
    try {
      const tasks = await getBindings().GetTasks();
      availableTags = [...new Set(tasks.flatMap(t => t.tags ?? []))].sort();
    } catch {
      availableTags = [];
    }
  }


  const DAY_FOCUS_FIELDS = ['date', 'themeIds', 'notes', 'text', 'okrIds', 'tags'];

  async function verifyCalendarState() {
    const byDate = (a: DayFocus, b: DayFocus) => a.date.localeCompare(b.date);
    const frontend = [...yearFocus.values()].sort(byDate);
    const backend = (await getBindings().GetYearFocus(year)).sort(byDate);
    const mismatches = checkStateFromData('dayFocus', frontend, backend, 'date', DAY_FOCUS_FIELDS);
    if (mismatches.length > 0) {
      error = 'Internal state mismatch detected, please reload';
      getBindings().LogFrontend('error', mismatches.join('; '), 'state-check');
    }
  }

  async function saveDayFocus() {
    if (!editingDay) return;

    try {
      const bindings = getBindings();
      const dateForCtx = editingDay.date;

      const existing = yearFocus.get(editingDay.date);
      const dayFocus: DayFocus = {
        date: editingDay.date,
        themeIds: editThemeIds.length > 0 ? editThemeIds : undefined,
        notes: existing?.notes ?? '',
        text: editText,
        okrIds: editOkrIds.length > 0 ? editOkrIds : undefined,
        tags: editTags.length > 0 ? editTags : undefined,
      };
      await bindings.SaveDayFocus(dayFocus);
      yearFocus.set(editingDay.date, dayFocus);

      await verifyCalendarState();

      // Persist fold state
      bindings.LoadNavigationContext().then((ctx) => {
        if (ctx) {
          bindings.SaveNavigationContext({
            ...ctx,
            calendarDayEditorDate: dateForCtx,
            calendarDayEditorExpandedIds: editSelectExpandedIds,
          });
        }
      }).catch(() => { /* ignore */ });

      editingDay = null;
    } catch (e) {
      console.error('CalendarView: Failed to save day focus', e);
      alert('Failed to save: ' + extractError(e));
    }
  }

  function cancelEdit() {
    if (editingDay) {
      const dateForCtx = editingDay.date;
      getBindings().LoadNavigationContext().then((ctx) => {
        if (ctx) {
          getBindings().SaveNavigationContext({
            ...ctx,
            calendarDayEditorDate: dateForCtx,
            calendarDayEditorExpandedIds: editSelectExpandedIds,
          });
        }
      }).catch(() => { /* ignore */ });
    }
    editingDay = null;
  }

  // --- Selection helpers ---

  function isCellSelected(month: number, day: number): boolean {
    return selectedCells.some(c => c.month === month && c.day === day);
  }

  function handleTextCellClick(month: number, day: number, event: MouseEvent) {
    if (event.shiftKey && anchorCell && anchorCell.month === month) {
      const minDay = Math.min(anchorCell.day, day);
      const maxDay = Math.max(anchorCell.day, day);
      selectedCells = Array.from({length: maxDay - minDay + 1}, (_, i) => ({month, day: minDay + i}));
    } else {
      selectedCells = [{month, day}];
      anchorCell = {month, day};
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Don't handle shortcuts when edit dialog is open
    if (editingDay) return;

    const mod = event.metaKey || event.ctrlKey;

    if (event.key === 'Escape') {
      selectedCells = [];
      anchorCell = null;
      return;
    }

    if (mod && event.key === 'c') {
      handleCopy();
      event.preventDefault();
      return;
    }

    if (mod && event.key === 'v') {
      handlePaste();
      event.preventDefault();
      return;
    }
  }

  function handleCopy() {
    if (selectedCells.length === 0) return;
    const sorted = [...selectedCells].sort((a, b) => a.day - b.day);
    clipboard = sorted.map(c => {
      const focus = yearFocus.get(formatDate(c.month, c.day));
      return {
        themeIds: focus?.themeIds ? [...focus.themeIds] : undefined,
        text: focus?.text ?? '',
        okrIds: focus?.okrIds ? [...focus.okrIds] : undefined,
        tags: focus?.tags ? [...focus.tags] : undefined,
      };
    });
  }

  async function handlePaste() {
    if (clipboard.length === 0 || selectedCells.length === 0) return;

    const sorted = [...selectedCells].sort((a, b) => a.day - b.day);
    const startMonth = sorted[0].month;
    const startDay = sorted[0].day;
    const maxDay = getDaysInMonth(year, startMonth);
    const bindings = getBindings();

    try {
      for (let i = 0; i < clipboard.length; i++) {
        const targetDay = startDay + i;
        if (targetDay > maxDay) break;

        const dateStr = formatDate(startMonth, targetDay);
        const existing = yearFocus.get(dateStr);
        const entry = clipboard[i];

        const dayFocus: DayFocus = {
          date: dateStr,
          themeIds: entry.themeIds,
          notes: existing?.notes ?? '',
          text: entry.text,
          okrIds: entry.okrIds,
          tags: entry.tags,
        };

        await bindings.SaveDayFocus(dayFocus);
        yearFocus.set(dateStr, dayFocus);
      }

      await verifyCalendarState();
    } catch (e) {
      error = 'Failed to paste: ' + extractError(e);
    }
  }

  function handleViewClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.calendar-grid')) {
      selectedCells = [];
      anchorCell = null;
    }
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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="calendar-view" onkeydown={handleKeyDown} onclick={handleViewClick} tabindex="-1" role="application">
  <!-- Header -->
  <div class="calendar-header">
    <button class="nav-button" onclick={prevYear} aria-label="Previous year">
      ⬅️
    </button>
    <h1 class="year-title">{year}</h1>
    <button class="nav-button" onclick={nextYear} aria-label="Next year">
      ➡️
    </button>
    <button class="today-button" onclick={goToCurrentYear}>
      Today
    </button>
  </div>

  {#if error}
    <ErrorBanner message={error} ondismiss={() => error = null} />
  {/if}

  {#if loading}
    <div class="loading">Loading calendar...</div>
  {:else}
    <!-- Calendar Grid -->
    <div class="calendar-container">
      <div
        class="calendar-grid"
        style="grid-template-rows: auto repeat(31, 1.5rem);"
      >
        <!-- Header row: month names spanning 3 cols each -->
        {#each monthNames as name (name)}
          <div class="header-cell month-header">{name}</div>
        {/each}

        <!-- Day cells for each month -->
        {#each cellsByMonth as monthCells, monthIdx (monthIdx)}
          {#each monthCells as cell (cell.day + '-' + monthIdx)}
            {@const wdayCol = 1 + monthIdx * 3}
            {@const numCol = 2 + monthIdx * 3}
            {@const textCol = 3 + monthIdx * 3}
            {@const gridRow = cell.row + 2}
            {@const bgValue = themeColorsToBackground(cell.colors)}
            {@const textBg = bgValue ? (bgValue.startsWith('linear-gradient') ? `background: ${bgValue};` : `background-color: ${bgValue};`) : ''}
            {@const textColor = cell.colors.length > 0 ? `color: ${textColorForBg(cell.colors[0])};` : ''}
            {@const sundayBg = cell.sunday ? 'background-color: #eef2ff;' : ''}

            <!-- Weekday abbreviation cell -->
            <div
              class="day-weekday"
              class:today={cell.today}
              style="grid-row: {gridRow}; grid-column: {wdayCol}; {cell.today ? '' : sundayBg}"
            >
              {cell.weekdayName}
            </div>

            <!-- Day number cell -->
            <button
              class="day-num"
              class:today={cell.today}
              style="grid-row: {gridRow}; grid-column: {numCol}; {cell.today ? '' : sundayBg}"
              ondblclick={() => handleDayClick(cell.month, cell.day)}
              title={displayDate(cell.month, cell.day)}
            >
              {cell.day}
            </button>

            <!-- Text cell -->
            <button
              class="day-text"
              class:selected={isCellSelected(cell.month, cell.day)}
              style="grid-row: {gridRow}; grid-column: {textCol}; {textBg || sundayBg} {textColor}"
              onclick={(e: MouseEvent) => handleTextCellClick(cell.month, cell.day, e)}
              ondblclick={() => handleDayClick(cell.month, cell.day)}
              title={cell.text || displayDate(cell.month, cell.day)}
            >
              {cell.text}
            </button>
          {/each}
        {/each}
      </div>
    </div>

    <!-- Theme Legend -->
    <div class="theme-legend">
      <span class="legend-label">Themes:</span>
      {#each themes as theme (theme.id)}
        <button
          class="legend-item"
          class:active={filterThemeIds.includes(theme.id)}
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
    <Dialog title={displayDate(editingDay.month, editingDay.day)} id="dialog-title" onclose={cancelEdit}>
      <div class="form-group">
        <span class="form-label">Theme & OKR References</span>
        <ThemeOKRTree
          {themes}
          mode="select"
          selectedThemeIds={editThemeIds}
          selectedOkrIds={editOkrIds}
          initialSelectExpandedIds={editSelectExpandedIds}
          onThemeSelectionChange={(ids) => {
            editThemeIds = ids;
          }}
          onOkrSelectionChange={(ids) => { editOkrIds = ids; }}
          onSelectExpandedIdsChange={(ids) => { editSelectExpandedIds = ids; }}
        />
      </div>

      <div class="form-group">
        <button
          class="collapsible-header"
          onclick={() => tagSectionOpen = !tagSectionOpen}
          aria-expanded={tagSectionOpen}
        >
          <span class="expand-icon">{tagSectionOpen ? '\u25BC' : '\u25B6'}</span>
          <span class="form-label">Tags</span>
        </button>
        {#if tagSectionOpen}
          <TagEditor
            tags={editTags}
            {availableTags}
            onTagsChange={(newTags) => {
              const newDerived = newTags.join(', ');
              if (editText === prevDerivedText || editText === '') {
                editText = newDerived;
              }
              prevDerivedText = newDerived;
              editTags = newTags;
            }}
          />
        {/if}
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

      {#snippet actions()}
        <Button variant="secondary" onclick={cancelEdit}>Cancel</Button>
        <Button variant="primary" onclick={saveDayFocus}>Save</Button>
      {/snippet}
    </Dialog>
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
    color: var(--color-gray-800);
    min-width: 80px;
    text-align: center;
  }

  .nav-button {
    padding: 0.5rem 1rem;
    background: var(--color-gray-200);
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .nav-button:hover {
    background: var(--color-gray-300);
  }

  .today-button {
    padding: 0.5rem 1rem;
    background: var(--color-primary-600);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .today-button:hover {
    background: var(--color-primary-700);
  }

  /* Loading state */
  .loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--color-gray-500);
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
    grid-template-columns: repeat(12, 24px 24px 1fr);
    gap: 1px;
    background: var(--color-gray-200);
    font-size: 0.7rem;
    min-width: fit-content;
  }

  /* Header cells */
  .header-cell {
    background: var(--color-gray-100);
    padding: 0.375rem 0.25rem;
    text-align: center;
    font-weight: 600;
    color: var(--color-gray-700);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .month-header {
    grid-column: span 3;
  }

  /* Day number cells */
  .day-num {
    padding: 0 4px;
    text-align: right;
    font-size: 0.7rem;
    color: var(--color-gray-500);
    background-color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    transition: background-color 0.1s;
  }

  /* Weekday abbreviation cells */
  .day-weekday {
    padding: 0 2px;
    font-size: 0.65rem;
    color: var(--color-gray-400);
    background-color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .day-num:hover {
    background-color: var(--color-gray-100);
  }

  .day-num.today {
    background-color: var(--color-primary-600);
    color: white;
    font-weight: bold;
  }

  .day-num.today:hover {
    background-color: var(--color-primary-700);
  }

  .day-weekday.today {
    background-color: var(--color-primary-600);
    color: white;
    font-weight: bold;
  }

  /* Text cells */
  .day-text {
    padding: 0 4px;
    font-size: 0.7rem;
    color: var(--color-gray-700);
    background-color: white;
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
    background-color: var(--color-gray-100);
  }

  .day-text.selected {
    outline: 2px solid var(--color-primary-600);
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
    color: var(--color-gray-500);
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
    background-color: var(--color-gray-100);
    border-color: var(--color-gray-200);
  }

  .legend-item.active {
    background-color: var(--color-primary-50);
    border-color: var(--color-primary-500);
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-name {
    font-size: 0.75rem;
    color: var(--color-gray-600);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label,
  .form-group .form-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
    margin-bottom: 0.375rem;
  }

  .form-group input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
  }

  .form-group input[type="text"]:focus {
    outline: none;
    border-color: var(--color-primary-600);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }

  /* Collapsible Sections */
  .collapsible-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0;
    margin-bottom: 0.375rem;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
  }

  .collapsible-header .expand-icon {
    font-size: 0.625rem;
    color: var(--color-gray-500);
  }

  .collapsible-header .form-label {
    margin-bottom: 0;
  }


</style>
