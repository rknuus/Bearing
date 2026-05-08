<script lang="ts">
  /**
   * ErrorDialog Component
   *
   * A persistent toast/notification component for displaying rule violations
   * and errors. Each batch of violations stacks vertically (most recent on
   * top); each is dismissed independently via its × close button or by
   * pressing Escape (which dismisses the topmost batch only). No
   * auto-dismiss — errors stay until the user explicitly clears them.
   *
   * The component is non-modal: clicks outside the dialog frame still reach
   * underlying app UI. Stack updates are driven internally by watching the
   * `violations` prop; when the stack drains the parent's `onClose` is
   * invoked so callers that gate on `violations.length > 0` reset cleanly.
   */

  import { onDestroy, untrack } from 'svelte';
  import type { RuleViolation } from '../lib/wails-mock';

  interface Props {
    violations: RuleViolation[];
    onClose: () => void;
  }

  let { violations, onClose }: Props = $props();

  interface StackEntry {
    id: number;
    violations: RuleViolation[];
  }

  let stack = $state<StackEntry[]>([]);
  let nextId = 0;
  let lastSeenRef: RuleViolation[] | null = null;

  // Watch the `violations` prop. Each non-empty array reference that we
  // haven't seen yet becomes a new stack entry. We compare by reference so
  // callers that re-assign the same array don't double-push.
  $effect(() => {
    const incoming = violations;
    if (incoming === lastSeenRef) return;
    lastSeenRef = incoming;
    if (incoming && incoming.length > 0) {
      untrack(() => {
        stack = [...stack, { id: nextId++, violations: incoming }];
      });
    }
  });

  function dismiss(id: number): void {
    const next = stack.filter(entry => entry.id !== id);
    stack = next;
    if (next.length === 0) {
      onClose();
    }
  }

  function dismissTopmost(): void {
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    dismiss(top.id);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && stack.length > 0) {
      event.preventDefault();
      dismissTopmost();
    }
  }

  $effect(() => {
    if (stack.length > 0) {
      window.addEventListener('keydown', handleKeydown);
      return () => window.removeEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if stack.length > 0}
  <div class="error-stack">
    {#each stack as entry (entry.id)}
      <div class="error-toast" role="alert" data-testid="error-dialog">
        <div class="toast-header">
          <span class="toast-title">Rule Violations</span>
          <button
            type="button"
            class="close-btn"
            onclick={() => dismiss(entry.id)}
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
        <ul class="violation-list">
          {#each entry.violations as violation (violation.ruleId)}
            <li class="violation-item" data-testid="violation-item">
              <span class="violation-category">{violation.category}</span>
              <span class="violation-message">{violation.message}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}

<style>
  .error-stack {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: var(--z-error);
    display: flex;
    flex-direction: column-reverse;
    gap: 0.5rem;
    pointer-events: none;
  }

  .error-toast {
    pointer-events: auto;
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
