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
  }

  let { themes, activeThemeIds, onToggle, onClear }: Props = $props();

  const allActive = $derived(activeThemeIds.length === 0);
</script>

<div class="theme-filter-bar">
  <span class="filter-label">Filter by theme:</span>
  <button
    class="filter-pill all-pill"
    class:active={allActive}
    onclick={onClear}
    type="button"
  >
    All
  </button>
  {#each themes as theme (theme.id)}
    {@const isActive = activeThemeIds.includes(theme.id)}
    <button
      class="filter-pill theme-pill"
      class:active={isActive}
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
    </button>
  {/each}
</div>

<style>
  .theme-filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
  }

  .filter-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-gray-600);
    white-space: nowrap;
  }

  .filter-pill {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border: 1.5px solid var(--color-gray-300);
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
    white-space: nowrap;
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
</style>
