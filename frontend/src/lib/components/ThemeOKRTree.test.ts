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

    it('theme checkbox toggle does not expand tree', async () => {
      const onThemeChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        onThemeSelectionChange: onThemeChange,
      }});
      await tick();

      const checkbox = container.querySelector<HTMLInputElement>('.tree-theme-item input[type="checkbox"]');
      checkbox!.click();
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-item');
      expect(objectives.length).toBe(0);
    });

    it('initialSelectExpandedIds prop is respected', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
      }});
      await tick();

      const objectives = container.querySelectorAll('.tree-objective-item');
      expect(objectives.length).toBeGreaterThan(0);
      expect(container.querySelector('.tree-objective-item .tree-item-name')?.textContent).toBe('Exercise');
      const krNames = container.querySelectorAll('.tree-kr-item .tree-item-name');
      expect(krNames.length).toBe(1);
      expect(krNames[0]?.textContent).toBe('Run 3x/week');
    });

    it('onSelectExpandedIdsChange fires on expand click', async () => {
      const onExpandChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        onSelectExpandedIdsChange: onExpandChange,
      }});
      await tick();

      const expandBtn = container.querySelector<HTMLButtonElement>('.tree-expand-button');
      expandBtn!.click();
      await tick();

      expect(onExpandChange).toHaveBeenCalledOnce();
      expect(onExpandChange).toHaveBeenCalledWith(['T1']);
    });

    it('OKR checkbox toggle does not affect fold state', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
      }});
      await tick();

      // Verify tree is expanded before toggling OKR
      const objectivesBefore = container.querySelectorAll('.tree-objective-item');
      expect(objectivesBefore.length).toBeGreaterThan(0);

      const objCheckbox = container.querySelector<HTMLInputElement>('.tree-objective-item input[type="checkbox"]');
      objCheckbox!.click();
      await tick();

      // Tree should still be expanded
      const objectivesAfter = container.querySelectorAll('.tree-objective-item');
      expect(objectivesAfter.length).toBe(objectivesBefore.length);
      const krNames = container.querySelectorAll('.tree-kr-item .tree-item-name');
      expect(krNames.length).toBe(1);
    });

    it('hides archived objectives', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
      }});
      await tick();

      const names = Array.from(container.querySelectorAll('.tree-objective-item .tree-item-name'))
        .map(el => el.textContent);
      expect(names).toContain('Exercise');
      expect(names).not.toContain('Archived Goal');
    });

    it('hides completed objectives', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T2'],
      }});
      await tick();

      const names = Array.from(container.querySelectorAll('.tree-objective-item .tree-item-name'))
        .map(el => el.textContent);
      expect(names).not.toContain('Promotion');
    });

    it('hides completed key results', async () => {
      const themes = makeThemes();
      // Add a completed KR under an active objective
      themes[0].objectives[0].keyResults.push({
        id: 'T1-O1-KR2', parentId: 'T1-O1', description: 'Completed KR', status: 'completed',
      });
      render(ThemeOKRTree, { target: container, props: {
        themes, mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
      }});
      await tick();

      const krNames = Array.from(container.querySelectorAll('.tree-kr-item .tree-item-name'))
        .map(el => el.textContent);
      expect(krNames).toContain('Run 3x/week');
      expect(krNames).not.toContain('Completed KR');
    });

    it('excludes completed OKRs from collectOkrIds when unchecking theme', async () => {
      const onThemeChange = vi.fn();
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T2'],
        selectedOkrIds: ['T2-O1'],
        onThemeSelectionChange: onThemeChange,
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      // Uncheck theme T2 — completed OKRs should not be in collectOkrIds,
      // so selectedOkrIds should remain unchanged (T2-O1 is completed, not collected)
      const themeCheckboxes = container.querySelectorAll<HTMLInputElement>('.tree-theme-item input[type="checkbox"]');
      // T2 is the second theme
      themeCheckboxes[1]!.click();
      await tick();

      expect(onThemeChange).toHaveBeenCalledWith([]);
      // T2-O1 is completed so collectOkrIds won't include it — selectedOkrIds stays ['T2-O1']
      // Since no OKR ids were removed, onOkrChange should not be called
      expect(onOkrChange).not.toHaveBeenCalled();
    });

    it('renders KR checkboxes under expanded theme', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
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
        initialSelectExpandedIds: ['T1', 'T1-O1'],
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
        initialSelectExpandedIds: ['T1', 'T1-O1'],
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

    it('auto-selects parent objective and theme when checking a KR', async () => {
      const onThemeChange = vi.fn();
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
        onThemeSelectionChange: onThemeChange,
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      const krCheckbox = container.querySelector<HTMLInputElement>('.tree-kr-item input[type="checkbox"]');
      krCheckbox!.click();
      await tick();

      expect(onOkrChange).toHaveBeenCalledWith(['T1-O1-KR1', 'T1-O1']);
      expect(onThemeChange).toHaveBeenCalledWith(['T1']);
    });

    it('auto-selects ancestor objectives and theme when checking a nested objective', async () => {
      const onThemeChange = vi.fn();
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
        onThemeSelectionChange: onThemeChange,
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      // Find the Child Objective checkbox using direct child selector to skip KR checkboxes
      const objCheckboxes = container.querySelectorAll<HTMLInputElement>('.tree-objective-item > .tree-item-header > .tree-checkbox-label > input[type="checkbox"]');
      // First is Exercise (T1-O1), second is Child Objective (T1-O1-C1)
      objCheckboxes[1]!.click();
      await tick();

      expect(onOkrChange).toHaveBeenCalledWith(['T1-O1-C1', 'T1-O1']);
      expect(onThemeChange).toHaveBeenCalledWith(['T1']);
    });

    it('does not duplicate already-selected ancestors when checking a KR', async () => {
      const onThemeChange = vi.fn();
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
        selectedOkrIds: ['T1-O1'],
        initialSelectExpandedIds: ['T1', 'T1-O1'],
        onThemeSelectionChange: onThemeChange,
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      const krCheckbox = container.querySelector<HTMLInputElement>('.tree-kr-item input[type="checkbox"]');
      krCheckbox!.click();
      await tick();

      expect(onOkrChange).toHaveBeenCalledWith(['T1-O1', 'T1-O1-KR1']);
      expect(onThemeChange).not.toHaveBeenCalled();
    });

    it('unchecking a KR leaves ancestors selected', async () => {
      const onThemeChange = vi.fn();
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        selectedThemeIds: ['T1'],
        selectedOkrIds: ['T1-O1', 'T1-O1-KR1'],
        initialSelectExpandedIds: ['T1', 'T1-O1'],
        onThemeSelectionChange: onThemeChange,
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      const krCheckbox = container.querySelector<HTMLInputElement>('.tree-kr-item input[type="checkbox"]');
      krCheckbox!.click();
      await tick();

      expect(onOkrChange).toHaveBeenCalledWith(['T1-O1']);
      expect(onThemeChange).not.toHaveBeenCalled();
    });

    it('checking a theme does not auto-select children', async () => {
      const onThemeChange = vi.fn();
      const onOkrChange = vi.fn();
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        onThemeSelectionChange: onThemeChange,
        onOkrSelectionChange: onOkrChange,
      }});
      await tick();

      const themeCheckbox = container.querySelector<HTMLInputElement>('.tree-theme-item input[type="checkbox"]');
      themeCheckbox!.click();
      await tick();

      expect(onThemeChange).toHaveBeenCalledWith(['T1']);
      expect(onOkrChange).not.toHaveBeenCalled();
    });

    it('renders recursive child objectives', async () => {
      render(ThemeOKRTree, { target: container, props: {
        themes: makeThemes(), mode: 'select' as const,
        initialSelectExpandedIds: ['T1', 'T1-O1'],
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
