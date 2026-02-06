<script lang="ts">
  /**
   * OKRView Component
   *
   * Displays the hierarchical OKR structure with Life Themes, Objectives, and Key Results.
   * Supports CRUD operations with accordion-style expansion and inline editing.
   * Objectives are rendered recursively to support arbitrary nesting depth.
   */

  import { onMount } from 'svelte';
  import ThemeBadge from '../lib/components/ThemeBadge.svelte';

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
    description: string;
  }

  interface Objective {
    id: string;
    title: string;
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
  let expandedIds = $state<Set<string>>(new Set());

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

  // Inline edit values
  let editThemeName = $state('');
  let editThemeColor = $state('');
  let editObjectiveTitle = $state('');
  let editKeyResultDescription = $state('');

  // Check if running in Wails
  function isWailsRuntime(): boolean {
    return typeof window !== 'undefined' &&
           !!(window as any).go?.main?.App;
  }

  // Toggle expansion for any ID (theme or objective)
  function toggleExpanded(id: string) {
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
    } else {
      expandedIds.add(id);
    }
    expandedIds = new Set(expandedIds);
  }

  // Helper to expand an ID (without toggling)
  function expandId(id: string) {
    expandedIds.add(id);
    expandedIds = new Set(expandedIds);
  }

  // Check if an objective has expandable children
  function hasChildren(objective: Objective): boolean {
    return (objective.objectives && objective.objectives.length > 0) ||
           objective.keyResults.length > 0;
  }

  // API calls
  async function loadThemes() {
    loading = true;
    error = null;
    try {
      if (isWailsRuntime()) {
        themes = await (window as any).go.main.App.GetThemes();
      } else {
        // Mock data for browser testing
        themes = getMockThemes();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load themes';
      console.error('Failed to load themes:', e);
    } finally {
      loading = false;
    }
  }

  async function createTheme() {
    if (!newThemeName.trim()) return;

    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.CreateTheme(newThemeName.trim(), newThemeColor);
      }
      await loadThemes();
      newThemeName = '';
      newThemeColor = COLOR_PALETTE[0];
      showNewThemeForm = false;
    } catch (e) {
      console.error('Failed to create theme:', e);
      error = e instanceof Error ? e.message : 'Failed to create theme';
    }
  }

  async function updateTheme(theme: LifeTheme) {
    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.UpdateTheme(theme);
      }
      await loadThemes();
      editingThemeId = null;
    } catch (e) {
      console.error('Failed to update theme:', e);
      error = e instanceof Error ? e.message : 'Failed to update theme';
    }
  }

  async function deleteTheme(id: string) {
    if (!confirm('Are you sure you want to delete this theme and all its objectives?')) return;

    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.DeleteTheme(id);
      }
      await loadThemes();
    } catch (e) {
      console.error('Failed to delete theme:', e);
      error = e instanceof Error ? e.message : 'Failed to delete theme';
    }
  }

  // CreateObjective — parentId can be a theme ID or an objective ID
  async function createObjective(parentId: string) {
    if (!newObjectiveTitle.trim()) return;

    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.CreateObjective(parentId, newObjectiveTitle.trim());
      }
      await loadThemes();
      newObjectiveTitle = '';
      addingObjectiveTo = null;
      // Expand the parent to show the new objective
      expandId(parentId);
    } catch (e) {
      console.error('Failed to create objective:', e);
      error = e instanceof Error ? e.message : 'Failed to create objective';
    }
  }

  // UpdateObjective — new API: (objectiveId, title)
  async function updateObjective(objectiveId: string, newTitle: string) {
    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.UpdateObjective(objectiveId, newTitle);
      }
      await loadThemes();
      editingObjectiveId = null;
    } catch (e) {
      console.error('Failed to update objective:', e);
      error = e instanceof Error ? e.message : 'Failed to update objective';
    }
  }

  // DeleteObjective — new API: (objectiveId)
  async function deleteObjective(objectiveId: string) {
    if (!confirm('Are you sure you want to delete this objective and all its children?')) return;

    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.DeleteObjective(objectiveId);
      }
      await loadThemes();
    } catch (e) {
      console.error('Failed to delete objective:', e);
      error = e instanceof Error ? e.message : 'Failed to delete objective';
    }
  }

  // CreateKeyResult — (parentObjectiveId, description)
  async function createKeyResult(objectiveId: string) {
    if (!newKeyResultDescription.trim()) return;

    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.CreateKeyResult(objectiveId, newKeyResultDescription.trim());
      }
      await loadThemes();
      newKeyResultDescription = '';
      addingKeyResultToObjective = null;
      // Expand the objective to show the new key result
      expandId(objectiveId);
    } catch (e) {
      console.error('Failed to create key result:', e);
      error = e instanceof Error ? e.message : 'Failed to create key result';
    }
  }

  // UpdateKeyResult — new API: (keyResultId, description)
  async function updateKeyResult(keyResultId: string, newDescription: string) {
    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.UpdateKeyResult(keyResultId, newDescription);
      }
      await loadThemes();
      editingKeyResultId = null;
    } catch (e) {
      console.error('Failed to update key result:', e);
      error = e instanceof Error ? e.message : 'Failed to update key result';
    }
  }

  // DeleteKeyResult — new API: (keyResultId)
  async function deleteKeyResult(keyResultId: string) {
    if (!confirm('Are you sure you want to delete this key result?')) return;

    try {
      if (isWailsRuntime()) {
        await (window as any).go.main.App.DeleteKeyResult(keyResultId);
      }
      await loadThemes();
    } catch (e) {
      console.error('Failed to delete key result:', e);
      error = e instanceof Error ? e.message : 'Failed to delete key result';
    }
  }

  // Start editing
  function startEditTheme(theme: LifeTheme) {
    editingThemeId = theme.id;
    editThemeName = theme.name;
    editThemeColor = theme.color;
  }

  function startEditObjective(objective: Objective) {
    editingObjectiveId = objective.id;
    editObjectiveTitle = objective.title;
  }

  function startEditKeyResult(kr: KeyResult) {
    editingKeyResultId = kr.id;
    editKeyResultDescription = kr.description;
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
    updateObjective(objective.id, editObjectiveTitle);
  }

  function submitEditKeyResult(kr: KeyResult) {
    updateKeyResult(kr.id, editKeyResultDescription);
  }

  // Cancel editing
  function cancelEdit() {
    editingThemeId = null;
    editingObjectiveId = null;
    editingKeyResultId = null;
  }

  // Extract theme ID from an objective ID (e.g., "THEME-01.OKR-01.OKR-02" -> "THEME-01")
  function getThemeIdFromObjectiveId(objectiveId: string): string {
    const dotIndex = objectiveId.indexOf('.');
    return dotIndex > 0 ? objectiveId.substring(0, dotIndex) : '';
  }

  // Mock data for browser testing (includes nested objectives to demonstrate recursion)
  function getMockThemes(): LifeTheme[] {
    return [
      {
        id: 'THEME-01',
        name: 'Health & Fitness',
        color: '#10b981',
        objectives: [
          {
            id: 'THEME-01.OKR-01',
            title: 'Improve cardiovascular health',
            keyResults: [
              { id: 'THEME-01.OKR-01.KR-01', description: 'Run 5K in under 25 minutes' },
              { id: 'THEME-01.OKR-01.KR-02', description: 'Exercise 4 times per week' },
            ],
            objectives: [
              {
                id: 'THEME-01.OKR-01.OKR-01',
                title: 'Build running endurance',
                keyResults: [
                  { id: 'THEME-01.OKR-01.OKR-01.KR-01', description: 'Run 3 times per week for 8 weeks' },
                ],
              },
            ],
          },
          {
            id: 'THEME-01.OKR-02',
            title: 'Build strength',
            keyResults: [
              { id: 'THEME-01.OKR-02.KR-01', description: 'Complete 50 push-ups in one set' },
            ],
          },
        ],
      },
      {
        id: 'THEME-02',
        name: 'Career Growth',
        color: '#3b82f6',
        objectives: [
          {
            id: 'THEME-02.OKR-01',
            title: 'Develop leadership skills',
            keyResults: [
              { id: 'THEME-02.OKR-01.KR-01', description: 'Lead 2 major projects' },
              { id: 'THEME-02.OKR-01.KR-02', description: 'Mentor 1 junior developer' },
            ],
          },
        ],
      },
    ];
  }

  onMount(() => {
    loadThemes();
  });

  // Auto-expand to show highlighted item
  $effect(() => {
    if (highlightItemId && themes.length > 0) {
      // Parse the hierarchical ID to expand all ancestor nodes
      const parts = highlightItemId.split('.');
      for (let i = 1; i <= parts.length; i++) {
        const ancestorId = parts.slice(0, i).join('.');
        expandedIds.add(ancestorId);
      }
      expandedIds = new Set(expandedIds);
    }
  });
