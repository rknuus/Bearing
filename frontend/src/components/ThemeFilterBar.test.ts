import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ThemeFilterBar from './ThemeFilterBar.svelte';
import type { LifeTheme } from '../lib/wails-mock';

function makeTestThemes(): LifeTheme[] {
  return [
    { id: 'HF', name: 'Health & Fitness', color: '#22c55e', objectives: [] },
    { id: 'CG', name: 'Career Growth', color: '#3b82f6', objectives: [] },
  ];
}

describe('ThemeFilterBar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderBar(props: {
    themes?: LifeTheme[];
    activeThemeIds?: string[];
    onToggle?: (themeId: string) => void;
    onClear?: () => void;
    counts?: Record<string, number>;
    todayFocusThemeId?: string | null;
    todayFocusActive?: boolean;
    onTodayFocusToggle?: () => void;
  } = {}) {
    const result = render(ThemeFilterBar, {
      target: container,
      props: {
        themes: props.themes ?? makeTestThemes(),
        activeThemeIds: props.activeThemeIds ?? [],
        onToggle: props.onToggle ?? (() => {}),
        onClear: props.onClear ?? (() => {}),
        counts: props.counts,
        todayFocusThemeId: props.todayFocusThemeId,
        todayFocusActive: props.todayFocusActive,
        onTodayFocusToggle: props.onTodayFocusToggle,
      },
    });
    await tick();
    return result;
  }

  it('renders Today\'s Focus chip when onTodayFocusToggle provided', async () => {
    await renderBar({ onTodayFocusToggle: () => {} });

    const chip = container.querySelector('.today-focus-pill');
    expect(chip).not.toBeNull();
    expect(chip?.textContent?.trim()).toBe("Today's Focus");
  });

  it('Today\'s Focus chip is active when todayFocusActive=true and todayFocusThemeId set', async () => {
    await renderBar({
      todayFocusThemeId: 'HF',
      todayFocusActive: true,
      onTodayFocusToggle: () => {},
    });

    const chip = container.querySelector('.today-focus-pill');
    expect(chip?.classList.contains('active')).toBe(true);
  });

  it('Today\'s Focus chip is disabled when todayFocusThemeId is null', async () => {
    await renderBar({
      todayFocusThemeId: null,
      todayFocusActive: true,
      onTodayFocusToggle: () => {},
    });

    const chip = container.querySelector<HTMLButtonElement>('.today-focus-pill');
    expect(chip?.disabled).toBe(true);
    expect(chip?.classList.contains('active')).toBe(false);
  });

  it('other pills are locked when Today\'s Focus is active', async () => {
    await renderBar({
      todayFocusThemeId: 'HF',
      todayFocusActive: true,
      onTodayFocusToggle: () => {},
    });

    const allPill = container.querySelector('.all-pill');
    expect(allPill?.classList.contains('pills-locked')).toBe(true);

    const themePills = container.querySelectorAll('.theme-pill');
    for (const pill of themePills) {
      expect(pill.classList.contains('pills-locked')).toBe(true);
    }
  });

  it('clicking active Today\'s Focus chip calls onTodayFocusToggle', async () => {
    const onTodayFocusToggle = vi.fn();
    await renderBar({
      todayFocusThemeId: 'HF',
      todayFocusActive: true,
      onTodayFocusToggle,
    });

    const chip = container.querySelector<HTMLButtonElement>('.today-focus-pill');
    chip!.click();
    await tick();

    expect(onTodayFocusToggle).toHaveBeenCalledOnce();
  });

  it('clicking disabled chip does not call onTodayFocusToggle', async () => {
    const onTodayFocusToggle = vi.fn();
    await renderBar({
      todayFocusThemeId: null,
      todayFocusActive: false,
      onTodayFocusToggle,
    });

    const chip = container.querySelector<HTMLButtonElement>('.today-focus-pill');
    chip!.click();
    await tick();

    expect(onTodayFocusToggle).not.toHaveBeenCalled();
  });

  it('does not render Today\'s Focus chip when onTodayFocusToggle not provided', async () => {
    await renderBar();

    const chip = container.querySelector('.today-focus-pill');
    expect(chip).toBeNull();
  });

  it('pills are not locked when Today\'s Focus is inactive', async () => {
    await renderBar({
      todayFocusThemeId: 'HF',
      todayFocusActive: false,
      onTodayFocusToggle: () => {},
    });

    const allPill = container.querySelector('.all-pill');
    expect(allPill?.classList.contains('pills-locked')).toBe(false);

    const themePills = container.querySelectorAll('.theme-pill');
    for (const pill of themePills) {
      expect(pill.classList.contains('pills-locked')).toBe(false);
    }
  });
});
