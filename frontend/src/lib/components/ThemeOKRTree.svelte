<script lang="ts">
  /**
   * ThemeOKRTree Component
   *
   * Renders a theme/objective/key-result hierarchy tree.
   * Supports two modes:
   * - 'select': Checkboxes for theme and OKR selection (used in CalendarView)
   * - 'edit': CRUD actions for theme/objective/KR management (used in OKRView)
   *
   * In edit mode, content rendering is delegated to parent via snippet props:
   * - themeHeader: Theme header content (expand button, badge, name/edit, actions)
   * - themeExtra: Extra content in expanded theme (add objective form, empty state)
   * - objectiveHeader: Objective header content (expand button, marker, title/edit, actions)
   * - objectiveExtra: Extra content in expanded objective (forms, empty state)
   * - keyResultItem: Key result content (marker, description/edit, progress, actions)
   */

  import type { Snippet } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { LifeTheme, Objective, KeyResult } from '../../lib/wails-mock';
  import ThemeBadge from './ThemeBadge.svelte';
  import TagBadges from './TagBadges.svelte';

  interface Props {
    themes: LifeTheme[];
    mode: 'select' | 'edit';

    // Select mode
    selectedThemeIds?: string[];
    selectedOkrIds?: string[];
    onThemeSelectionChange?: (themeIds: string[]) => void;
    onOkrSelectionChange?: (okrIds: string[]) => void;
    initialSelectExpandedIds?: string[];
    onSelectExpandedIdsChange?: (ids: string[]) => void;

    // Edit mode
    expandedIds?: SvelteSet<string>;
    showCompleted?: boolean;
    showArchived?: boolean;
    highlightItemId?: string;
    themeHeader?: Snippet<[LifeTheme]>;
    themeExtra?: Snippet<[LifeTheme]>;
    objectiveHeader?: Snippet<[Objective, string]>;
    objectiveExtra?: Snippet<[Objective]>;
    keyResultItem?: Snippet<[KeyResult, string]>;
  }

  let {
    themes,
    mode,
    selectedThemeIds = [],
    selectedOkrIds = [],
    onThemeSelectionChange,
    onOkrSelectionChange,
    initialSelectExpandedIds,
    onSelectExpandedIdsChange,
    expandedIds,
    showCompleted = false,
    showArchived = false,
    highlightItemId,
    themeHeader,
    themeExtra,
    objectiveHeader,
    objectiveExtra,
    keyResultItem,
  }: Props = $props();

  // Internal expand/collapse state (select mode only)
  let selectExpandedIds = new SvelteSet<string>(initialSelectExpandedIds ?? []);

  // --- Select mode helpers ---

  function toggleSelectExpanded(id: string) {
    if (selectExpandedIds.has(id)) selectExpandedIds.delete(id);
    else selectExpandedIds.add(id);
    onSelectExpandedIdsChange?.([...selectExpandedIds]);
  }

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
      const theme = themes.find(t => t.id === themeId);
      if (theme) {
        const themeOkrIds = new Set(collectOkrIds(theme));
        newOkrIds = newOkrIds.filter(id => !themeOkrIds.has(id));
      }
    } else {
      newThemeIds = [...selectedThemeIds, themeId];
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

  // --- Edit mode helpers ---

  function isActiveStatus(status: string | undefined): boolean {
    return !status || status === 'active';
  }

  function shouldShowStatus(status: string | undefined): boolean {
    if (isActiveStatus(status)) return true;
    if (status === 'completed') return showCompleted;
    if (status === 'archived') return showArchived;
    return true;
  }
</script>

<div class="theme-okr-tree" class:tree-edit={mode === 'edit'}>
  {#each themes as theme (theme.id)}
    {#if mode === 'select'}
      <div class="tree-theme-item" style="--tree-theme-color: {theme.color};">
        <div class="tree-item-header tree-theme-header">
          <button
            class="tree-expand-button"
            onclick={() => toggleSelectExpanded(theme.id)}
            aria-expanded={selectExpandedIds.has(theme.id)}
          >
            <span class="tree-expand-icon">{selectExpandedIds.has(theme.id) ? '\u25BC' : '\u25B6'}</span>
          </button>
          <ThemeBadge color={theme.color} size="sm" />
          <span class="tree-item-name">{theme.name}</span>
          <span class="tree-item-id">{theme.id}</span>
          <label class="tree-checkbox-label">
            <input
              type="checkbox"
              checked={selectedThemeIds.includes(theme.id)}
              onchange={() => handleThemeToggle(theme.id)}
            />
          </label>
        </div>

        {#if selectExpandedIds.has(theme.id)}
          <div class="tree-children">
            {#each theme.objectives as objective (objective.id)}
              {#if objective.status !== 'archived'}
                {@render selectObjectiveNode(objective, theme.color, 0)}
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="tree-theme-item tree-theme-edit"
        class:tree-highlighted={highlightItemId === theme.id}
        style="--tree-theme-color: {theme.color};">
        {#if themeHeader}
          {@render themeHeader(theme)}
        {/if}

        {#if expandedIds?.has(theme.id)}
          <div class="tree-children tree-children-edit">
            {#if themeExtra}
              {@render themeExtra(theme)}
            {/if}
            {#each theme.objectives as objective (objective.id)}
              {@render editObjectiveNode(objective, theme.color, 0)}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

{#snippet selectObjectiveNode(objective: Objective, themeColor: string, depth: number)}
  {@const hasChildren = objective.keyResults.some(kr => kr.status !== 'archived') ||
    (objective.objectives?.some(o => o.status !== 'archived') ?? false)}
  <div class="tree-objective-item" style="padding-left: {depth * 1.5}rem;">
    <div class="tree-item-header">
      {#if hasChildren}
        <button
          class="tree-expand-button"
          onclick={() => toggleSelectExpanded(objective.id)}
          aria-expanded={selectExpandedIds.has(objective.id)}
        >
          <span class="tree-expand-icon">{selectExpandedIds.has(objective.id) ? '\u25BC' : '\u25B6'}</span>
        </button>
      {:else}
        <span class="tree-expand-spacer"></span>
      {/if}
      <span class="tree-marker tree-marker-obj" style="background-color: {themeColor};"></span>
      <span class="tree-item-name">{objective.title}</span>
      <span class="tree-item-id">{objective.id}</span>
      <TagBadges tags={objective.tags} />
      <label class="tree-checkbox-label">
        <input
          type="checkbox"
          checked={selectedOkrIds.includes(objective.id)}
          onchange={() => handleOkrToggle(objective.id)}
        />
      </label>
    </div>
    {#if hasChildren && selectExpandedIds.has(objective.id)}
      <div class="tree-children">
        {#each objective.keyResults as kr (kr.id)}
          {#if kr.status !== 'archived'}
            {@render selectKeyResultNode(kr, themeColor, depth)}
          {/if}
        {/each}
        {#if objective.objectives}
          {#each objective.objectives as child (child.id)}
            {#if child.status !== 'archived'}
              {@render selectObjectiveNode(child, themeColor, depth + 1)}
            {/if}
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet selectKeyResultNode(kr: KeyResult, themeColor: string, depth: number)}
  <div class="tree-kr-item" style="padding-left: {(depth + 1) * 1.5}rem;">
    <div class="tree-item-header">
      <span class="tree-expand-spacer"></span>
      <span class="tree-marker tree-marker-kr" style="background-color: {themeColor};"></span>
      <span class="tree-item-name">{kr.description}</span>
      <span class="tree-item-id">{kr.id}</span>
      <label class="tree-checkbox-label">
        <input
          type="checkbox"
          checked={selectedOkrIds.includes(kr.id)}
          onchange={() => handleOkrToggle(kr.id)}
        />
      </label>
    </div>
  </div>
{/snippet}

{#snippet editObjectiveNode(objective: Objective, themeColor: string, depth: number)}
  {#if shouldShowStatus(objective.status)}
    <div class="tree-objective-item tree-objective-edit"
      class:tree-highlighted={highlightItemId === objective.id}
      style="margin-left: {depth > 0 ? 0.5 : 0}rem;">
      {#if objectiveHeader}
        {@render objectiveHeader(objective, themeColor)}
      {/if}

      {#if expandedIds?.has(objective.id)}
        <div class="tree-children tree-children-edit" style="padding-left: 1.5rem;">
          {#if objectiveExtra}
            {@render objectiveExtra(objective)}
          {/if}

          {#if objective.objectives && objective.objectives.length > 0}
            {#each objective.objectives as child (child.id)}
              {@render editObjectiveNode(child, themeColor, depth + 1)}
            {/each}
          {/if}

          {#each objective.keyResults as kr (kr.id)}
            {#if shouldShowStatus(kr.status)}
              <div class="tree-kr-item tree-kr-edit"
                class:tree-highlighted={highlightItemId === kr.id}>
                {#if keyResultItem}
                  {@render keyResultItem(kr, themeColor)}
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<style>
  /* Base */
  .theme-okr-tree {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .theme-okr-tree.tree-edit {
    gap: 0.5rem;
  }

  .tree-children {
    display: flex;
    flex-direction: column;
  }

  /* Select mode */
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

  .tree-expand-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    width: 1.25rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-gray-500);
    font-size: 0.625rem;
  }

  .tree-expand-spacer {
    width: 1.25rem;
    flex-shrink: 0;
  }

  .tree-checkbox-label {
    cursor: pointer;
    flex-shrink: 0;
  }

  .tree-item-name {
    font-size: 0.875rem;
    flex: 1;
    min-width: 0;
  }

  .tree-item-id {
    font-size: 0.75rem;
    color: var(--color-gray-400);
    flex-shrink: 0;
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

  /* Edit mode containers */
  .tree-theme-edit {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 8px;
    overflow: hidden;
    border-left: 4px solid var(--tree-theme-color);
    padding-left: 0;
  }

  .tree-children-edit {
    padding-left: 2rem;
    padding-bottom: 0.5rem;
  }

  .tree-objective-edit {
    border-left: 2px solid var(--color-gray-200);
    margin-left: 0.5rem;
  }

  .tree-kr-edit {
    border-left: 1px dashed var(--color-gray-300);
    margin-left: 0.5rem;
  }

  .tree-highlighted {
    background-color: var(--color-warning-100);
    animation: tree-highlight-pulse 2s ease-out;
  }

  @keyframes tree-highlight-pulse {
    0% {
      background-color: #fde68a;
    }
    100% {
      background-color: var(--color-warning-100);
    }
  }
</style>
