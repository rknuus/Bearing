<script lang="ts">

  interface Props {
    message: string;
    duration?: number;
    onDismiss?: () => void;
  }

  const { message, duration = 5000, onDismiss }: Props = $props();

  let visible = $state(true);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    timer = setTimeout(() => {
      visible = false;
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  });
</script>

{#if visible}
  <div class="toast" role="status">
    <span>{message}</span>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    padding: 0.75rem 1.25rem;
    background-color: var(--color-gray-800);
    color: var(--color-gray-50);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    animation: toast-in 0.3s ease-out;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
