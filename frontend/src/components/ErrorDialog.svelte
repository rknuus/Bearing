<script lang="ts">
  /**
   * ErrorDialog Component
   *
   * A toast/notification component for displaying rule violations and errors.
   * Shows each violation with its message and category.
   * Auto-dismisses after 5 seconds or can be closed manually.
   */

  import { onMount, onDestroy } from 'svelte';
  import type { RuleViolation } from '../lib/wails-mock';

  interface Props {
    violations: RuleViolation[];
    onClose: () => void;
  }

  let { violations, onClose }: Props = $props();

  let timer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    timer = setTimeout(() => {
      onClose();
    }, 5000);
  });

  onDestroy(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
</script>

{#if violations.length > 0}
  <div class="error-toast" role="alert" data-testid="error-dialog">
    <div class="toast-header">
      <span class="toast-title">Rule Violations</span>
      <button type="button" class="close-btn" onclick={onClose} aria-label="Close">
        x
      </button>
    </div>
    <ul class="violation-list">
      {#each violations as violation (violation.ruleId)}
        <li class="violation-item" data-testid="violation-item">
          <span class="violation-category">{violation.category}</span>
          <span class="violation-message">{violation.message}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .error-toast {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 2000;
    background-color: white;
    border: 2px solid var(--color-error-600);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    min-width: 300px;
    max-width: 450px;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: var(--color-error-100);
    border-bottom: 1px solid var(--color-error-200);
    border-radius: 6px 6px 0 0;
  }

  .toast-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-error-800);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-error-800);
    font-size: 1rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background-color: rgba(153, 27, 27, 0.1);
  }

  .violation-list {
    list-style: none;
    margin: 0;
    padding: 0.75rem 1rem;
  }

  .violation-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-gray-100);
  }

  .violation-item:last-child {
    border-bottom: none;
  }

  .violation-category {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-gray-500);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .violation-message {
    font-size: 0.8125rem;
    color: var(--color-gray-800);
  }
</style>
