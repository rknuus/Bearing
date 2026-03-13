<script lang="ts">
  /**
   * BearingLogo Component
   *
   * Renders the compass rose logo as inline SVG.
   * Uses currentColor so it inherits the parent text color.
   */

  interface Props {
    /** Icon size in pixels */
    size?: number;
  }

  let { size = 28 }: Props = $props();
</script>

<svg
  viewBox="0 0 435.577 428.365"
  width={size}
  height={size}
  fill="currentColor"
  aria-hidden="true"
>
  <!-- Outer ring -->
  <circle cx="217.79" cy="214.18" r="142" fill="none" stroke="currentColor" stroke-width="2" />
  <!-- Middle ring -->
  <circle cx="217.79" cy="214.18" r="115" fill="none" stroke="currentColor" stroke-width="2" />
  <!-- Inner ring -->
  <circle cx="217.79" cy="214.18" r="88" fill="none" stroke="currentColor" stroke-width="2" />

  <!-- Cardinal compass points (N, E, S, W) - long points -->
  <!-- N light -->
  <polygon points="187.79,214.18 217.79,54.18 217.79,214.18" opacity="0.55" />
  <!-- N dark -->
  <polygon points="247.79,214.18 217.79,54.18 217.79,214.18" />
  <!-- E light -->
  <polygon points="217.79,184.18 377.79,214.18 217.79,214.18" opacity="0.55" />
  <!-- E dark -->
  <polygon points="217.79,244.18 377.79,214.18 217.79,214.18" />
  <!-- S light -->
  <polygon points="247.79,214.18 217.79,374.18 217.79,214.18" opacity="0.55" />
  <!-- S dark -->
  <polygon points="187.79,214.18 217.79,374.18 217.79,214.18" />
  <!-- W light -->
  <polygon points="217.79,244.18 57.79,214.18 217.79,214.18" opacity="0.55" />
  <!-- W dark -->
  <polygon points="217.79,184.18 57.79,214.18 217.79,214.18" />

  <!-- Intercardinal compass points (NE, SE, SW, NW) - shorter points -->
  <!-- NE light -->
  <polygon points="202.23,198.62 301.23,130.74 217.79,214.18" opacity="0.55" />
  <!-- NE dark -->
  <polygon points="233.35,229.74 301.23,130.74 217.79,214.18" />
  <!-- SE light -->
  <polygon points="233.35,198.62 301.23,297.62 217.79,214.18" opacity="0.55" />
  <!-- SE dark -->
  <polygon points="202.23,229.74 301.23,297.62 217.79,214.18" />
  <!-- SW light -->
  <polygon points="233.35,229.74 134.35,297.62 217.79,214.18" opacity="0.55" />
  <!-- SW dark -->
  <polygon points="202.23,198.62 134.35,297.62 217.79,214.18" />
  <!-- NW light -->
  <polygon points="202.23,229.74 134.35,130.74 217.79,214.18" opacity="0.55" />
  <!-- NW dark -->
  <polygon points="233.35,198.62 134.35,130.74 217.79,214.18" />

  <!-- Center circles -->
  <circle cx="217.79" cy="214.18" r="30" fill="none" stroke="currentColor" stroke-width="2" />
  <circle cx="217.79" cy="214.18" r="20" fill="none" stroke="currentColor" stroke-width="1.5" />
  <circle cx="217.79" cy="214.18" r="11" opacity="0.7" />
  <circle cx="217.79" cy="214.18" r="4" />

  <!-- Cardinal direction labels -->
  <text x="217.79" y="26.18" fill="currentColor" font-family="Georgia, serif" font-weight="bold" font-size="26" text-anchor="middle" dominant-baseline="central">N</text>
  <text x="405.79" y="214.18" fill="currentColor" font-family="Georgia, serif" font-weight="bold" font-size="26" text-anchor="middle" dominant-baseline="central">E</text>
  <text x="217.79" y="402.18" fill="currentColor" font-family="Georgia, serif" font-weight="bold" font-size="26" text-anchor="middle" dominant-baseline="central">S</text>
  <text x="29.79" y="214.18" fill="currentColor" font-family="Georgia, serif" font-weight="bold" font-size="26" text-anchor="middle" dominant-baseline="central">W</text>
</svg>
