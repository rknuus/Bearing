<script lang="ts">
  /**
   * OKRView Component
   *
   * Displays the hierarchical OKR structure with Life Themes, Objectives, and Key Results.
   * Supports CRUD operations with accordion-style expansion and inline editing.
   * Objectives are rendered recursively to support arbitrary nesting depth.
   */

  import { onMount, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { Button, ErrorBanner, TagBadges, TagEditor } from '../lib/components';
  import ThemeBadge from '../lib/components/ThemeBadge.svelte';
  import TagFilterBar from '../components/TagFilterBar.svelte';
  import { getBindings, extractError } from '../lib/utils/bindings';
  import { checkStateFromData } from '../lib/utils/state-check';

  // Props for cross-view navigation
  interface Props {
    onNavigateToCalendar?: (date?: string, themeId?: string) => void;
    onNavigateToTasks?: (options?: { themeId?: string; date?: string }) => void;
    highlightItemId?: string;
  }

  let { onNavigateToCalendar, onNavigateToTasks, highlightItemId }: Props = $props();

  // Types matching the Go structs
  interface KeyResult {
    id: string;
    parentId?: string;
    description: string;
    status?: string;
    startValue?: number;
    currentValue?: number;
    targetValue?: number;
  }

  interface Objective {
    id: string;
    parentId?: string;
    title: string;
    status?: string;
    tags?: string[];
    keyResults: KeyResult[];
    objectives?: Objective[];
  }

  interface LifeTheme {
    id: string;
    name: string;
    color: string;
    objectives: Objective[];
  }

  // Predefined color palette for theme selection
  const COLOR_PALETTE = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#f97316', // Orange
    '#6366f1', // Indigo
  ];

  // State
  let themes = $state<LifeTheme[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Unified expansion state for themes and objectives at any depth
  let expandedIds = new SvelteSet<string>();

  // Editing state
  let editingThemeId = $state<string | null>(null);
  let editingObjectiveId = $state<string | null>(null);
  let editingKeyResultId = $state<string | null>(null);

  // Form state for new items
  let showNewThemeForm = $state(false);
  let newThemeName = $state('');
  let newThemeColor = $state(COLOR_PALETTE[0]);

  // addingObjectiveTo can be a theme ID or an objective ID
  let addingObjectiveTo = $state<string | null>(null);
  let newObjectiveTitle = $state('');

  let addingKeyResultToObjective = $state<string | null>(null);
  let newKeyResultDescription = $state('');
  let newKeyResultStartValue = $state(0);
  let newKeyResultTargetValue = $state(1);

  // View toggle state
  let showCompleted = $state(false);
  let showArchived = $state(false);

  // Tag filter state (local only, not persisted)
  let filterTagIds: string[] = $state([]);

  /** Collect unique tags from all objectives across all themes. */
  const availableObjectiveTags = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local temporary set, not reactive state
    const tags = new Set<string>();
    function walkObjectiveTags(objectives: Objective[]) {
      for (const obj of objectives) {
        for (const tag of obj.tags ?? []) tags.add(tag);
        walkObjectiveTags(obj.objectives ?? []);
      }
    }
    for (const theme of themes) walkObjectiveTags(theme.objectives);
    return [...tags].sort();
  });

  /** Recursively filter objectives: keep those matching tags, their ancestors, and their children. */
  function filterObjectives(objectives: Objective[], activeTagIds: string[]): Objective[] {
    const result: Objective[] = [];
    for (const obj of objectives) {
      const ownMatch = (obj.tags ?? []).some(t => activeTagIds.includes(t));
      if (ownMatch) {
        // Parent matches → show all children unchanged
        result.push(obj);
      } else {
        // Check if any descendant matches
        const filteredChildren = filterObjectives(obj.objectives ?? [], activeTagIds);
        if (filteredChildren.length > 0) {
          // Descendant matches → include this parent with filtered children, keep all KRs
          result.push({ ...obj, objectives: filteredChildren });
        }
      }
    }
    return result;
  }

  /** Themes with objectives filtered by active tags. */
  const filteredThemes = $derived.by(() => {
    if (filterTagIds.length === 0) return themes;
    const result: LifeTheme[] = [];
    for (const theme of themes) {
      const filtered = filterObjectives(theme.objectives, filterTagIds);
      if (filtered.length > 0) {
        result.push({ ...theme, objectives: filtered });
      }
    }
    return result;
  });

  function handleFilterTagToggle(tag: string) {
    if (filterTagIds.includes(tag)) {
      filterTagIds = filterTagIds.filter(t => t !== tag);
    } else {
      filterTagIds = [...filterTagIds, tag];
    }
  }

  function handleFilterTagClear() {
    filterTagIds = [];
  }

  // Inline edit values
  let editThemeName = $state('');
  let editThemeColor = $state('');
  let editObjectiveTitle = $state('');
  let editObjectiveTags = $state<string[]>([]);
  let editKeyResultDescription = $state('');
  let editKeyResultStartValue = $state(0);
  let editKeyResultTargetValue = $state(0);

  // Available tags for objective editing (unified from objectives + tasks + day focus)
  let availableTags = $state<string[]>([]);

  // Toggle expansion for any ID (theme or objective)
  function toggleExpanded(id: string) {
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
    } else {
      expandedIds.add(id);
    }
  }

  // Helper to expand an ID (without toggling)
  function expandId(id: string) {
    expandedIds.add(id);
  }

  /**
   * Collect ancestor IDs for a given entity by walking the parentId chain.
   * Searches themes, objectives, and key results. Returns ancestor IDs
   * from the entity itself up to (and including) the root theme.
   */
  function collectAncestorIds(entityId: string, themesList: LifeTheme[]): string[] {
    // Build a parentId lookup map from the theme tree
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local temporary map, not reactive state
    const parentMap = new Map<string, string>();
    function walkObjectives(objectives: Objective[], fallbackParentId: string) {
      for (const obj of objectives) {
        parentMap.set(obj.id, obj.parentId ?? fallbackParentId);
        for (const kr of obj.keyResults) {
          parentMap.set(kr.id, kr.parentId ?? obj.id);
        }
        walkObjectives(obj.objectives ?? [], obj.id);
      }
    }
    for (const theme of themesList) {
      walkObjectives(theme.objectives, theme.id);
    }

    // Walk up the parentId chain collecting ancestor IDs
    const ancestors: string[] = [];
    let currentId: string | undefined = entityId;
    while (currentId) {
      ancestors.push(currentId);
      currentId = parentMap.get(currentId);
    }
    return ancestors;
  }

  // API calls
  async function loadThemes() {
    loading = true;
    error = null;
    try {
      themes = await getBindings().GetThemes();
    } catch (e) {
      error = extractError(e);
      console.error('Failed to load themes:', e);
    } finally {
      loading = false;
    }
  }

  const THEME_FIELDS = ['id', 'name', 'color'];
  const OBJECTIVE_FIELDS = ['id', 'parentId', 'title', 'status'];
  const KEY_RESULT_FIELDS = ['id', 'parentId', 'description', 'status', 'startValue', 'currentValue', 'targetValue'];

  /** Recursively collect all objectives from a theme tree. */
  function flattenObjectives(themeList: LifeTheme[]): Objective[] {
    const result: Objective[] = [];
    function walk(objectives: Objective[]) {
      for (const obj of objectives) {
        result.push(obj);
        walk(obj.objectives ?? []);
      }
    }
    for (const theme of themeList) walk(theme.objectives);
    return result;
  }

  /** Recursively collect all key results from a theme tree. */
  function flattenKeyResults(themeList: LifeTheme[]): KeyResult[] {
    const result: KeyResult[] = [];
    function walk(objectives: Objective[]) {
      for (const obj of objectives) {
        result.push(...obj.keyResults);
        walk(obj.objectives ?? []);
      }
    }
    for (const theme of themeList) walk(theme.objectives);
    return result;
  }

  async function verifyThemeState() {
    const backendThemes = await getBindings().GetThemes();
    const mismatches = [
      ...checkStateFromData('theme', themes, backendThemes, 'id', THEME_FIELDS),
      ...checkStateFromData('objective', flattenObjectives(themes), flattenObjectives(backendThemes), 'id', OBJECTIVE_FIELDS),
      ...checkStateFromData('key-result', flattenKeyResults(themes), flattenKeyResults(backendThemes), 'id', KEY_RESULT_FIELDS),
    ];
    if (mismatches.length > 0) {
      error = 'Internal state mismatch detected, please reload';
      getBindings().LogFrontend('error', mismatches.join('; '), 'state-check');
    }
  }

  async function createTheme() {
    if (!newThemeName.trim()) return;

    try {
      await getBindings().CreateTheme(newThemeName.trim(), newThemeColor);
      await loadThemes();
      await verifyThemeState();
      newThemeName = '';
      newThemeColor = COLOR_PALETTE[0];
      showNewThemeForm = false;
    } catch (e) {
      console.error('Failed to create theme:', e);
      error = extractError(e);
    }
  }

  async function updateTheme(theme: LifeTheme) {
    try {
      await getBindings().UpdateTheme(theme);
      await loadThemes();
      await verifyThemeState();
      editingThemeId = null;
    } catch (e) {
      console.error('Failed to update theme:', e);
      error = extractError(e);
    }
  }

  async function deleteTheme(id: string) {
    if (!confirm('Are you sure you want to delete this theme and all its objectives?')) return;

    try {
      await getBindings().DeleteTheme(id);
      await loadThemes();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to delete theme:', e);
      error = extractError(e);
    }
  }

  // CreateObjective — parentId can be a theme ID or an objective ID
  async function createObjective(parentId: string) {
    if (!newObjectiveTitle.trim()) return;

    try {
      await getBindings().CreateObjective(parentId, newObjectiveTitle.trim());
      await loadThemes();
      await verifyThemeState();
      newObjectiveTitle = '';
      addingObjectiveTo = null;
      // Expand the parent to show the new objective
      expandId(parentId);
    } catch (e) {
      console.error('Failed to create objective:', e);
      error = extractError(e);
    }
  }

  // UpdateObjective — new API: (objectiveId, title, tags)
  async function updateObjective(objectiveId: string, newTitle: string, tags: string[]) {
    try {
      await getBindings().UpdateObjective(objectiveId, newTitle, tags);
      await loadThemes();
      await verifyThemeState();
      editingObjectiveId = null;
    } catch (e) {
      console.error('Failed to update objective:', e);
      error = extractError(e);
    }
  }

  // DeleteObjective — new API: (objectiveId)
  async function deleteObjective(objectiveId: string) {
    if (!confirm('Are you sure you want to delete this objective and all its children?')) return;

    try {
      await getBindings().DeleteObjective(objectiveId);
      await loadThemes();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to delete objective:', e);
      error = extractError(e);
    }
  }

  // CreateKeyResult — (parentObjectiveId, description)
  async function createKeyResult(objectiveId: string) {
    if (!newKeyResultDescription.trim()) return;

    try {
      await getBindings().CreateKeyResult(objectiveId, newKeyResultDescription.trim(), newKeyResultStartValue, newKeyResultTargetValue);
      await loadThemes();
      await verifyThemeState();
      newKeyResultDescription = '';
      newKeyResultStartValue = 0;
      newKeyResultTargetValue = 1;
      addingKeyResultToObjective = null;
      // Expand the objective to show the new key result
      expandId(objectiveId);
    } catch (e) {
      console.error('Failed to create key result:', e);
      error = extractError(e);
    }
  }

  // UpdateKeyResult — new API: (keyResultId, description)
  async function updateKeyResult(keyResultId: string, newDescription: string) {
    try {
      await getBindings().UpdateKeyResult(keyResultId, newDescription);
      await loadThemes();
      await verifyThemeState();
      editingKeyResultId = null;
    } catch (e) {
      console.error('Failed to update key result:', e);
      error = extractError(e);
    }
  }

  // UpdateKeyResultProgress — quick update of currentValue only
  async function updateKeyResultProgress(keyResultId: string, currentValue: number) {
    try {
      await getBindings().UpdateKeyResultProgress(keyResultId, currentValue);
      await loadThemes();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to update key result progress:', e);
      error = extractError(e);
    }
  }

  // DeleteKeyResult — new API: (keyResultId)
  async function deleteKeyResult(keyResultId: string) {
    if (!confirm('Are you sure you want to delete this key result?')) return;

    try {
      await getBindings().DeleteKeyResult(keyResultId);
      await loadThemes();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to delete key result:', e);
      error = extractError(e);
    }
  }

  // Status helpers
  function isActive(status: string | undefined): boolean {
    return !status || status === 'active';
  }

  function shouldShow(status: string | undefined): boolean {
    if (isActive(status)) return true;
    if (status === 'completed') return showCompleted;
    if (status === 'archived') return showArchived;
    return true;
  }

  // OKR Status changes
  async function setObjectiveStatus(objectiveId: string, status: string) {
    try {
      await getBindings().SetObjectiveStatus(objectiveId, status);
      await loadThemes();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to set objective status:', e);
      error = extractError(e);
    }
  }

  async function setKeyResultStatus(keyResultId: string, status: string) {
    try {
      await getBindings().SetKeyResultStatus(keyResultId, status);
      await loadThemes();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to set key result status:', e);
      error = extractError(e);
    }
  }

  // Start editing
  function startEditTheme(theme: LifeTheme) {
    editingThemeId = theme.id;
    editThemeName = theme.name;
    editThemeColor = theme.color;
  }

  async function startEditObjective(objective: Objective) {
    editingObjectiveId = objective.id;
    editObjectiveTitle = objective.title;
    editObjectiveTags = [...(objective.tags ?? [])];

    // Collect tags from all objectives
    const objectiveTags = flattenObjectives(themes).flatMap(o => o.tags ?? []);

    // Fetch task tags
    let taskTags: string[] = [];
    try {
      const tasks = await getBindings().GetTasks();
      taskTags = tasks.flatMap(t => t.tags ?? []);
    } catch {
      // Ignore — use objective tags only
    }

    // Fetch day focus tags
    let dayFocusTags: string[] = [];
    try {
      const dayFocusEntries = await getBindings().GetYearFocus(new Date().getFullYear());
      dayFocusTags = dayFocusEntries.flatMap(d => d.tags ?? []);
    } catch {
      // Ignore — use what we have
    }

    availableTags = [...new Set([...objectiveTags, ...taskTags, ...dayFocusTags])].sort();
  }

  function startEditKeyResult(kr: KeyResult) {
    editingKeyResultId = kr.id;
    editKeyResultDescription = kr.description;
    editKeyResultStartValue = kr.startValue ?? 0;
    editKeyResultTargetValue = kr.targetValue ?? 0;
  }

  // Submit edits
  function submitEditTheme(theme: LifeTheme) {
    updateTheme({
      ...theme,
      name: editThemeName,
      color: editThemeColor,
    });
  }

  function submitEditObjective(objective: Objective) {
    updateObjective(objective.id, editObjectiveTitle, editObjectiveTags);
  }

  function submitEditKeyResult(kr: KeyResult) {
    // If start/target values changed, update through full theme save
    const startChanged = editKeyResultStartValue !== (kr.startValue ?? 0);
    const targetChanged = editKeyResultTargetValue !== (kr.targetValue ?? 0);
    if (startChanged || targetChanged) {
      // Find the theme containing this KR and update it
      const theme = themes.find(t => {
        function searchKR(objectives: Objective[]): boolean {
          for (const obj of objectives) {
            if (obj.keyResults.some(k => k.id === kr.id)) return true;
            if (searchKR(obj.objectives ?? [])) return true;
          }
          return false;
        }
        return searchKR(t.objectives);
      });
      if (theme) {
        // Deep copy and update the KR fields
        const updatedTheme = JSON.parse(JSON.stringify(theme)) as LifeTheme;
        function updateKR(objectives: Objective[]): boolean {
          for (const obj of objectives) {
            const idx = obj.keyResults.findIndex(k => k.id === kr.id);
            if (idx >= 0) {
              obj.keyResults[idx].description = editKeyResultDescription;
              obj.keyResults[idx].startValue = editKeyResultStartValue;
              obj.keyResults[idx].targetValue = editKeyResultTargetValue;
              return true;
            }
            if (updateKR(obj.objectives ?? [])) return true;
          }
          return false;
        }
        updateKR(updatedTheme.objectives);
        editingKeyResultId = null;
        updateTheme(updatedTheme);
        return;
      }
    }
    updateKeyResult(kr.id, editKeyResultDescription);
  }

  // Cancel editing
  function cancelEdit() {
    editingThemeId = null;
    editingObjectiveId = null;
    editingKeyResultId = null;
  }

  function getColorConflicts(color: string, excludeThemeId?: string): string[] {
    return themes
      .filter(t => t.color.toLowerCase() === color.toLowerCase() && t.id !== excludeThemeId)
      .map(t => t.name);
  }

  onMount(async () => {
    try {
      const navCtx = await getBindings().LoadNavigationContext();
      if (navCtx) {
        showCompleted = navCtx.showCompleted ?? false;
        showArchived = navCtx.showArchived ?? false;
        if (navCtx.expandedOkrIds?.length) {
          for (const id of navCtx.expandedOkrIds) {
            expandedIds.add(id);
          }
        }
      }
    } catch {
      // Ignore errors loading nav context
    }
    loadThemes();
  });

  // Persist toggle states to NavigationContext
  $effect(() => {
    const sc = showCompleted;
    const sa = showArchived;
    untrack(() => {
      getBindings().LoadNavigationContext().then((ctx) => {
        if (ctx) {
          getBindings().SaveNavigationContext({ ...ctx, showCompleted: sc, showArchived: sa });
        }
      }).catch(() => { /* ignore */ });
    });
  });

  // Persist expanded node IDs to NavigationContext
  $effect(() => {
    const _size = expandedIds.size;
    const ids = [...expandedIds];
    untrack(() => {
      getBindings().LoadNavigationContext().then((ctx) => {
        if (ctx) {
          getBindings().SaveNavigationContext({ ...ctx, expandedOkrIds: ids });
        }
      }).catch(() => { /* ignore */ });
    });
  });

  // Auto-expand to show highlighted item
  $effect(() => {
    if (highlightItemId && themes.length > 0) {
      // Walk the parentId chain to expand all ancestor nodes
      const ancestors = collectAncestorIds(highlightItemId, themes);
      untrack(() => {
        for (const id of ancestors) {
          expandedIds.add(id);
        }
      });
    }
  });
