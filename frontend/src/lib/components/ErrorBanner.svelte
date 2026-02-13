<script lang="ts">
  /**
   * ErrorBanner Component
   *
   * Displays a red-tinted error banner with an optional dismiss button.
   * Unifies the dismissable and non-dismissable error patterns used across views.
   */

  interface Props {
    /** Error message text */
    message: string;
    /** Whether the banner can be dismissed (default: true) */
    dismissable?: boolean;
    /** Callback when the dismiss button is clicked */
    ondismiss?: () => void;
  }

  let { message, dismissable = true, ondismiss }: Props = $props();
</script>

<div class="error-banner" role="alert">
  <span>{message}</span>
  {#if dismissable && ondismiss}
    <button type="button" onclick={ondismiss}>Dismiss</button>
  {/if}
</div>

<style>
  .error-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: var(--color-error-100);
    border: 1px solid var(--color-error-200);
    border-radius: var(--radius-md);
    color: var(--color-error-800);
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }

  .error-banner button {
    background: none;
    border: none;
    color: var(--color-error-800);
    cursor: pointer;
    font-weight: 500;
  }
</style>
