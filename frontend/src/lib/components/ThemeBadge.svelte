<script lang="ts">
  /**
   * ThemeBadge Component
   *
   * Displays a colored badge representing a theme color.
   * Sets the --theme-color CSS custom property for color propagation to children.
   */

  interface Props {
    /** Hex color code (e.g., "#3b82f6") */
    color: string;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Optional accessible label */
    label?: string;
  }

  let { color, size = 'md', label }: Props = $props();

  const ariaLabel = $derived(label ?? `Theme color: ${color}`);
</script>

<span
  class="theme-badge {size}"
  style="--theme-color: {color}; background-color: {color};"
  role="img"
  aria-label={ariaLabel}
></span>

<style>
  .theme-badge {
    display: inline-block;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .theme-badge.sm {
    width: 12px;
    height: 12px;
  }

  .theme-badge.md {
    width: 16px;
    height: 16px;
  }

  .theme-badge.lg {
    width: 24px;
    height: 24px;
  }
</style>