</script>

{#snippet objectiveNode(objective: Objective, themeColor: string, depth: number)}
  {#if shouldShow(objective.status)}
  <div class="objective-item" class:highlighted={highlightItemId === objective.id} class:okr-completed={!isActive(objective.status)} style="margin-left: {depth > 0 ? 0.5 : 0}rem;">
    <!-- Objective Header -->
    <div class="item-header objective-header">
      <button
        class="expand-button"
        onclick={() => toggleExpanded(objective.id)}
        aria-expanded={expandedIds.has(objective.id)}
      >
        <span class="expand-icon">{expandedIds.has(objective.id) ? '\u25BC' : '\u25B6'}</span>
      </button>
      <span class="objective-marker" style="background-color: {themeColor};"></span>

      {#if editingObjectiveId === objective.id}
        <div class="objective-edit-area">
          <div class="objective-edit-row">
            <input
              type="text"
              class="inline-edit"
              bind:value={editObjectiveTitle}
              onkeydown={(e) => { if (e.key === 'Enter') submitEditObjective(objective); if (e.key === 'Escape') cancelEdit(); }}
            />
            <Button variant="icon" color="save" onclick={() => submitEditObjective(objective)} title="Save">&#10003;</Button>
            <Button variant="icon" color="cancel" onclick={cancelEdit} title="Cancel">&#10005;</Button>
          </div>
          <TagEditor
            tags={editObjectiveTags}
            {availableTags}
            onTagsChange={(newTags) => { editObjectiveTags = newTags; }}
          />
        </div>
      {:else}
        <span class="item-name">{objective.title}</span>
        <span class="item-id">{objective.id}</span>
        <TagBadges tags={objective.tags} />
        <div class="item-actions">
          {#if isActive(objective.status)}
            <Button variant="icon" color="complete" onclick={() => setObjectiveStatus(objective.id, 'completed')} title="Complete">&#10003;</Button>
          {:else if objective.status === 'completed'}
            <Button variant="icon" color="reopen" onclick={() => setObjectiveStatus(objective.id, 'active')} title="Reopen">&#8634;</Button>
            <Button variant="icon" color="archive" onclick={() => setObjectiveStatus(objective.id, 'archived')} title="Archive">&#128451;</Button>
          {:else}
            <Button variant="icon" color="reopen" onclick={() => setObjectiveStatus(objective.id, 'active')} title="Reopen">&#8634;</Button>
          {/if}
          <Button variant="icon" color="edit" onclick={() => startEditObjective(objective)} title="Edit">&#9998;</Button>
          <Button variant="icon" color="delete" onclick={() => deleteObjective(objective.id)} title="Delete">&#128465;</Button>
          <Button
            variant="icon" color="add"
            onclick={() => { addingObjectiveTo = objective.id; expandId(objective.id); }}
            title="Add Child Objective"
          >+O</Button>
          <Button
            variant="icon" color="add"
            onclick={() => { addingKeyResultToObjective = objective.id; expandId(objective.id); }}
            title="Add Key Result"
          >+KR</Button>
        </div>
      {/if}
    </div>

    <!-- Children (expanded) -->
    {#if expandedIds.has(objective.id)}
      <div class="children-list" style="padding-left: 1.5rem;">
        <!-- Add Child Objective Form -->
        {#if addingObjectiveTo === objective.id}
          <div class="new-item-form objective-form">
            <input
              type="text"
              placeholder="Child objective title"
              bind:value={newObjectiveTitle}
              onkeydown={(e) => { if (e.key === 'Enter') createObjective(objective.id); if (e.key === 'Escape') { addingObjectiveTo = null; newObjectiveTitle = ''; } }}
            />
            <Button variant="primary" onclick={() => createObjective(objective.id)}>Create</Button>
            <Button variant="secondary" onclick={() => { addingObjectiveTo = null; newObjectiveTitle = ''; }}>Cancel</Button>
          </div>
        {/if}

        <!-- Child Objectives (recursive) -->
        {#if objective.objectives && objective.objectives.length > 0}
          {#each objective.objectives as childObjective (childObjective.id)}
            {@render objectiveNode(childObjective, themeColor, depth + 1)}
          {/each}
        {/if}

        <!-- Add Key Result Form -->
        {#if addingKeyResultToObjective === objective.id}
          <div class="new-item-form kr-form">
            <input
              type="text"
              placeholder="Key result description"
              bind:value={newKeyResultDescription}
              onkeydown={(e) => { if (e.key === 'Enter') createKeyResult(objective.id); if (e.key === 'Escape') { addingKeyResultToObjective = null; newKeyResultDescription = ''; } }}
            />
            <div class="kr-form-row">
              <label class="kr-progress-label">Start <input type="number" class="kr-progress-input" bind:value={newKeyResultStartValue} min="0" /></label>
              <label class="kr-progress-label">Target <input type="number" class="kr-progress-input" bind:value={newKeyResultTargetValue} min="0" /></label>
              <Button variant="primary" onclick={() => createKeyResult(objective.id)}>Create</Button>
              <Button variant="secondary" onclick={() => { addingKeyResultToObjective = null; newKeyResultDescription = ''; newKeyResultStartValue = 0; newKeyResultTargetValue = 0; }}>Cancel</Button>
            </div>
          </div>
        {/if}

        <!-- Key Results -->
        {#each objective.keyResults as kr (kr.id)}
          {#if shouldShow(kr.status)}
          <div class="kr-item" class:highlighted={highlightItemId === kr.id} class:okr-completed={!isActive(kr.status)}>
            <div class="item-header kr-header">
              <span class="kr-marker" style="background-color: {themeColor};"></span>

              {#if editingKeyResultId === kr.id}
                <input
                  type="text"
                  class="inline-edit"
                  bind:value={editKeyResultDescription}
                  onkeydown={(e) => { if (e.key === 'Enter') submitEditKeyResult(kr); if (e.key === 'Escape') cancelEdit(); }}
                />
                <label class="kr-progress-label">Start <input type="number" class="kr-progress-input" bind:value={editKeyResultStartValue} min="0" /></label>
                <label class="kr-progress-label">Target <input type="number" class="kr-progress-input" bind:value={editKeyResultTargetValue} min="0" /></label>
                <Button variant="icon" color="save" onclick={() => submitEditKeyResult(kr)} title="Save">&#10003;</Button>
                <Button variant="icon" color="cancel" onclick={cancelEdit} title="Cancel">&#10005;</Button>
              {:else}
                <span class="item-name">{kr.description}</span>
                <span class="item-id">{kr.id}</span>
                {#if (kr.targetValue ?? 0) === 1 && (kr.startValue ?? 0) === 0}
                  <input
                    type="checkbox"
                    class="kr-checkbox"
                    checked={(kr.currentValue ?? 0) >= 1}
                    onchange={() => updateKeyResultProgress(kr.id, (kr.currentValue ?? 0) >= 1 ? 0 : 1)}
                    title="Toggle completion"
                  />
                {:else if (kr.targetValue ?? 0) > 1}
                  {@const start = kr.startValue ?? 0}
                  {@const current = kr.currentValue ?? 0}
                  {@const target = kr.targetValue ?? 1}
                  {@const pct = Math.max(0, Math.round(((current - start) / (target - start)) * 100))}
                  <div class="kr-progress" title="{current} / {target} ({pct}%)">
                    <div class="kr-progress-bar" class:over-achieved={current > target} style="width: {Math.min(pct, 100)}%"></div>
                    {#if current > target}
                      <div class="kr-progress-bar kr-progress-over" style="width: {Math.min(pct - 100, 100)}%"></div>
                    {/if}
                  </div>
                  <input
                    type="number"
                    class="kr-current-input"
                    value={current}
                    min="0"
                    onchange={(e) => updateKeyResultProgress(kr.id, parseInt((e.target as HTMLInputElement).value) || 0)}
                    title="Current progress"
                  />
                  <span class="kr-target-label">/ {target}</span>
                {/if}
                <div class="item-actions">
                  {#if isActive(kr.status)}
                    <Button variant="icon" color="complete" onclick={() => setKeyResultStatus(kr.id, 'completed')} title="Complete">&#10003;</Button>
                  {:else if kr.status === 'completed'}
                    <Button variant="icon" color="reopen" onclick={() => setKeyResultStatus(kr.id, 'active')} title="Reopen">&#8634;</Button>
                    <Button variant="icon" color="archive" onclick={() => setKeyResultStatus(kr.id, 'archived')} title="Archive">&#128451;</Button>
                  {:else}
                    <Button variant="icon" color="reopen" onclick={() => setKeyResultStatus(kr.id, 'active')} title="Reopen">&#8634;</Button>
                  {/if}
                  <Button variant="icon" color="edit" onclick={() => startEditKeyResult(kr)} title="Edit">&#9998;</Button>
                  <Button variant="icon" color="delete" onclick={() => deleteKeyResult(kr.id)} title="Delete">&#128465;</Button>
                </div>
              {/if}
            </div>
          </div>
          {/if}
        {/each}

        {#if (!objective.objectives || objective.objectives.length === 0) && objective.keyResults.length === 0 && addingKeyResultToObjective !== objective.id && addingObjectiveTo !== objective.id}
          <div class="empty-state">
            No children yet.
            <button class="link-button" onclick={() => { addingObjectiveTo = objective.id; }}>Add objective</button>
            or
            <button class="link-button" onclick={() => { addingKeyResultToObjective = objective.id; }}>Add key result</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {/if}
{/snippet}

<div class="okr-view">
  <header class="okr-header">
    <h1>Life Themes & OKRs</h1>
    <div class="header-controls">
      <label class="toggle-label">
        <input type="checkbox" bind:checked={showCompleted} /> Show completed
      </label>
      <label class="toggle-label">
        <input type="checkbox" bind:checked={showArchived} /> Show archived
      </label>
      <Button
        variant="primary"
        onclick={() => { showNewThemeForm = true; }}
      >
        + Add Theme
      </Button>
    </div>
  </header>

  {#if error}
    <ErrorBanner message={error} ondismiss={() => error = null} />
  {/if}

  {#if loading}
    <div class="loading">Loading themes...</div>
  {:else}
    {#if availableObjectiveTags.length > 0}
      <TagFilterBar
        availableTags={availableObjectiveTags}
        activeTagIds={filterTagIds}
        onToggle={handleFilterTagToggle}
        onClear={handleFilterTagClear}
      />
    {/if}

    <!-- New Theme Form -->
    {#if showNewThemeForm}
      <div class="new-item-form theme-form">
        <input
          type="text"
          placeholder="Theme name"
          bind:value={newThemeName}
          onkeydown={(e) => { if (e.key === 'Enter') createTheme(); if (e.key === 'Escape') { showNewThemeForm = false; newThemeName = ''; } }}
        />
        <div class="color-picker">
          {#each COLOR_PALETTE as color (color)}
            <button
              class="color-option"
              class:selected={newThemeColor === color}
              style="background-color: {color};"
              onclick={() => { newThemeColor = color; }}
              aria-label="Select color {color}"
            ></button>
          {/each}
          <label class="color-input-wrapper">
            <span class="color-input-icon">+</span>
            <input type="color" class="color-input" bind:value={newThemeColor} aria-label="Custom color" />
          </label>
        </div>
        {#if getColorConflicts(newThemeColor).length > 0}
          <div class="color-warning">Already used by: {getColorConflicts(newThemeColor).join(', ')}</div>
        {/if}
        <div class="form-actions">
          <Button variant="primary" onclick={createTheme}>Create</Button>
          <Button variant="secondary" onclick={() => { showNewThemeForm = false; newThemeName = ''; }}>Cancel</Button>
        </div>
      </div>
    {/if}

    <!-- Themes List -->
    <div class="themes-list">
      {#each filteredThemes as theme (theme.id)}
        <div class="theme-item" class:highlighted={highlightItemId === theme.id} style="--theme-color: {theme.color};">
          <!-- Theme Header -->
          <div class="item-header theme-header">
            <button
              class="expand-button"
              onclick={() => toggleExpanded(theme.id)}
              aria-expanded={expandedIds.has(theme.id)}
            >
              <span class="expand-icon">{expandedIds.has(theme.id) ? '\u25BC' : '\u25B6'}</span>
            </button>
            <ThemeBadge color={theme.color} size="md" />

            {#if editingThemeId === theme.id}
              <input
                type="text"
                class="inline-edit"
                bind:value={editThemeName}
                onkeydown={(e) => { if (e.key === 'Enter') submitEditTheme(theme); if (e.key === 'Escape') cancelEdit(); }}
              />
              <div class="color-picker inline">
                {#each COLOR_PALETTE as color (color)}
                  <button
                    class="color-option small"
                    class:selected={editThemeColor === color}
                    style="background-color: {color};"
                    onclick={() => { editThemeColor = color; }}
                    aria-label="Select color {color}"
                  ></button>
                {/each}
                <label class="color-input-wrapper small">
                  <span class="color-input-icon">+</span>
                  <input type="color" class="color-input" bind:value={editThemeColor} aria-label="Custom color" />
                </label>
              </div>
              {@const editConflicts = getColorConflicts(editThemeColor, theme.id)}
              {#if editConflicts.length > 0}
                <div class="color-warning">Already used by: {editConflicts.join(', ')}</div>
              {/if}
              <Button variant="icon" color="save" onclick={() => submitEditTheme(theme)} title="Save">&#10003;</Button>
              <Button variant="icon" color="cancel" onclick={cancelEdit} title="Cancel">&#10005;</Button>
            {:else}
              <span class="item-name">{theme.name}</span>
              <span class="item-id">{theme.id}</span>
              <div class="item-actions">
                {#if onNavigateToCalendar}
                  <Button
                    variant="icon" color="nav"
                    onclick={() => onNavigateToCalendar?.(undefined, theme.id)}
                    title="View in Calendar"
                  >CAL</Button>
                {/if}
                {#if onNavigateToTasks}
                  <Button
                    variant="icon" color="nav"
                    onclick={() => onNavigateToTasks?.({ themeId: theme.id })}
                    title="View Tasks"
                  >TSK</Button>
                {/if}
                <Button variant="icon" color="edit" onclick={() => startEditTheme(theme)} title="Edit">&#9998;</Button>
                <Button variant="icon" color="delete" onclick={() => deleteTheme(theme.id)} title="Delete">&#128465;</Button>
                <Button
                  variant="icon" color="add"
                  onclick={() => { addingObjectiveTo = theme.id; expandId(theme.id); }}
                  title="Add Objective"
                >+</Button>
              </div>
            {/if}
          </div>

          <!-- Objectives (expanded) -->
          {#if expandedIds.has(theme.id)}
            <div class="objectives-list">
              <!-- Add Objective Form -->
              {#if addingObjectiveTo === theme.id}
                <div class="new-item-form objective-form">
                  <input
                    type="text"
                    placeholder="Objective title"
                    bind:value={newObjectiveTitle}
                    onkeydown={(e) => { if (e.key === 'Enter') createObjective(theme.id); if (e.key === 'Escape') { addingObjectiveTo = null; newObjectiveTitle = ''; } }}
                  />
                  <Button variant="primary" onclick={() => createObjective(theme.id)}>Create</Button>
                  <Button variant="secondary" onclick={() => { addingObjectiveTo = null; newObjectiveTitle = ''; }}>Cancel</Button>
                </div>
              {/if}

              {#each theme.objectives as objective (objective.id)}
                {@render objectiveNode(objective, theme.color, 0)}
              {/each}

              {#if theme.objectives.length === 0 && addingObjectiveTo !== theme.id}
                <div class="empty-state">
                  No objectives yet.
                  <button class="link-button" onclick={() => { addingObjectiveTo = theme.id; }}>Add one</button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if themes.length === 0 && !showNewThemeForm}
        <div class="empty-state large">
          <p>No life themes defined yet.</p>
          <p>Create your first theme to start organizing your goals!</p>
          <Button variant="primary" onclick={() => { showNewThemeForm = true; }}>
            + Add Your First Theme
          </Button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .okr-view {
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .okr-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-gray-500);
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--color-gray-500);
  }

  .okr-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-gray-800);
    margin: 0;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: var(--color-gray-500);
  }

  .themes-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .theme-item {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 8px;
    overflow: hidden;
    border-left: 4px solid var(--theme-color);
  }

  .theme-item.highlighted,
  .objective-item.highlighted,
  .kr-item.highlighted {
    background-color: var(--color-warning-100);
    animation: highlight-pulse 2s ease-out;
  }

  @keyframes highlight-pulse {
    0% {
      background-color: #fde68a;
    }
    100% {
      background-color: var(--color-warning-100);
    }
  }

  .item-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }

  .theme-header {
    background-color: var(--color-gray-50);
  }

  .expand-button {
    background: none;
    border: none;
    padding: 0.25rem;
    cursor: pointer;
    color: var(--color-gray-500);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .expand-icon {
    font-size: 0.75rem;
    transition: transform 0.2s;
  }

  .item-name {
    flex: 1;
    font-weight: 500;
    color: var(--color-gray-800);
  }

  .item-id {
    font-size: 0.75rem;
    color: var(--color-gray-400);
    font-family: monospace;
  }

  .item-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .item-header:hover .item-actions {
    opacity: 1;
  }

  .okr-completed .item-name {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .okr-completed .item-id {
    opacity: 0.5;
  }

  .objectives-list {
    padding-left: 2rem;
    padding-bottom: 0.5rem;
  }

  .objective-item {
    border-left: 2px solid var(--color-gray-200);
    margin-left: 0.5rem;
  }

  .objective-header {
    background-color: #fafafa;
  }

  .objective-marker {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .children-list {
    padding-bottom: 0.5rem;
  }

  .kr-item {
    border-left: 1px dashed var(--color-gray-300);
    margin-left: 0.5rem;
  }

  .kr-header {
    background-color: white;
  }

  .kr-marker {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .new-item-form {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background-color: #f0f9ff;
    border: 1px dashed var(--color-primary-500);
    border-radius: 6px;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .new-item-form input {
    flex: 1;
    min-width: 200px;
    padding: 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .new-item-form input:focus {
    outline: none;
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .color-picker {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .color-picker.inline {
    margin-left: 0.5rem;
  }

  .color-option {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
  }

  .color-option:hover {
    transform: scale(1.1);
  }

  .color-option.selected {
    border-color: var(--color-gray-800);
  }

  .color-option.small {
    width: 18px;
    height: 18px;
  }

  .color-input-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 2px dashed var(--color-gray-400);
    border-radius: 50%;
    cursor: pointer;
    overflow: hidden;
  }

  .color-input-wrapper:hover {
    border-color: var(--color-gray-600);
  }

  .color-input-wrapper.small {
    width: 18px;
    height: 18px;
  }

  .color-input-icon {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-gray-400);
    line-height: 1;
    pointer-events: none;
  }

  .color-input-wrapper:hover .color-input-icon {
    color: var(--color-gray-600);
  }

  .color-input-wrapper.small .color-input-icon {
    font-size: 0.625rem;
  }

  .color-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }

  .color-warning {
    font-size: 0.75rem;
    color: #d97706;
    width: 100%;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
  }

  .inline-edit {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-primary-500);
    border-radius: 4px;
    font-size: 0.875rem;
    background-color: white;
  }

  .inline-edit:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .empty-state {
    padding: 1rem;
    color: var(--color-gray-500);
    font-size: 0.875rem;
    text-align: center;
  }

  .empty-state.large {
    padding: 3rem;
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .link-button {
    background: none;
    border: none;
    color: var(--color-primary-500);
    cursor: pointer;
    font-size: inherit;
    padding: 0;
    text-decoration: underline;
  }

  .link-button:hover {
    color: var(--color-primary-600);
  }

  .objective-form,
  .kr-form {
    margin: 0.5rem 0;
  }

  .kr-form-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }

  /* KR Progress Styles */
  .kr-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--color-success-500);
    flex-shrink: 0;
  }

  .kr-progress {
    width: 80px;
    height: 6px;
    background-color: var(--color-gray-200);
    border-radius: 3px;
    overflow: visible;
    position: relative;
    flex-shrink: 0;
    display: flex;
  }

  .kr-progress-bar {
    height: 100%;
    background-color: var(--color-success-500);
    border-radius: 3px 0 0 3px;
    transition: width 0.3s;
  }

  .kr-progress-bar.over-achieved {
    border-radius: 3px 0 0 3px;
  }

  .kr-progress-over {
    background-color: var(--color-warning-500);
    border-radius: 0 3px 3px 0;
  }

  .kr-current-input {
    width: 40px;
    padding: 0 0.25rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 3px;
    font-size: 0.75rem;
    text-align: center;
    flex-shrink: 0;
  }

  .kr-current-input:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  .kr-target-label {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    flex-shrink: 0;
  }

  .kr-progress-label {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .kr-progress-input {
    width: 50px;
    padding: 0.25rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 3px;
    font-size: 0.75rem;
  }

  .kr-progress-input:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  /* Objective inline editing layout */
  .objective-edit-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .objective-edit-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
</style>
