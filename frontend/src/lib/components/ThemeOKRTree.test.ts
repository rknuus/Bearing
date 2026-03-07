import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import ThemeOKRTree from './ThemeOKRTree.svelte';
import type { LifeTheme } from '../../lib/wails-mock';

function makeThemes(): LifeTheme[] {
  return [{
    id: 'T1', name: 'Health', color: '#22c55e',
    objectives: [
      {
        id: 'T1-O1', parentId: 'T1', title: 'Exercise', status: 'active',
        keyResults: [
          { id: 'T1-O1-KR1', parentId: 'T1-O1', description: 'Run 3x/week', status: 'active' },
        ],
        objectives: [{
          id: 'T1-O1-C1', parentId: 'T1-O1', title: 'Child Objective', status: 'active',
          keyResults: [], objectives: [],
        }],
      },
      {
        id: 'T1-O2', parentId: 'T1', title: 'Archived Goal', status: 'archived',
        keyResults: [], objectives: [],
      },
    ],
  }, {
    id: 'T2', name: 'Career', color: '#3b82f6',
    objectives: [{
      id: 'T2-O1', parentId: 'T2', title: 'Promotion', status: 'completed',
      keyResults: [
        { id: 'T2-O1-KR1', parentId: 'T2-O1', description: 'Lead project', status: 'completed' },
      ],
    }],
  }];
}

describe('ThemeOKRTree', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('select mode', () => {
    it('renders theme checkboxes', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
      }});
      await tick();

      const checkboxes = container.querySelectorAll('.tree-theme-item input[type="checkbox"]');
      expect(checkboxes.length).toBe(2);
      const names = container.querySelectorAll('.tree-theme-header .tree-item-name');
      expect(names[0]?.textContent).toBe('Health');
      expect(names[1]?.textContent).toBe('Career');
    });

    it('calls onThemeSelectionChange when checking a theme', async () => {
      const onThemeChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        onThemeSelectionChange: onThemeChange,
      }});
      await tick();

      const checkbox = container.querySelector<HTMLInputElement>('.tree-theme-item input[type="checkbox"]');
      checkbox!.click();
      await tick();

      expect(onThemeChange).toHaveBeenCalledWith(['T1']);
    });

    it('auto-expands theme to show objectives when checked', async () => {
      const onThemeChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
        onThemeSelectionChange: onThemeChange,
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-item');
      expect(objectives.length).toBeGreaterThan(0);
      expect(container.querySelector('.tree-objective-item .tree-item-name')?.textContent).toBe('Exercise');
    });

    it('hides archived objectives', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
      }});
      await tick();

      const names = Array.from(container.querySelectorAll('.tree-objective-item .tree-item-name'))
        .map(el => el.textContent);
      expect(names).toContain('Exercise');
      expect(names).not.toContain('Archived Goal');
    });

    it('renders KR checkboxes under selected theme', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
      }});
      await tick();

      const krNames = container.querySelectorAll('.tree-kr-item .tree-item-name');
      expect(krNames.length).toBe(1);
      expect(krNames[0]?.textContent).toBe('Run 3x/week');
    });

    it('calls onOkrSelectionChange when toggling OKR', async () => {
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      const objCheckbox = container.querySelector<HTMLInputElement>('.tree-objective-item input[type="checkbox"]');
      objCheckbox!.click();
      await tick();

      expect(onOkrChange).toHaveBeenCalledWith(['T1-O1']);
    });

    it('clears OKR selections when unchecking theme', async () => {
      const onThemeChange = vi.fn();
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
        selectedOkrIds: ['T1-O1', 'T1-O1-KR1'],
        onThemeSelectionChange: onThemeChange,
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      const themeCheckbox = container.querySelector<HTMLInputElement>('.tree-theme-item input[type="checkbox"]');
      themeCheckbox!.click();
      await tick();

      expect(onThemeChange).toHaveBeenCalledWith([]);
      expect(onOkrChange).toHaveBeenCalledWith([]);
    });

    it('renders recursive child objectives', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
      }});
      await tick();

      const names = Array.from(container.querySelectorAll('.tree-objective-item .tree-item-name'))
        .map(el => el.textContent);
      expect(names).toContain('Child Objective');
    });
  });

  describe('edit mode', () => {
    it('renders theme containers with edit styling', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(),
      }});
      await tick();

      const editThemes = container.querySelectorAll('.tree-theme-edit');
      expect(editThemes.length).toBe(2);
    });

    it('shows no checkboxes in edit mode', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T1']),
      }});
      await tick();

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(0);
    });

    it('renders expanded theme children when expandedIds includes theme', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T1']),
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-edit');
      expect(objectives.length).toBeGreaterThan(0);
    });

    it('does not render children for collapsed theme', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(),
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-edit');
      expect(objectives.length).toBe(0);
    });

    it('hides completed objectives when showCompleted is false', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T2']),
        showCompleted: false,
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-edit');
      expect(objectives.length).toBe(0);
    });

    it('shows completed objectives when showCompleted is true', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T2']),
        showCompleted: true,
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-edit');
      expect(objectives.length).toBe(1);
    });

    it('hides archived objectives even when showCompleted is true', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T1', 'T1-O1']),
        showCompleted: true,
        showArchived: false,
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-edit');
      // T1 has Exercise (active) + Child Objective (active, nested under T1-O1)
      // Archived Goal is hidden
      expect(objectives.length).toBe(2);
    });

    it('applies tree-highlighted class on matching theme', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(),
        highlightItemId: 'T1',
      }});
      await tick();

      const highlighted = container.querySelector('.tree-highlighted');
      expect(highlighted).toBeTruthy();
    });

    it('applies tree-highlighted class on matching objective', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T1']),
        highlightItemId: 'T1-O1',
      }});
      await tick();

      const highlighted = container.querySelectorAll('.tree-highlighted');
      expect(highlighted.length).toBe(1);
      expect(highlighted[0]?.classList.contains('tree-objective-edit')).toBe(true);
    });

    it('renders KR containers when objective is expanded', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T1', 'T1-O1']),
      }});
      await tick();

      const krs = container.querySelectorAll('.tree-kr-edit');
      expect(krs.length).toBe(1);
    });

    it('renders recursive objectives in edit mode', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'edit' as const,
        expandedIds: new SvelteSet<string>(['T1', 'T1-O1']),
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-edit');
      // Exercise + Child Objective
      expect(objectives.length).toBe(2);
    });
  });
});