</script>

{#snippet objectiveNode(objective: Objective, themeColor: string, depth: number)}
  <div class="objective-item" class:highlighted={highlightItemId === objective.id} style="margin-left: {depth > 0 ? 0.5 : 0}rem;">
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
        <input
          type="text"
          class="inline-edit"
          bind:value={editObjectiveTitle}
          onkeydown={(e) => { if (e.key === 'Enter') submitEditObjective(objective); if (e.key === 'Escape') cancelEdit(); }}
        />
        <button class="icon-button save" onclick={() => submitEditObjective(objective)} title="Save">&#10003;</button>
        <button class="icon-button cancel" onclick={cancelEdit} title="Cancel">&#10005;</button>
      {:else}
        <span class="item-name">{objective.title}</span>
        <span class="item-id">{objective.id}</span>
        <div class="item-actions">
          <button class="icon-button edit" onclick={() => startEditObjective(objective)} title="Edit">&#9998;</button>
          <button class="icon-button delete" onclick={() => deleteObjective(objective.id)} title="Delete">&#128465;</button>
          <button
            class="icon-button add"
            onclick={() => { addingObjectiveTo = objective.id; expandId(objective.id); }}
            title="Add Child Objective"
          >+O</button>
          <button
            class="icon-button add"
            onclick={() => { addingKeyResultToObjective = objective.id; expandId(objective.id); }}
            title="Add Key Result"
          >+KR</button>
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
            <button class="save-button" onclick={() => createObjective(objective.id)}>Create</button>
            <button class="cancel-button" onclick={() => { addingObjectiveTo = null; newObjectiveTitle = ''; }}>Cancel</button>
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
            <button class="save-button" onclick={() => createKeyResult(objective.id)}>Create</button>
            <button class="cancel-button" onclick={() => { addingKeyResultToObjective = null; newKeyResultDescription = ''; }}>Cancel</button>
          </div>
        {/if}

        <!-- Key Results -->
        {#each objective.keyResults as kr (kr.id)}
          <div class="kr-item" class:highlighted={highlightItemId === kr.id}>
            <div class="item-header kr-header">
              <span class="kr-marker" style="background-color: {themeColor};"></span>

              {#if editingKeyResultId === kr.id}
                <input
                  type="text"
                  class="inline-edit"
                  bind:value={editKeyResultDescription}
                  onkeydown={(e) => { if (e.key === 'Enter') submitEditKeyResult(kr); if (e.key === 'Escape') cancelEdit(); }}
                />
                <button class="icon-button save" onclick={() => submitEditKeyResult(kr)} title="Save">&#10003;</button>
                <button class="icon-button cancel" onclick={cancelEdit} title="Cancel">&#10005;</button>
              {:else}
                <span class="item-name">{kr.description}</span>
                <span class="item-id">{kr.id}</span>
                <div class="item-actions">
                  <button class="icon-button edit" onclick={() => startEditKeyResult(kr)} title="Edit">&#9998;</button>
                  <button class="icon-button delete" onclick={() => deleteKeyResult(kr.id)} title="Delete">&#128465;</button>
                </div>
              {/if}
            </div>
          </div>
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
{/snippet}

<div class="okr-view">
  <header class="okr-header">
    <h1>Life Themes & OKRs</h1>
    <button
      class="add-button primary"
      onclick={() => { showNewThemeForm = true; }}
    >
      + Add Theme
    </button>
  </header>

  {#if error}
    <div class="error-banner" role="alert">
      {error}
      <button onclick={() => { error = null; }}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading themes...</div>
  {:else}
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
          {#each COLOR_PALETTE as color}
            <button
              class="color-option"
              class:selected={newThemeColor === color}
              style="background-color: {color};"
              onclick={() => { newThemeColor = color; }}
              aria-label="Select color {color}"
            ></button>
          {/each}
        </div>
        <div class="form-actions">
          <button class="save-button" onclick={createTheme}>Create</button>
          <button class="cancel-button" onclick={() => { showNewThemeForm = false; newThemeName = ''; }}>Cancel</button>
        </div>
      </div>
    {/if}

    <!-- Themes List -->
    <div class="themes-list">
      {#each themes as theme (theme.id)}
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
                {#each COLOR_PALETTE as color}
                  <button
                    class="color-option small"
                    class:selected={editThemeColor === color}
                    style="background-color: {color};"
                    onclick={() => { editThemeColor = color; }}
                    aria-label="Select color {color}"
                  ></button>
                {/each}
              </div>
              <button class="icon-button save" onclick={() => submitEditTheme(theme)} title="Save">&#10003;</button>
              <button class="icon-button cancel" onclick={cancelEdit} title="Cancel">&#10005;</button>
            {:else}
              <span class="item-name">{theme.name}</span>
              <span class="item-id">{theme.id}</span>
              <div class="item-actions">
                {#if onNavigateToCalendar}
                  <button
                    class="icon-button nav"
                    onclick={() => onNavigateToCalendar?.(undefined, theme.id)}
                    title="View in Calendar"
                  >CAL</button>
                {/if}
                {#if onNavigateToTasks}
                  <button
                    class="icon-button nav"
                    onclick={() => onNavigateToTasks?.({ themeId: theme.id })}
                    title="View Tasks"
                  >TSK</button>
                {/if}
                <button class="icon-button edit" onclick={() => startEditTheme(theme)} title="Edit">&#9998;</button>
                <button class="icon-button delete" onclick={() => deleteTheme(theme.id)} title="Delete">&#128465;</button>
                <button
                  class="icon-button add"
                  onclick={() => { addingObjectiveTo = theme.id; expandId(theme.id); }}
                  title="Add Objective"
                >+</button>
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
                  <button class="save-button" onclick={() => createObjective(theme.id)}>Create</button>
                  <button class="cancel-button" onclick={() => { addingObjectiveTo = null; newObjectiveTitle = ''; }}>Cancel</button>
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
          <button class="add-button primary" onclick={() => { showNewThemeForm = true; }}>
            + Add Your First Theme
          </button>
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
  }

  .okr-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .add-button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .add-button.primary {
    background-color: #2563eb;
    color: white;
  }

  .add-button.primary:hover {
    background-color: #1d4ed8;
  }

  .error-banner {
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .error-banner button {
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    font-weight: 500;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
  }

  .themes-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .theme-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    border-left: 4px solid var(--theme-color);
  }

  .theme-item.highlighted,
  .objective-item.highlighted,
  .kr-item.highlighted {
    background-color: #fef3c7;
    animation: highlight-pulse 2s ease-out;
  }

  @keyframes highlight-pulse {
    0% {
      background-color: #fde68a;
    }
    100% {
      background-color: #fef3c7;
    }
  }

  .item-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }

  .theme-header {
    background-color: #f9fafb;
  }

  .expand-button {
    background: none;
    border: none;
    padding: 0.25rem;
    cursor: pointer;
    color: #6b7280;
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
    color: #1f2937;
  }

  .item-id {
    font-size: 0.75rem;
    color: #9ca3af;
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

  .icon-button {
    background: none;
    border: none;
    padding: 0.375rem;
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }

  .icon-button:hover {
    background-color: #f3f4f6;
  }

  .icon-button.edit {
    color: #3b82f6;
  }

  .icon-button.delete {
    color: #ef4444;
  }

  .icon-button.add {
    color: #10b981;
    font-weight: bold;
  }

  .icon-button.save {
    color: #10b981;
  }

  .icon-button.cancel {
    color: #6b7280;
  }

  .icon-button.nav {
    color: #6b7280;
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.25rem 0.375rem;
  }

  .icon-button.nav:hover {
    color: #2563eb;
    background-color: #eff6ff;
  }

  .objectives-list {
    padding-left: 2rem;
    padding-bottom: 0.5rem;
  }

  .objective-item {
    border-left: 2px solid #e5e7eb;
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
    border-left: 1px dashed #d1d5db;
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
    border: 1px dashed #3b82f6;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .new-item-form input {
    flex: 1;
    min-width: 200px;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .new-item-form input:focus {
    outline: none;
    border-color: #3b82f6;
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
    border-color: #1f2937;
  }

  .color-option.small {
    width: 18px;
    height: 18px;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
  }

  .save-button {
    padding: 0.375rem 0.75rem;
    background-color: #10b981;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .save-button:hover {
    background-color: #059669;
  }

  .cancel-button {
    padding: 0.375rem 0.75rem;
    background-color: #f3f4f6;
    color: #6b7280;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .cancel-button:hover {
    background-color: #e5e7eb;
  }

  .inline-edit {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid #3b82f6;
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
    color: #6b7280;
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
    color: #3b82f6;
    cursor: pointer;
    font-size: inherit;
    padding: 0;
    text-decoration: underline;
  }

  .link-button:hover {
    color: #2563eb;
  }

  .objective-form,
  .kr-form {
    margin: 0.5rem 0;
  }
</style>
