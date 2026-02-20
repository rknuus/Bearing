<script lang="ts">
  /**
   * TagBadges Component
   *
   * Renders an array of tags as minimal gray badges with # prefix.
   * Handles empty state (renders nothing) and truncation (shows "+N").
   */

  interface Props {
    /** Array of tag strings to display */
    tags?: string[];
  }

  let { tags }: Props = $props();

  let containerEl = $state<HTMLElement | undefined>();
  let hiddenCount = $state(0);

  $effect(() => {
    const el = containerEl;
    if (!el || !tags?.length) {
      hiddenCount = 0;
      return;
    }

    // Reset to show all badges for measurement
    hiddenCount = 0;

    // Use requestAnimationFrame to measure after DOM update
    const frame = requestAnimationFrame(() => {
      const children = el.querySelectorAll<HTMLElement>('.tag-badge');
      if (children.length === 0) return;

      const containerRight = el.getBoundingClientRect().right;
      let count = 0;

      for (let i = children.length - 1; i >= 0; i--) {
        if (children[i].getBoundingClientRect().right > containerRight) {
          count++;
        } else {
          break;
        }
      }

      hiddenCount = count;
    });

    return () => cancelAnimationFrame(frame);
  });

  const visibleTags = $derived(
    tags && hiddenCount > 0 ? tags.slice(0, tags.length - hiddenCount) : tags
  );
</script>

{#if tags?.length}
  <div class="tag-badges" bind:this={containerEl}>
    {#each visibleTags ?? [] as tag (tag)}
      <span class="tag-badge">#{tag}</span>
    {/each}
    {#if hiddenCount > 0}
      <span class="tag-overflow">+{hiddenCount}</span>
    {/if}
  </div>
{/if}

<style>
  .tag-badges {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.25rem;
    overflow: hidden;
    margin-bottom: 0.375rem;
  }

  .tag-badge {
    display: inline-block;
    flex-shrink: 0;
    background-color: var(--color-gray-200);
    color: var(--color-gray-600);
    font-size: 0.6875rem;
    line-height: 1;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    white-space: nowrap;
  }

  .tag-overflow {
    display: inline-block;
    flex-shrink: 0;
    color: var(--color-gray-500);
    font-size: 0.6875rem;
    line-height: 1;
    padding: 0.125rem 0.25rem;
    white-space: nowrap;
  }
</style>
