<script lang="ts">
  /**
   * Breadcrumb Component
   *
   * Renders a navigable breadcrumb trail based on a hierarchical ID.
   * Supports keyboard navigation and accessibility.
   */

  import { parseHierarchicalId, type BreadcrumbSegment } from '../utils/id-parser';

  interface Props {
    /** Hierarchical ID (e.g., "THEME-01.OKR-02.KR-03") */
    itemId: string;
    /** Callback when a segment is clicked */
    onNavigate: (segmentId: string) => void;
  }

  let { itemId, onNavigate }: Props = $props();

  const segments: BreadcrumbSegment[] = $derived(parseHierarchicalId(itemId));

  function handleKeyDown(event: KeyboardEvent, segmentId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onNavigate(segmentId);
    }
  }
</script>

<nav class="breadcrumb" aria-label="Navigation path">
  <ol class="breadcrumb-list" role="list">
    {#each segments as segment, i (segment.id)}
      <li class="breadcrumb-item">
        {#if i > 0}
          <span class="separator" aria-hidden="true">›</span>
        {/if}
        {#if i === segments.length - 1}
          <!-- Current page - not clickable -->
          <span class="breadcrumb-current" aria-current="page">
            {segment.label}
          </span>
        {:else}
          <button
            type="button"
            class="breadcrumb-link"
            onclick={() => onNavigate(segment.id)}
            onkeydown={(e) => handleKeyDown(e, segment.id)}
          >
            {segment.label}
          </button>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  .breadcrumb {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  .breadcrumb-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 0.25rem;
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .separator {
    color: #9ca3af;
    user-select: none;
  }

  .breadcrumb-link {
    background: none;
    border: none;
    padding: 0.25rem 0.5rem;
    margin: -0.25rem -0.5rem;
    border-radius: 4px;
    color: #3b82f6;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    transition: background-color 0.15s, color 0.15s;
  }

  .breadcrumb-link:hover {
    background-color: #eff6ff;
    color: #2563eb;
  }

  .breadcrumb-link:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  .breadcrumb-current {
    color: #6b7280;
    font-weight: 500;
  }
</style>
