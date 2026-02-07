import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick, createRawSnippet } from 'svelte';
import ThemedContainer from './ThemedContainer.svelte';

describe('ThemedContainer', () => {
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
      render: () => `<span class="child-content">${text}</span>`,
    }));
  }

  async function renderContainer(props: { color: string; children: ReturnType<typeof createRawSnippet> }) {
    const result = render(ThemedContainer, { target: container, props });
    await tick();
    return result;
  }

  function getContainer(): HTMLDivElement | null {
    return container.querySelector<HTMLDivElement>('.themed-container');
  }

  it('renders with theme color CSS custom property', async () => {
    await renderContainer({ color: '#3b82f6', children: childSnippet('Hello') });

    const el = getContainer();
    expect(el).toBeTruthy();
    expect(el?.style.getPropertyValue('--theme-color')).toBe('#3b82f6');
  });

  it('renders child content via snippet', async () => {
    await renderContainer({ color: '#ef4444', children: childSnippet('Test content') });

    const child = container.querySelector('.child-content');
    expect(child).toBeTruthy();
    expect(child?.textContent).toBe('Test content');
  });

  it('propagates different theme colors', async () => {
    await renderContainer({ color: '#10b981', children: childSnippet('Green theme') });

    const el = getContainer();
    expect(el?.style.getPropertyValue('--theme-color')).toBe('#10b981');
  });
});
