<script lang="ts">
  /**
   * Dialog Component
   *
   * A reusable modal dialog with overlay, title, body content, and optional
   * action buttons. Closes on overlay click or Escape key.
   */

  import type { Snippet } from 'svelte';
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    /** Dialog title displayed in the header */
    title: string;
    /** Explicit ID for the dialog title element (used for aria-labelledby) */
    id?: string;
    /** Maximum width of the dialog container */
    maxWidth?: string;
    /** Called when the dialog should close (overlay click or Escape) */
    onclose: () => void;
    /** Main body content */
    children: Snippet;
    /** Optional footer action buttons */
    actions?: Snippet;
  }

  let { title, id, maxWidth = '400px', onclose, children, actions }: Props = $props();

  const titleId = $derived(id ?? `dialog-title-${title.replace(/\s+/g, '-').toLowerCase()}`);

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="dialog-overlay" onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="dialog"
    style:max-width={maxWidth}
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-labelledby={titleId}
  >
    <h2 id={titleId}>{title}</h2>
    {@render children()}
    {#if actions}
      <div class="dialog-actions">
        {@render actions()}
      </div>
    {/if}
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .dialog {
    background-color: white;
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .dialog h2 {
    font-size: var(--space-5);
    color: var(--color-gray-800);
    margin: 0 0 var(--space-4) 0;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }
</style>
