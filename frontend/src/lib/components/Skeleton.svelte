<!--
  Skeleton loading primitive.

  Renders a neutral block matching the layout footprint of the content
  it stands in for. Background uses the design-token gray (var(--color-gray-200))
  with an optional shimmer animation; the shimmer is suppressed when the
  user prefers reduced motion.

  Use to eliminate Cumulative Layout Shift on view-mount: render skeleton
  shapes that share the loaded state's box geometry, so nothing jumps when
  data arrives.
-->
<script lang="ts">
  interface Props {
    /** Width — any CSS length. Defaults to 100% of the parent. */
    width?: string;
    /** Height — any CSS length. Defaults to 1em. */
    height?: string;
    /** Border radius — any CSS length, or 'pill' / 'circle'. Defaults to 4px. */
    rounded?: string;
    /** Disable the shimmer animation regardless of motion preference. */
    shimmer?: boolean;
    /** Optional CSS class for layout overrides at the call site. */
    class?: string;
  }

  let {
    width = '100%',
    height = '1em',
    rounded = '4px',
    shimmer = true,
    class: className = '',
  }: Props = $props();

  const radius = $derived(
    rounded === 'pill' ? '9999px' : rounded === 'circle' ? '50%' : rounded
  );
</script>

<span
  class="skeleton {className}"
  class:shimmer
  style="width: {width}; height: {height}; border-radius: {radius};"
  aria-hidden="true"
></span>

<style>
  .skeleton {
    display: inline-block;
    background-color: var(--color-gray-200);
    position: relative;
    overflow: hidden;
    vertical-align: middle;
  }

  .skeleton.shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.55) 50%,
      transparent 100%
    );
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes skeleton-shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton.shimmer::after {
      animation: none;
    }
  }
</style>
