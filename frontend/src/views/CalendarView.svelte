<script lang="ts">
  /**
   * CalendarView Component
   *
   * Displays a yearly calendar grid (12 months x 31 days) for mid-term planning.
   * Users can assign each day to a Life Theme (showing the theme's color) and add notes.
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
  let taskCounts = $state<Map<string, number>>(new Map());
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Day editor dialog state
  let editingDay = $state<{ date: string; month: number; day: number } | null>(null);
  let editThemeId = $state('');
  let editNotes = $state('');

  // Month names
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

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

  // Reload when year changes (not on loading state changes)
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

      // Load themes, year focus, and tasks in parallel
      const [themesResult, focusResult, tasksResult] = await Promise.all([
        bindings.GetThemes(),
        bindings.GetYearFocus(year),
        bindings.GetTasks ? bindings.GetTasks() : Promise.resolve([])
      ]);

      themes = themesResult;

      // Convert array to map for easy lookup
      const focusMap = new Map<string, DayFocus>();
      for (const entry of focusResult) {
        focusMap.set(entry.date, entry);
      }
      yearFocus = focusMap;

      // Count tasks per day
      const counts = new Map<string, number>();
      for (const task of tasksResult) {
        if (task.dayDate) {
          counts.set(task.dayDate, (counts.get(task.dayDate) || 0) + 1);
        }
      }
      taskCounts = counts;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
      console.error('CalendarView: Failed to load data', e);
    } finally {
      loading = false;
    }
  }

  // Check if a date is valid (e.g., Feb 30 is invalid)
  function isValidDate(month: number, day: number): boolean {
    const date = new Date(year, month, day);
    return date.getMonth() === month && date.getDate() === day;
  }

  // Check if a date is a weekend
  function isWeekend(month: number, day: number): boolean {
    if (!isValidDate(month, day)) return false;
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  // Check if a date is today
  function isToday(month: number, day: number): boolean {
    const today = new Date();
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  }

  // Format date as YYYY-MM-DD
  function formatDate(month: number, day: number): string {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  // Get theme color for a date
  function getThemeColor(month: number, day: number): string | null {
    if (!isValidDate(month, day)) return null;
    const dateStr = formatDate(month, day);
    const focus = yearFocus.get(dateStr);
    if (!focus?.themeId) return null;
    const theme = themes.find(t => t.id === focus.themeId);
    return theme?.color ?? null;
  }

  // Get day focus for a date
  function getDayFocus(month: number, day: number): DayFocus | null {
    if (!isValidDate(month, day)) return null;
    const dateStr = formatDate(month, day);
    return yearFocus.get(dateStr) ?? null;
  }

  // Get task count for a date
  function getTaskCount(month: number, day: number): number {
    if (!isValidDate(month, day)) return 0;
    const dateStr = formatDate(month, day);
    return taskCounts.get(dateStr) ?? 0;
  }

  // Handle clicking on task count
  function handleTaskCountClick(event: MouseEvent, month: number, day: number) {
    event.stopPropagation();
    if (onNavigateToTasks) {
      const dateStr = formatDate(month, day);
      const focus = getDayFocus(month, day);
      onNavigateToTasks({ date: dateStr, themeId: focus?.themeId });
    }
  }

  // Handle clicking on theme badge in legend
  function handleThemeLegendClick(themeId: string) {
    if (onNavigateToTheme) {
      onNavigateToTheme(themeId);
    }
  }

  // Handle day click
  function handleDayClick(month: number, day: number) {
    if (!isValidDate(month, day)) return;

    const dateStr = formatDate(month, day);
    const focus = yearFocus.get(dateStr);

    editingDay = { date: dateStr, month, day };
    editThemeId = focus?.themeId ?? '';
    editNotes = focus?.notes ?? '';
  }

  // Save day focus
  async function saveDayFocus() {
    if (!editingDay) return;

    try {
      const bindings = getBindings();

      if (!editThemeId && !editNotes) {
        // Clear the entry if both are empty
        await bindings.ClearDayFocus(editingDay.date);
        yearFocus.delete(editingDay.date);
      } else {
        const dayFocus: DayFocus = {
          date: editingDay.date,
          themeId: editThemeId,
          notes: editNotes,
          text: yearFocus.get(editingDay.date)?.text ?? ''
        };
        await bindings.SaveDayFocus(dayFocus);
        yearFocus.set(editingDay.date, dayFocus);
      }

      // Force reactivity update
      yearFocus = new Map(yearFocus);
      editingDay = null;
    } catch (e) {
      console.error('CalendarView: Failed to save day focus', e);
      alert('Failed to save: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  }

  // Cancel editing
  function cancelEdit() {
    editingDay = null;
  }

  // Navigate to previous/next year
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
      <div class="calendar-grid">
        <!-- Header row (month names) -->
        <div class="header-cell day-header">Day</div>
        {#each monthNames as monthName, monthIndex}
          <div class="header-cell month-header">{monthName}</div>
        {/each}

        <!-- Day rows -->
        {#each Array(31) as _, dayIndex}
          {@const day = dayIndex + 1}
          <!-- Day number column -->
          <div class="day-number-cell">{day}</div>

          <!-- Month cells -->
          {#each Array(12) as _, monthIndex}
            {@const valid = isValidDate(monthIndex, day)}
            {@const weekend = isWeekend(monthIndex, day)}
            {@const today = isToday(monthIndex, day)}
            {@const color = getThemeColor(monthIndex, day)}
            {@const focus = getDayFocus(monthIndex, day)}
            {@const taskCount = getTaskCount(monthIndex, day)}
            {@const isFiltered = filterThemeId && focus?.themeId !== filterThemeId}

            <button
              class="day-cell"
              class:invalid={!valid}
              class:weekend={weekend}
              class:today={today}
              class:has-notes={focus?.notes}
              class:filtered={isFiltered}
              disabled={!valid}
              style={color ? `background-color: ${color}20; border-color: ${color};` : ''}
              onclick={() => handleDayClick(monthIndex, day)}
              title={focus?.notes ? `Notes: ${focus.notes}` : formatDate(monthIndex, day)}
            >
              {#if color}
                <span class="theme-dot" style="background-color: {color};"></span>
              {/if}
              {#if focus?.notes}
                <span class="note-indicator">*</span>
              {/if}
              {#if taskCount > 0}
                <span
                  class="task-count-badge"
                  role="button"
                  tabindex="0"
                  onclick={(e) => handleTaskCountClick(e, monthIndex, day)}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTaskCountClick(e as unknown as MouseEvent, monthIndex, day); } }}
                  title="{taskCount} task{taskCount !== 1 ? 's' : ''} - click to view"
                >
                  {taskCount}
                </span>
              {/if}
            </button>
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
          {monthNames[editingDay.month]} {editingDay.day}, {year}
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
          <label for="notes-input">Notes</label>
          <textarea
            id="notes-input"
            bind:value={editNotes}
            rows="3"
            placeholder="Add notes for this day..."
          ></textarea>
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
    grid-template-columns: 40px repeat(12, 1fr);
    gap: 1px;
    background: #e5e7eb;
    font-size: 0.75rem;
    min-width: fit-content;
  }

  /* Header cells */
  .header-cell {
    background: #f3f4f6;
    padding: 0.5rem 0.25rem;
    text-align: center;
    font-weight: 600;
    color: #374151;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .day-header {
    position: sticky;
    left: 0;
    z-index: 20;
  }

  /* Day number column */
  .day-number-cell {
    background: #f9fafb;
    padding: 0.25rem;
    text-align: center;
    font-weight: 500;
    color: #6b7280;
    position: sticky;
    left: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Day cells */
  .day-cell {
    min-width: 24px;
    min-height: 24px;
    aspect-ratio: 1;
    background: white;
    border: 1px solid transparent;
    padding: 2px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .day-cell:hover:not(.invalid) {
    background: #f3f4f6;
    border-color: #2563eb;
  }

  .day-cell:focus:not(.invalid) {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
  }

  .day-cell.invalid {
    background: #f9fafb;
    cursor: default;
  }

  .day-cell.weekend:not(.invalid) {
    background: #f3f4f6;
  }

  .day-cell.today {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
    font-weight: bold;
  }

  .theme-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .note-indicator {
    position: absolute;
    top: 1px;
    right: 2px;
    font-size: 0.625rem;
    color: #6b7280;
    font-weight: bold;
  }

  .task-count-badge {
    position: absolute;
    bottom: 1px;
    right: 1px;
    font-size: 0.5rem;
    background-color: #2563eb;
    color: white;
    padding: 0 3px;
    border-radius: 3px;
    min-width: 12px;
    text-align: center;
    line-height: 1.2;
    border: none;
    cursor: pointer;
  }

  .task-count-badge:hover {
    background-color: #1d4ed8;
  }

  .day-cell.filtered {
    opacity: 0.3;
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
  .form-group textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
  }

  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 60px;
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
