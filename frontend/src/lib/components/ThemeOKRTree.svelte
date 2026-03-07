<script lang="ts">
  /**
   * ThemeOKRTree Component
   *
   * Renders a theme/objective/key-result hierarchy tree.
   * Supports two modes:
   * - 'select': Checkboxes for theme and OKR selection (used in CalendarView)
   * - 'edit': CRUD actions for theme/objective/KR management (used in OKRView)
   */

  import { SvelteSet } from 'svelte/reactivity';
  import type { LifeTheme, Objective, KeyResult } from '../../lib/wails-mock';
  import ThemeBadge from './ThemeBadge.svelte';

  interface Props {
    themes: LifeTheme[];
    mode: 'select' | 'edit';

    // Select mode
    selectedThemeIds?: string[];
    selectedOkrIds?: string[];
    onThemeSelectionChange?: (themeIds: string[]) => void;
    onOkrSelectionChange?: (okrIds: string[]) => void;
  }

  let {
    themes,
    mode,
    selectedThemeIds = [],
    selectedOkrIds = [],
    onThemeSelectionChange,
    onOkrSelectionChange,
  }: Props = $props();

  // Internal expand/collapse state
  let expandedIds = new SvelteSet<string>();

  function toggleExpanded(id: string) {
    if (expandedIds.has(id)) expandedIds.delete(id);
    else expandedIds.add(id);
  }

  // --- Select mode helpers ---

  function collectOkrIds(theme: LifeTheme): string[] {
    const ids: string[] = [];
    function walkObjectives(objectives: Objective[]) {
      for (const obj of objectives) {
        if (obj.status === 'archived') continue;
        ids.push(obj.id);
        for (const kr of obj.keyResults) {
          if (kr.status !== 'archived') ids.push(kr.id);
        }
        if (obj.objectives) walkObjectives(obj.objectives);
      }
    }
    walkObjectives(theme.objectives);
    return ids;
  }

  function handleThemeToggle(themeId: string) {
    const isSelected = selectedThemeIds.includes(themeId);
    let newThemeIds: string[];
    let newOkrIds = [...selectedOkrIds];

    if (isSelected) {
      newThemeIds = selectedThemeIds.filter(id => id !== themeId);
      // Clear OKR selections for this theme
      const theme = themes.find(t => t.id === themeId);
      if (theme) {
        const themeOkrIds = new Set(collectOkrIds(theme));
        newOkrIds = newOkrIds.filter(id => !themeOkrIds.has(id));
      }
      expandedIds.delete(themeId);
    } else {
      newThemeIds = [...selectedThemeIds, themeId];
      expandedIds.add(themeId);
    }

    onThemeSelectionChange?.(newThemeIds);
    if (newOkrIds.length !== selectedOkrIds.length) {
      onOkrSelectionChange?.(newOkrIds);
    }
  }

  function handleOkrToggle(id: string) {
    const isSelected = selectedOkrIds.includes(id);
    const newOkrIds = isSelected
      ? selectedOkrIds.filter(x => x !== id)
      : [...selectedOkrIds, id];
    onOkrSelectionChange?.(newOkrIds);
  }
</script>

<div class="theme-okr-tree">
  {#each themes as theme (theme.id)}
    <div class="tree-theme-item" style="--tree-theme-color: {theme.color};">
      <div class="tree-item-header tree-theme-header">
        {#if mode === 'select'}
          <label class="tree-checkbox-label">
            <input
              type="checkbox"
              checked={selectedThemeIds.includes(theme.id)}
              onchange={() => handleThemeToggle(theme.id)}
            />
            <ThemeBadge color={theme.color} size="sm" />
            <span class="tree-item-name">{theme.name}</span>
          </label>
        {:else}
          <button
            class="tree-expand-button"
            onclick={() => toggleExpanded(theme.id)}
            aria-expanded={expandedIds.has(theme.id)}
          >
            <span class="tree-expand-icon">{expandedIds.has(theme.id) ? '\u25BC' : '\u25B6'}</span>
          </button>
          <ThemeBadge color={theme.color} size="sm" />
          <span class="tree-item-name">{theme.name}</span>
        {/if}
      </div>

      {#if (mode === 'select' && selectedThemeIds.includes(theme.id)) || (mode === 'edit' && expandedIds.has(theme.id))}
        <div class="tree-children">
          {#each theme.objectives as objective (objective.id)}
            {@render objectiveNode(objective, theme.color, 0)}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

{#snippet objectiveNode(objective: Objective, themeColor: string, depth: number)}
  {#if objective.status !== 'archived'}
    <div class="tree-objective-item" style="padding-left: {depth * 1.5}rem;">
      <div class="tree-item-header">
        {#if mode === 'select'}
          <label class="tree-checkbox-label">
            <input
              type="checkbox"
              checked={selectedOkrIds.includes(objective.id)}
              onchange={() => handleOkrToggle(objective.id)}
            />
            <span class="tree-marker tree-marker-obj" style="background-color: {themeColor};"></span>
            <span class="tree-item-name">{objective.title}</span>
          </label>
        {:else}
          <button
            class="tree-expand-button"
            onclick={() => toggleExpanded(objective.id)}
            aria-expanded={expandedIds.has(objective.id)}
          >
            <span class="tree-expand-icon">{expandedIds.has(objective.id) ? '\u25BC' : '\u25B6'}</span>
          </button>
          <span class="tree-marker tree-marker-obj" style="background-color: {themeColor};"></span>
          <span class="tree-item-name">{objective.title}</span>
        {/if}
      </div>

      {#if mode === 'select' || expandedIds.has(objective.id)}
        <div class="tree-children" style="padding-left: {mode === 'select' ? 0 : 1.5}rem;">
          {#each objective.keyResults as kr (kr.id)}
            {@render keyResultNode(kr, themeColor, depth)}
          {/each}
          {#if objective.objectives}
            {#each objective.objectives as child (child.id)}
              {@render objectiveNode(child, themeColor, depth + 1)}
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet keyResultNode(kr: KeyResult, themeColor: string, depth: number)}
  {#if kr.status !== 'archived'}
    <div class="tree-kr-item" style="padding-left: {mode === 'select' ? (depth + 1) * 1.5 : 0}rem;">
      <div class="tree-item-header">
        {#if mode === 'select'}
          <label class="tree-checkbox-label">
            <input
              type="checkbox"
              checked={selectedOkrIds.includes(kr.id)}
              onchange={() => handleOkrToggle(kr.id)}
            />
            <span class="tree-marker tree-marker-kr" style="background-color: {themeColor};"></span>
            <span class="tree-item-name">{kr.description}</span>
          </label>
        {:else}
          <span class="tree-marker tree-marker-kr" style="background-color: {themeColor};"></span>
          <span class="tree-item-name">{kr.description}</span>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<style>
  .theme-okr-tree {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tree-theme-item {
    border-left: 3px solid var(--tree-theme-color, var(--color-gray-300));
    padding-left: 0.5rem;
  }

  .tree-item-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    min-height: 1.75rem;
  }

  .tree-theme-header {
    font-weight: 500;
  }

  .tree-checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .tree-item-name {
    font-size: 0.875rem;
  }

  .tree-expand-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .tree-expand-icon {
    font-size: 0.625rem;
    color: var(--color-gray-500);
  }

  .tree-children {
    display: flex;
    flex-direction: column;
  }

  .tree-marker {
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tree-marker-obj {
    width: 8px;
    height: 8px;
  }

  .tree-marker-kr {
    width: 6px;
    height: 6px;
    opacity: 0.6;
  }
</style>
