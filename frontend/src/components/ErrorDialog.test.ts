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

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    await renderDialog({ violations: makeViolations(), onClose });

    const closeBtn = container.querySelector<HTMLButtonElement>('.close-btn');
    expect(closeBtn).toBeTruthy();
    closeBtn!.click();
    await tick();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after 5 seconds', async () => {
    const onClose = vi.fn();
    await renderDialog({ violations: makeViolations(), onClose });

    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4999);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows toast title', async () => {
    await renderDialog({ violations: makeViolations() });

    const title = container.querySelector('.toast-title');
    expect(title?.textContent).toBe('Rule Violations');
  });
});
