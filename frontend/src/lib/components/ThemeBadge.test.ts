import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ThemeBadge from './ThemeBadge.svelte';

describe('ThemeBadge', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderBadge(props: { color: string; size?: 'sm' | 'md' | 'lg'; label?: string }) {
    const result = render(ThemeBadge, { target: container, props });
    await tick();
    return result;
  }

  function getBadge(): HTMLSpanElement | null {
    return container.querySelector<HTMLSpanElement>('.theme-badge');
  }

  it('renders with color and default size', async () => {
    await renderBadge({ color: '#3b82f6' });

    const badge = getBadge();
    expect(badge).toBeTruthy();
    expect(badge?.style.getPropertyValue('--theme-color')).toBe('#3b82f6');
    expect(badge?.style.backgroundColor).toBe('rgb(59, 130, 246)');
    expect(badge?.classList.contains('md')).toBe(true);
  });

  it('renders with explicit size variant', async () => {
    await renderBadge({ color: '#ef4444', size: 'lg' });

    const badge = getBadge();
    expect(badge).toBeTruthy();
    expect(badge?.classList.contains('lg')).toBe(true);
  });

  it('uses custom label for aria-label', async () => {
    await renderBadge({ color: '#10b981', label: 'Health theme' });

    const badge = getBadge();
    expect(badge?.getAttribute('aria-label')).toBe('Health theme');
  });

  it('uses default aria-label when no label provided', async () => {
    await renderBadge({ color: '#8b5cf6' });

    const badge = getBadge();
    expect(badge?.getAttribute('aria-label')).toBe('Theme color: #8b5cf6');
  });
});
