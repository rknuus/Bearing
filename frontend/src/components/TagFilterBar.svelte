<script lang="ts">
  /**
   * TagFilterBar Component
   *
   * Renders a horizontal row of gray tag pills for filtering tasks.
   * "All" pill is active when no tags are selected.
   * Multiple tag pills can be active simultaneously.
   */

  interface Props {
    availableTags: string[];
    activeTagIds: string[];
    onToggle: (tag: string) => void;
    onClear: () => void;
  }

  let { availableTags, activeTagIds, onToggle, onClear }: Props = $props();

  const allActive = $derived(activeTagIds.length === 0);
</script>

{#if availableTags.length > 0}
  <div class="tag-filter-bar">
    <span class="filter-label">Filter by tag:</span>
    <button
      class="filter-pill all-pill"
      class:active={allActive}
      onclick={onClear}
      type="button"
    >
      All
    </button>
    {#each availableTags as tag (tag)}
      {@const isActive = activeTagIds.includes(tag)}
      <button
        class="filter-pill tag-pill"
        class:active={isActive}
        onclick={() => onToggle(tag)}
        type="button"
        title={tag}
      >
        #{tag}
      </button>
    {/each}
  </div>
{/if}

<style>
  .tag-filter-bar {
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
</style>
