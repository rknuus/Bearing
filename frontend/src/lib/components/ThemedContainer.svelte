<script lang="ts">
  /**
   * ThemedContainer Component
   *
   * A container that sets the --theme-color CSS custom property,
   * which propagates to all child components for consistent theming.
   */

  import type { Snippet } from 'svelte';

  interface Props {
    /** Theme color in hex format */
    color: string;
    /** Child content */
    children: Snippet;
  }

  let { color, children }: Props = $props();
</script>

<div class="themed-container" style="--theme-color: {color};">
  {@render children()}
</div>

<style>
  .themed-container {
    /* Default theme color if not set */
    --theme-color: var(--default-theme-color, #6b7280);
  }
</style>
