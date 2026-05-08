import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { RuleViolation } from '../lib/wails-mock';
import ErrorDialog from './ErrorDialog.svelte';

function makeViolations(): RuleViolation[] {
  return [
    { ruleId: 'wip-limit', priority: 1, message: 'WIP limit exceeded', category: 'workflow' },
    { ruleId: 'no-skip', priority: 2, message: 'Cannot skip todo column', category: 'transition' },
  ];
}

function makeOtherViolations(): RuleViolation[] {
  return [
    { ruleId: 'forbidden-tag', priority: 1, message: 'Tag is forbidden', category: 'tagging' },
  ];
}

describe('ErrorDialog', () => {
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

  async function renderDialog(props: {
    violations: RuleViolation[];
    onClose?: () => void;
  }) {
    const result = render(ErrorDialog, {
      target: container,
      props: {
        violations: props.violations,
        onClose: props.onClose ?? (() => {}),
      },
    });
    await tick();
    return result;
  }

  it('renders violations with message and category', async () => {
    await renderDialog({ violations: makeViolations() });

    const toast = container.querySelector('[data-testid="error-dialog"]');
    expect(toast).toBeTruthy();

    const items = container.querySelectorAll('[data-testid="violation-item"]');
    expect(items.length).toBe(2);

    const firstCategory = items[0].querySelector('.violation-category');
    expect(firstCategory?.textContent).toBe('workflow');

    const firstMessage = items[0].querySelector('.violation-message');
    expect(firstMessage?.textContent).toBe('WIP limit exceeded');

    const secondCategory = items[1].querySelector('.violation-category');
    expect(secondCategory?.textContent).toBe('transition');

    const secondMessage = items[1].querySelector('.violation-message');
    expect(secondMessage?.textContent).toBe('Cannot skip todo column');
  });

  it('does not render when violations array is empty', async () => {
    await renderDialog({ violations: [] });

    const toast = container.querySelector('[data-testid="error-dialog"]');
    expect(toast).toBeNull();
  });

  it('shows toast title', async () => {
    await renderDialog({ violations: makeViolations() });

    const title = container.querySelector('.toast-title');
    expect(title?.textContent).toBe('Rule Violations');
  });

  it('close button has aria-label "Dismiss"', async () => {
    await renderDialog({ violations: makeViolations() });

    const closeBtn = container.querySelector<HTMLButtonElement>('.close-btn');
    expect(closeBtn).toBeTruthy();
    expect(closeBtn!.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('close button is the first focusable element inside the dialog', async () => {
    await renderDialog({ violations: makeViolations() });

    const dialog = container.querySelector<HTMLElement>('[data-testid="error-dialog"]');
    expect(dialog).toBeTruthy();
    const focusable = dialog!.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    expect(focusable).toBeTruthy();
    expect(focusable!.classList.contains('close-btn')).toBe(true);
  });

  it('does not register an auto-dismiss timer', async () => {
    const onClose = vi.fn();
    await renderDialog({ violations: makeViolations(), onClose });

    // No setTimeout / setInterval / similar should be pending.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('error stays in DOM after a long virtual-time advance (no auto-dismiss)', async () => {
    const onClose = vi.fn();
    await renderDialog({ violations: makeViolations(), onClose });

    vi.advanceTimersByTime(60_000);
    await tick();

    const toast = container.querySelector('[data-testid="error-dialog"]');
    expect(toast).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('close button click dismisses the matching error', async () => {
    const onClose = vi.fn();
    await renderDialog({ violations: makeViolations(), onClose });

    const closeBtn = container.querySelector<HTMLButtonElement>('.close-btn');
    expect(closeBtn).toBeTruthy();
    closeBtn!.click();
    await tick();

    const toast = container.querySelector('[data-testid="error-dialog"]');
    expect(toast).toBeNull();
    // onClose is invoked when the stack drains so the parent can reset state.
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders two sequential error batches simultaneously and dismisses independently', async () => {
    const onClose = vi.fn();
    const { rerender } = await renderDialog({
      violations: makeViolations(),
      onClose,
    });

    // Second batch arrives while the first is still visible.
    await rerender({ violations: makeOtherViolations(), onClose });
    await tick();

    let toasts = container.querySelectorAll('[data-testid="error-dialog"]');
    expect(toasts.length).toBe(2);

    // Identify the toast carrying the first batch's "WIP limit exceeded" message.
    const firstToast = Array.from(toasts).find(t =>
      t.textContent?.includes('WIP limit exceeded')
    );
    const secondToast = Array.from(toasts).find(t =>
      t.textContent?.includes('Tag is forbidden')
    );
    expect(firstToast).toBeTruthy();
    expect(secondToast).toBeTruthy();

    // Click × on the first batch — only it should disappear.
    const firstCloseBtn = firstToast!.querySelector<HTMLButtonElement>('.close-btn');
    firstCloseBtn!.click();
    await tick();

    toasts = container.querySelectorAll('[data-testid="error-dialog"]');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('Tag is forbidden');
    expect(onClose).not.toHaveBeenCalled();

    // Dismiss the remaining one — surface clears and onClose fires once.
    const remainingCloseBtn = toasts[0].querySelector<HTMLButtonElement>('.close-btn');
    remainingCloseBtn!.click();
    await tick();

    expect(container.querySelectorAll('[data-testid="error-dialog"]').length).toBe(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape key dismisses only the topmost error', async () => {
    const onClose = vi.fn();
    const { rerender } = await renderDialog({
      violations: makeViolations(),
      onClose,
    });

    await rerender({ violations: makeOtherViolations(), onClose });
    await tick();

    expect(container.querySelectorAll('[data-testid="error-dialog"]').length).toBe(2);

    // Topmost = most recently pushed = the second batch.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();

    const toasts = container.querySelectorAll('[data-testid="error-dialog"]');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('WIP limit exceeded');
    expect(toasts[0].textContent).not.toContain('Tag is forbidden');
    expect(onClose).not.toHaveBeenCalled();

    // A second Escape clears the remaining one.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();

    expect(container.querySelectorAll('[data-testid="error-dialog"]').length).toBe(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not have role="dialog" — it is a non-modal alert region', async () => {
    await renderDialog({ violations: makeViolations() });

    const toast = container.querySelector('[data-testid="error-dialog"]');
    expect(toast?.getAttribute('role')).toBe('alert');
  });
});
