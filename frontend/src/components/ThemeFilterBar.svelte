<script lang="ts">
  /**
   * ThemeFilterBar Component
   *
   * Renders a horizontal row of theme pills for filtering tasks.
   * "All" pill is active when no themes are selected.
   * Active pills show full theme color; inactive pills show outlined style.
   */

  import type { LifeTheme } from '../lib/wails-mock';

  interface Props {
    themes: LifeTheme[];
    activeThemeIds: string[];
    onToggle: (themeId: string) => void;
    onClear: () => void;
    counts?: Record<string, number>;
    todayFocusThemeId?: string | null;
    todayFocusActive?: boolean;
    onTodayFocusToggle?: () => void;
  }

  let { themes, activeThemeIds, onToggle, onClear, counts, todayFocusThemeId, todayFocusActive = false, onTodayFocusToggle }: Props = $props();

  const allActive = $derived(activeThemeIds.length === 0);
  const todayFocusDisabled = $derived(!todayFocusThemeId);
</script>

<div class="theme-filter-bar">
  <span class="filter-label">Filter by theme:</span>
  {#if onTodayFocusToggle !== undefined}
    <button
      class="today-focus-pill"
      class:active={todayFocusActive && !todayFocusDisabled}
      disabled={todayFocusDisabled}
      onclick={onTodayFocusToggle}
      type="button"
      title={todayFocusDisabled ? 'No focus set for today' : "Today's Focus"}
    >
      Today's Focus
    </button>
  {/if}
  <button
    class="filter-pill all-pill"
    class:active={allActive}
    class:pills-locked={todayFocusActive}
    onclick={onClear}
    type="button"
  >
    All
    {#if counts}<span class="count-badge">{counts['__all__'] ?? 0}</span>{/if}
  </button>
  {#each themes as theme (theme.id)}
    {@const isActive = activeThemeIds.includes(theme.id)}
    <button
      class="filter-pill theme-pill"
      class:active={isActive}
      class:pills-locked={todayFocusActive}
      style="
        --pill-color: {theme.color};
        {isActive
          ? `background-color: ${theme.color}; color: white; border-color: ${theme.color};`
          : `background-color: transparent; color: var(--color-gray-600); border-color: ${theme.color};`}
      "
      onclick={() => onToggle(theme.id)}
      type="button"
      title={theme.name}
    >
      {theme.name}
      {#if counts}<span class="count-badge" style={isActive ? `background-color: white; color: ${theme.color};` : `background-color: ${theme.color};`}>{counts[theme.id] ?? 0}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .theme-filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: 8px 0 var(--space-2) 0;
  }

  .filter-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-gray-600);
    white-space: nowrap;
  }

  .filter-pill {
    position: relative;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border: 1.5px solid var(--color-gray-300);
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .count-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
    color: white;
    background-color: var(--color-gray-500);
    pointer-events: none;
  }

  .all-pill .count-badge {
    background-color: var(--color-gray-500);
  }

  .all-pill.active .count-badge {
    background-color: white;
    color: var(--color-gray-700);
  }

  .all-pill {
    background-color: transparent;
    color: var(--color-gray-600);
    border-color: var(--color-gray-300);
  }

  .all-pill:hover {
    background-color: var(--color-gray-100);
  }

  .all-pill.active {
    background-color: var(--color-gray-700);
    color: white;
    border-color: var(--color-gray-700);
  }

  .theme-pill:hover {
    opacity: 0.85;
  }

  .today-focus-pill {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border: 1.5px solid var(--color-primary-500);
    background-color: transparent;
    color: var(--color-primary-600);
    transition: background-color 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s;
    white-space: nowrap;
  }

  .today-focus-pill:hover:not(:disabled) {
    background-color: var(--color-primary-50);
  }

  .today-focus-pill.active {
    background-color: var(--color-primary-600);
    color: white;
    border-color: var(--color-primary-600);
  }

  .today-focus-pill.active:hover {
    background-color: var(--color-primary-700);
    border-color: var(--color-primary-700);
  }

  .today-focus-pill:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    border-color: var(--color-gray-300);
    color: var(--color-gray-400);
  }

  .pills-locked {
    opacity: 0.4;
    pointer-events: none;
  }
</style>
