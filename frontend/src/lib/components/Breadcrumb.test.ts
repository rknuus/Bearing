import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Breadcrumb from './Breadcrumb.svelte';
import { main } from '../wails/wailsjs/go/models';

describe('Breadcrumb', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function makeTheme(id: string, name: string, objectives: main.Objective[] = []): main.LifeTheme {
    return new main.LifeTheme({ id, name, color: '#3b82f6', objectives });
  }

  function makeObjective(id: string, parentId: string, keyResults: main.KeyResult[] = []): main.Objective {
    return new main.Objective({ id, parentId, title: `Objective ${id}`, keyResults, objectives: [] });
  }

  function makeKeyResult(id: string, parentId: string): main.KeyResult {
    return new main.KeyResult({ id, parentId, description: `Key Result ${id}` });
  }

  async function renderBreadcrumb(props: {
    itemId: string;
    themes?: main.LifeTheme[];
    onNavigate: (segmentId: string) => void;
  }) {
    const result = render(Breadcrumb, { target: container, props });
    await tick();
    return result;
  }

  function getNav(): HTMLElement | null {
    return container.querySelector<HTMLElement>('nav.breadcrumb');
  }

  function getSegments(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.breadcrumb-item'));
  }

  function getSeparators(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.separator'));
  }

  it('renders nav element with breadcrumb items for a theme', async () => {
    const themes = [makeTheme('H', 'Health')];
    const onNavigate = vi.fn();

    await renderBreadcrumb({ itemId: 'H', themes, onNavigate });

    const nav = getNav();
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute('aria-label')).toBe('Navigation path');

    const segments = getSegments();
    expect(segments).toHaveLength(1);

    const current = container.querySelector('.breadcrumb-current');
    expect(current?.textContent?.trim()).toBe('H');
  });

  it('renders breadcrumb trail for a key result', async () => {
    const kr = makeKeyResult('H-KR1', 'H-O1');
    const obj = makeObjective('H-O1', 'H', [kr]);
    const themes = [makeTheme('H', 'Health', [obj])];
    const onNavigate = vi.fn();

    await renderBreadcrumb({ itemId: 'H-KR1', themes, onNavigate });

    const segments = getSegments();
    expect(segments).toHaveLength(3);

    // Separators between segments
    const separators = getSeparators();
    expect(separators).toHaveLength(2);

    // Last segment is current (not clickable)
    const current = container.querySelector('.breadcrumb-current');
    expect(current?.textContent?.trim()).toBe('KR 1');

    // Earlier segments are clickable buttons
    const buttons = container.querySelectorAll<HTMLButtonElement>('.breadcrumb-link');
    expect(buttons).toHaveLength(2);
  });

  it('calls onNavigate when a breadcrumb link is clicked', async () => {
    const obj = makeObjective('H-O1', 'H');
    const themes = [makeTheme('H', 'Health', [obj])];
    const onNavigate = vi.fn();

    await renderBreadcrumb({ itemId: 'H-O1', themes, onNavigate });

    // Click the theme segment (first button)
    const button = container.querySelector<HTMLButtonElement>('.breadcrumb-link');
    expect(button).toBeTruthy();
    button?.click();
    await tick();

    expect(onNavigate).toHaveBeenCalledWith('H');
  });
});
