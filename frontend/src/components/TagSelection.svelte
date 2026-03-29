<script lang="ts">
  /**
   * TagSelection Component
   *
   * Renders a horizontal row of gray tag pills for filtering tasks.
   * "All" pill is active when no tags are selected.
   * Multiple tag pills can be active simultaneously.
   * Includes an "Untagged" pill for filtering tasks with no tags.
   */

  import { UNTAGGED_SENTINEL } from '../lib/constants/filters';

  interface Props {
    availableTags: string[];
    activeTagIds: string[];
    onToggle: (tag: string) => void;
    onClear: () => void;
    counts?: Record<string, number>;
    untaggedActive?: boolean;
    hasUntaggedTasks?: boolean;
    todayFocusTags?: string[];
    todayFocusActive?: boolean;
    onTodayFocusToggle?: () => void;
  }

  let { availableTags, activeTagIds, onToggle, onClear, counts, untaggedActive = false, hasUntaggedTasks, todayFocusTags, todayFocusActive = false, onTodayFocusToggle }: Props = $props();

  const allActive = $derived(activeTagIds.length === 0);
  const hasUntagged = $derived((counts?.[UNTAGGED_SENTINEL] ?? 0) > 0);
  const todayFocusDisabled = $derived(!todayFocusTags?.length);
  const pillsLocked = $derived(todayFocusActive && !todayFocusDisabled);
</script>

{#if availableTags.length > 0 || hasUntagged}
  <div class="tag-filter-bar">
    <span class="filter-label">Filter by tag:</span>
    {#if onTodayFocusToggle !== undefined}
      <button
        class="today-focus-pill"
        class:active={todayFocusActive && !todayFocusDisabled}
        disabled={todayFocusDisabled}
        onclick={onTodayFocusToggle}
        type="button"
        title={todayFocusDisabled ? 'No focus tags set for today' : "Today's Focus"}
      >
        Today's Focus
      </button>
    {/if}
    <button
      class="filter-pill all-pill"
      class:active={allActive}
      class:pills-locked={pillsLocked}
      onclick={onClear}
      type="button"
    >
      All
      {#if counts}<span class="count-badge">{counts['__all__'] ?? 0}</span>{/if}
    </button>
    {#each availableTags as tag (tag)}
      {@const isActive = activeTagIds.includes(tag)}
      <button
        class="filter-pill tag-pill"
        class:active={isActive}
        class:pills-locked={pillsLocked}
        onclick={() => onToggle(tag)}
        type="button"
        title={tag}
      >
        #{tag}
        {#if counts}<span class="count-badge">{counts[tag] ?? 0}</span>{/if}
      </button>
    {/each}
    {#if (hasUntaggedTasks ?? hasUntagged) || untaggedActive}
      <button
        class="filter-pill tag-pill untagged-pill"
        class:active={untaggedActive}
        class:pills-locked={pillsLocked}
        onclick={() => onToggle(UNTAGGED_SENTINEL)}
        type="button"
        title="Tasks with no tags"
      >
        Untagged
        {#if counts}<span class="count-badge">{counts[UNTAGGED_SENTINEL] ?? 0}</span>{/if}
      </button>
    {/if}
  </div>
{/if}

<style>
  .tag-filter-bar {
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

  .tag-pill.active .count-badge {
    background-color: white;
    color: var(--color-gray-600);
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

  .tag-pill {
    background-color: transparent;
    color: var(--color-gray-500);
    border-color: var(--color-gray-300);
  }

  .tag-pill:hover {
    opacity: 0.85;
  }

  .tag-pill.active {
    background-color: var(--color-gray-600);
    color: white;
    border-color: var(--color-gray-600);
  }

  .untagged-pill {
    font-style: italic;
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
