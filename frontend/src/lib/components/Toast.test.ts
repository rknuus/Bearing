import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Toast from './Toast.svelte';

describe('Toast', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  async function renderToast(props: { message: string; duration?: number; onDismiss?: () => void }) {
    const result = render(Toast, { target: container, props });
    await tick();
    return result;
  }

  it('renders the message', async () => {
    await renderToast({ message: 'Hello world' });

    const toast = container.querySelector('.toast');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toBe('Hello world');
  });

  it('has role="status" for accessibility', async () => {
    await renderToast({ message: 'Test' });

    const toast = container.querySelector('[role="status"]');
    expect(toast).toBeTruthy();
  });

  it('auto-dismisses after default duration', async () => {
    await renderToast({ message: 'Disappearing' });

    expect(container.querySelector('.toast')).toBeTruthy();

    vi.advanceTimersByTime(5000);
    await tick();

    expect(container.querySelector('.toast')).toBeNull();
  });

  it('auto-dismisses after custom duration', async () => {
    await renderToast({ message: 'Quick', duration: 2000 });

    expect(container.querySelector('.toast')).toBeTruthy();

    vi.advanceTimersByTime(1999);
    await tick();
    expect(container.querySelector('.toast')).toBeTruthy();

    vi.advanceTimersByTime(1);
    await tick();
    expect(container.querySelector('.toast')).toBeNull();
  });

  it('calls onDismiss callback when auto-dismissed', async () => {
    const onDismiss = vi.fn();
    await renderToast({ message: 'Callback test', onDismiss });

    vi.advanceTimersByTime(5000);
    await tick();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onDismiss before duration elapses', async () => {
    const onDismiss = vi.fn();
    await renderToast({ message: 'Not yet', duration: 3000, onDismiss });

    vi.advanceTimersByTime(2999);
    await tick();

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
