<script lang="ts">
  /**
   * Button Component
   *
   * A reusable button with primary, secondary, danger, and icon variants.
   * Icon buttons support color sub-variants for different action types.
   */

  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'icon' | 'danger';
  type IconColor = 'default' | 'edit' | 'delete' | 'add' | 'save' | 'cancel' | 'complete' | 'reopen' | 'archive' | 'nav';

  interface Props extends HTMLButtonAttributes {
    /** Button style variant */
    variant?: Variant;
    /** Color sub-variant for icon buttons */
    color?: IconColor;
    /** Child content */
    children?: Snippet;
  }

  let {
    variant = 'primary',
    color = 'default',
    disabled = false,
    type = 'button',
    children,
    ...restProps
  }: Props = $props();
</script>

<button
  class="btn btn-{variant} {variant === 'icon' ? `icon-${color}` : ''}"
  {type}
  {disabled}
  {...restProps}
>
  {#if children}{@render children()}{/if}
</button>

<style>
  /* Shared base */
  .btn {
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    font-family: inherit;
  }

  .btn:disabled {
    cursor: not-allowed;
  }

  /* Primary */
  .btn-primary {
    padding: 0.5rem 1rem;
    background-color: var(--color-primary-600);
    color: white;
    border: none;
    border-radius: var(--radius-md);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-700);
  }

  .btn-primary:disabled {
    background-color: var(--color-primary-300);
  }

  /* Secondary */
  .btn-secondary {
    padding: 0.5rem 1rem;
    background-color: white;
    color: var(--color-gray-700);
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-md);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--color-gray-50);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
  }

  /* Danger */
  .btn-danger {
    padding: 0.5rem 1rem;
    background-color: var(--color-error-600);
    color: white;
    border: none;
    border-radius: var(--radius-md);
  }

  .btn-danger:hover:not(:disabled) {
    background-color: var(--color-error-800);
  }

  .btn-danger:disabled {
    opacity: 0.5;
  }

  /* Icon */
  .btn-icon {
    background: none;
    border: none;
    padding: 0.375rem;
    border-radius: var(--radius-sm);
    color: var(--color-gray-500);
  }

  .btn-icon:hover {
    background-color: var(--color-gray-100);
  }

  /* Icon color sub-variants */
  .btn-icon.icon-edit {
    color: var(--color-primary-500);
  }

  .btn-icon.icon-delete {
    color: var(--color-error-500);
  }

  .btn-icon.icon-add {
    color: var(--color-success-500);
    font-weight: bold;
  }

  .btn-icon.icon-save {
    color: var(--color-success-500);
  }

  .btn-icon.icon-cancel {
    color: var(--color-gray-500);
  }

  .btn-icon.icon-complete {
    color: var(--color-success-500);
  }

  .btn-icon.icon-reopen {
    color: var(--color-warning-500);
  }

  .btn-icon.icon-archive {
    color: var(--color-gray-500);
  }

  .btn-icon.icon-nav {
    color: var(--color-gray-500);
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.25rem 0.375rem;
  }

  .btn-icon.icon-nav:hover {
    color: var(--color-primary-600);
    background-color: var(--color-primary-50);
  }
</style>
