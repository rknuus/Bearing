import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick, createRawSnippet } from 'svelte';
import Dialog from './Dialog.svelte';

describe('Dialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function childSnippet(text: string) {
    return createRawSnippet(() => ({
      render: () => `<p class="dialog-body">${text}</p>`,
    }));
  }

  function actionsSnippet(label: string) {
    return createRawSnippet(() => ({
      render: () => `<button class="action-btn">${label}</button>`,
    }));
  }

  async function renderDialog(props: {
    title: string;
    onclose: () => void;
    children: ReturnType<typeof createRawSnippet>;
    actions?: ReturnType<typeof createRawSnippet>;
    id?: string;
  }) {
    const result = render(Dialog, { target: container, props });
    await tick();
    return result;
  }

  it('renders with the provided title visible and linked via aria-labelledby', async () => {
    const onclose = vi.fn();
    await renderDialog({ title: 'Confirm Delete', onclose, children: childSnippet('Are you sure?') });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();

    const titleId = dialog!.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();

    const titleEl = container.querySelector(`#${titleId}`);
    expect(titleEl).toBeTruthy();
    expect(titleEl?.textContent).toBe('Confirm Delete');
  });

  it('calls onclose when Escape key is pressed', async () => {
    const onclose = vi.fn();
    await renderDialog({ title: 'Test', onclose, children: childSnippet('Body') });

    await fireEvent.keyDown(document, { key: 'Escape' });
    await tick();

    expect(onclose).toHaveBeenCalledOnce();
  });

  it('does not trigger onclose when clicking the overlay', async () => {
    const onclose = vi.fn();
    await renderDialog({ title: 'Test', onclose, children: childSnippet('Body') });

    const overlay = container.querySelector('.dialog-overlay');
    expect(overlay).toBeTruthy();

    await fireEvent.click(overlay!);
    await tick();

    expect(onclose).not.toHaveBeenCalled();
  });

  it('renders footer action buttons when provided via snippet', async () => {
    const onclose = vi.fn();
    await renderDialog({
      title: 'Actions Test',
      onclose,
      children: childSnippet('Body'),
      actions: actionsSnippet('Save'),
    });

    const actionsContainer = container.querySelector('.dialog-actions');
    expect(actionsContainer).toBeTruthy();

    const actionBtn = actionsContainer!.querySelector('.action-btn');
    expect(actionBtn).toBeTruthy();
    expect(actionBtn?.textContent).toBe('Save');
  });
});
