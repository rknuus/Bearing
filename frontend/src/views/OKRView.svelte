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
  import { Button, Dialog, ErrorBanner, TagBadges, TagEditor, ThemeOKRTree } from '../lib/components';

  import AdvisorChat from '../components/AdvisorChat.svelte';
  import TagFilterBar from '../components/TagFilterBar.svelte';
  import { getBindings, extractError, openExternalLink } from '../lib/utils/bindings';
  import { getObjectiveStatus } from '../lib/utils/okr-status';
  import { checkStateFromData } from '../lib/utils/state-check';
  import { renderMarkdown } from '../lib/utils/markdown';
  import { FEATURE_ROUTINES_ENABLED } from '../lib/constants/feature-flags';

  // Props for cross-view navigation
  interface Props {
    onNavigateToCalendar?: (date?: string, themeId?: string) => void;
    onNavigateToTasks?: (options?: { themeId?: string; date?: string }) => void;
    highlightItemId?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque to this view, typed inside AdvisorChat
    advisorMessages?: any[];
    advisorPanelOpen?: boolean;
    advisorBusy?: boolean;
    onAdvisorSend?: (message: string, selectedIds?: string[]) => void;
  }

  let { onNavigateToCalendar, onNavigateToTasks, highlightItemId, advisorMessages = $bindable([]), advisorPanelOpen = $bindable(false), advisorBusy = $bindable(false), onAdvisorSend }: Props = $props();

  // Types matching the Go structs
  interface KeyResult {
    id: string;
    parentId?: string;
    description: string;
    type?: string;
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
    closingStatus?: string;
    closingNotes?: string;
    closedAt?: string;
    keyResults: KeyResult[];
    objectives?: Objective[];
  }

  interface Routine {
    id: string;
    description: string;
    currentValue: number;
    targetValue: number;
    targetType: string; // "at-or-above" | "at-or-below"
    unit?: string;
  }

  interface LifeTheme {
    id: string;
    name: string;
    color: string;
    objectives: Objective[];
    routines?: Routine[];
  }

  interface ObjectiveProgressEntry {
    objectiveId: string;
    progress: number;
  }

  interface ThemeProgressEntry {
    themeId: string;
    progress: number;
    objectives: ObjectiveProgressEntry[];
  }

  // Predefined color palette for theme selection
  const COLOR_PALETTE = [
    '#dc2626', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#15803d', // Green
    '#06b6d4', // Cyan
    '#2563eb', // Blue
    '#7c3aed', // Purple
    '#f472b6', // Pink
  ];

  // State
  let themes = $state<LifeTheme[]>([]);
  let themeProgress = $state<ThemeProgressEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Unified expansion state for themes and objectives at any depth
  let expandedIds = new SvelteSet<string>();
  let contextLoaded = false;

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

  // Routine state
  let addingRoutineToTheme = $state<string | null>(null);
  let newRoutineDescription = $state('');
  let newRoutineTargetValue = $state(1);
  let newRoutineTargetType = $state('at-or-above');
  let newRoutineUnit = $state('');
  let editingRoutineId = $state<string | null>(null);
  let editRoutineDescription = $state('');
  let editRoutineCurrentValue = $state(0);
  let editRoutineTargetValue = $state(1);
  let editRoutineTargetType = $state('at-or-above');
  let editRoutineUnit = $state('');

  // Close objective dialog state
  let closingObjectiveId = $state<string | null>(null);
  let closingStatus = $state('achieved');
  let closingNotes = $state('');

  // Personal vision state
  interface PersonalVision {
    mission: string;
    vision: string;
    updatedAt?: string;
  }

  let personalVision = $state<PersonalVision>({ mission: '', vision: '' });
  let visionCollapsed = $state(true);
  let editingVision = $state(false);
  let editVisionMission = $state('');
  let editVisionVision = $state('');
  let previewMode = $state(false);

  function handleVisionLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor?.href) {
      e.preventDefault();
      openExternalLink(anchor.href);
    }
  }

  // View toggle state
  let showCompleted = $state(false);
  let showArchived = $state(false);

  // Tag filter state (local only, not persisted)
  let filterTagIds: string[] = $state([]);

  // Advisor chat message type
  interface ChatMessage {
    role: 'user' | 'advisor';
    content: string;
    timestamp: number;
    error?: string;
  }

  // Advisor state
  let advisorEnabled = $state(false);
  let advisorAvailable = $state(false);
  let advisorModels = $state<{name: string, provider: string, type: string, available: boolean, reason: string}[]>([]);
  let selectedOKRIds = $state<string[]>([]);
  let lastSelectedId: string | null = null;

  function getObjectiveProgress(objectiveId: string): number {
    for (const tp of themeProgress) {
      for (const op of tp.objectives) {
        if (op.objectiveId === objectiveId) return op.progress;
      }
    }
    return -1;
  }

  function getThemeProgressValue(themeId: string): number {
    const tp = themeProgress.find(t => t.themeId === themeId);
    return tp ? tp.progress : -1;
  }


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
      themes = await getBindings().GetHierarchy();
      try {
        themeProgress = await getBindings().GetAllThemeProgress();
      } catch {
        themeProgress = [];
      }
    } catch (e) {
      error = extractError(e);
      console.error('Failed to load themes:', e);
    } finally {
      loading = false;
    }
  }

  async function loadVision() {
    try {
      personalVision = await getBindings().GetPersonalVision();
    } catch { /* ignore */ }
  }

  async function saveVision() {
    try {
      await getBindings().SavePersonalVision(editVisionMission, editVisionVision);
      personalVision = { mission: editVisionMission, vision: editVisionVision, updatedAt: new Date().toISOString() };
      editingVision = false;
    } catch (e) {
      error = extractError(e);
    }
  }

  function startEditVision() {
    editVisionMission = personalVision.mission;
    editVisionVision = personalVision.vision;
    previewMode = false;
    editingVision = true;
  }

  const THEME_FIELDS = ['id', 'name', 'color'];
  const OBJECTIVE_FIELDS = ['id', 'parentId', 'title', 'status', 'closingStatus', 'closingNotes', 'closedAt'];
  const KEY_RESULT_FIELDS = ['id', 'parentId', 'description', 'type', 'status', 'startValue', 'currentValue', 'targetValue'];

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

  /** Re-fetch only themeProgress from backend. */
  async function refreshProgress() {
    try {
      themeProgress = await getBindings().GetAllThemeProgress();
    } catch {
      themeProgress = [];
    }
  }

  /** Recursively find an objective by ID and call updater on it. Returns true if found. */
  function updateObjectiveInTree(objectives: Objective[], id: string, updater: (obj: Objective) => void): boolean {
    for (const obj of objectives) {
      if (obj.id === id) { updater(obj); return true; }
      if (updateObjectiveInTree(obj.objectives ?? [], id, updater)) return true;
    }
    return false;
  }

  /** Recursively find a key result by ID and call updater on it. Returns true if found. */
  function updateKeyResultInTree(objectives: Objective[], krId: string, updater: (kr: KeyResult) => void): boolean {
    for (const obj of objectives) {
      const kr = obj.keyResults.find(k => k.id === krId);
      if (kr) { updater(kr); return true; }
      if (updateKeyResultInTree(obj.objectives ?? [], krId, updater)) return true;
    }
    return false;
  }

  /** Recursively remove an objective by ID. Returns true if found and removed. */
  function removeObjectiveFromTree(objectives: Objective[], id: string): boolean {
    const idx = objectives.findIndex(o => o.id === id);
    if (idx >= 0) { objectives.splice(idx, 1); return true; }
    for (const obj of objectives) {
      if (removeObjectiveFromTree(obj.objectives ?? [], id)) return true;
    }
    return false;
  }

  /** Recursively remove a key result by ID. Returns true if found and removed. */
  function removeKeyResultFromTree(objectives: Objective[], krId: string): boolean {
    for (const obj of objectives) {
      const idx = obj.keyResults.findIndex(k => k.id === krId);
      if (idx >= 0) { obj.keyResults.splice(idx, 1); return true; }
      if (removeKeyResultFromTree(obj.objectives ?? [], krId)) return true;
    }
    return false;
  }

  /** Insert an objective under a theme or objective by parent ID. */
  function insertObjectiveUnderParent(themeList: LifeTheme[], parentId: string, newObj: Objective) {
    // Check if parentId is a theme
    const theme = themeList.find(t => t.id === parentId);
    if (theme) { theme.objectives.push(newObj); return; }
    // Otherwise search in the objective tree
    for (const t of themeList) {
      if (updateObjectiveInTree(t.objectives, parentId, (obj) => {
        if (!obj.objectives) obj.objectives = [];
        obj.objectives.push(newObj);
      })) return;
    }
  }

  async function verifyThemeState() {
    const backendThemes = await getBindings().GetHierarchy();
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
      const result = await getBindings().Establish({ parentId: '', goalType: 'theme', name: newThemeName.trim(), color: newThemeColor });
      const created = result.theme!;
      created.objectives = created.objectives ?? [];
      created.routines = created.routines ?? [];
      themes = [...themes, created];
      await refreshProgress();
      await verifyThemeState();
      newThemeName = '';
      newThemeColor = COLOR_PALETTE[0];
      showNewThemeForm = false;
    } catch (e) {
      console.error('Failed to create theme:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  async function reviseTheme(themeId: string, name: string, color: string) {
    try {
      await getBindings().Revise({ goalId: themeId, name, color });
      const idx = themes.findIndex(t => t.id === themeId);
      if (idx >= 0) { themes[idx].name = name; themes[idx].color = color; }
      themes = themes;
      await verifyThemeState();
      editingThemeId = null;
    } catch (e) {
      console.error('Failed to update theme:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  async function deleteTheme(id: string) {
    if (!confirm('Are you sure you want to delete this theme and all its objectives?')) return;

    try {
      await getBindings().Dismiss(id);
      themes = themes.filter(t => t.id !== id);
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to delete theme:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Establish for objective — parentId can be a theme ID or an objective ID
  async function createObjective(parentId: string) {
    if (!newObjectiveTitle.trim()) return;

    try {
      const result = await getBindings().Establish({ parentId, goalType: 'objective', title: newObjectiveTitle.trim() });
      const created = result.objective!;
      created.keyResults = created.keyResults ?? [];
      created.objectives = created.objectives ?? [];
      insertObjectiveUnderParent(themes, parentId, created);
      themes = themes;
      await verifyThemeState();
      newObjectiveTitle = '';
      addingObjectiveTo = null;
      // Expand the parent to show the new objective
      expandId(parentId);
    } catch (e) {
      console.error('Failed to create objective:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Revise for objective: (goalId, title, tags)
  async function updateObjective(objectiveId: string, newTitle: string, tags: string[]) {
    try {
      await getBindings().Revise({ goalId: objectiveId, title: newTitle, tags });
      for (const t of themes) {
        if (updateObjectiveInTree(t.objectives, objectiveId, (obj) => { obj.title = newTitle; obj.tags = tags; })) break;
      }
      themes = themes;
      await verifyThemeState();
      editingObjectiveId = null;
    } catch (e) {
      console.error('Failed to update objective:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Dismiss for objective
  async function deleteObjective(objectiveId: string) {
    if (!confirm('Are you sure you want to delete this objective and all its children?')) return;

    try {
      await getBindings().Dismiss(objectiveId);
      for (const t of themes) {
        if (removeObjectiveFromTree(t.objectives, objectiveId)) break;
      }
      themes = themes;
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to delete objective:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Establish for key result
  async function createKeyResult(objectiveId: string) {
    if (!newKeyResultDescription.trim()) return;

    try {
      const result = await getBindings().Establish({ parentId: objectiveId, goalType: 'key-result', description: newKeyResultDescription.trim(), startValue: newKeyResultStartValue, targetValue: newKeyResultTargetValue });
      const created = result.keyResult!;
      for (const t of themes) {
        if (updateObjectiveInTree(t.objectives, objectiveId, (obj) => { obj.keyResults.push(created); })) break;
      }
      themes = themes;
      await refreshProgress();
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
      await loadThemes();
    }
  }

  // RecordProgress — quick update of currentValue only
  async function updateKeyResultProgress(keyResultId: string, currentValue: number) {
    try {
      await getBindings().RecordProgress(keyResultId, currentValue);
      for (const t of themes) {
        if (updateKeyResultInTree(t.objectives, keyResultId, (kr) => { kr.currentValue = currentValue; })) break;
      }
      themes = themes;
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to update key result progress:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Dismiss for key result
  async function deleteKeyResult(keyResultId: string) {
    if (!confirm('Are you sure you want to delete this key result?')) return;

    try {
      await getBindings().Dismiss(keyResultId);
      for (const t of themes) {
        if (removeKeyResultFromTree(t.objectives, keyResultId)) break;
      }
      themes = themes;
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to delete key result:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Routine CRUD
  async function createRoutine(themeId: string) {
    if (!newRoutineDescription.trim()) return;

    try {
      const result = await getBindings().Establish({ parentId: themeId, goalType: 'routine', description: newRoutineDescription.trim(), targetValue: newRoutineTargetValue, targetType: newRoutineTargetType, unit: newRoutineUnit });
      const created = result.routine!;
      const theme = themes.find(t => t.id === themeId);
      if (theme) {
        if (!theme.routines) theme.routines = [];
        theme.routines.push(created);
      }
      themes = themes;
      await verifyThemeState();
      newRoutineDescription = '';
      newRoutineTargetValue = 1;
      newRoutineTargetType = 'at-or-above';
      newRoutineUnit = '';
      addingRoutineToTheme = null;
    } catch (e) {
      console.error('Failed to create routine:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  async function updateRoutine(routineId: string) {
    try {
      // Revise for metadata changes
      await getBindings().Revise({ goalId: routineId, description: editRoutineDescription, targetValue: editRoutineTargetValue, targetType: editRoutineTargetType, unit: editRoutineUnit });
      // RecordProgress for currentValue change
      await getBindings().RecordProgress(routineId, editRoutineCurrentValue);
      for (const t of themes) {
        const r = (t.routines ?? []).find(r => r.id === routineId);
        if (r) { r.description = editRoutineDescription; r.currentValue = editRoutineCurrentValue; r.targetValue = editRoutineTargetValue; r.targetType = editRoutineTargetType; r.unit = editRoutineUnit; break; }
      }
      themes = themes;
      await verifyThemeState();
      editingRoutineId = null;
    } catch (e) {
      console.error('Failed to update routine:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  async function updateRoutineCurrentValue(routineId: string, currentValue: number, _routine: Routine) {
    try {
      await getBindings().RecordProgress(routineId, currentValue);
      for (const t of themes) {
        const r = (t.routines ?? []).find(r => r.id === routineId);
        if (r) { r.currentValue = currentValue; break; }
      }
      themes = themes;
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to update routine current value:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  async function deleteRoutine(routineId: string) {
    if (!confirm('Are you sure you want to delete this routine?')) return;

    try {
      await getBindings().Dismiss(routineId);
      for (const t of themes) {
        if (t.routines) {
          const idx = t.routines.findIndex(r => r.id === routineId);
          if (idx >= 0) { t.routines.splice(idx, 1); break; }
        }
      }
      themes = themes;
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to delete routine:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  function startEditRoutine(routine: Routine) {
    editingRoutineId = routine.id;
    editRoutineDescription = routine.description;
    editRoutineCurrentValue = routine.currentValue;
    editRoutineTargetValue = routine.targetValue;
    editRoutineTargetType = routine.targetType;
    editRoutineUnit = routine.unit ?? '';
  }

  function isRoutineOnTrack(routine: Routine): boolean {
    if (routine.targetType === 'at-or-below') return routine.currentValue <= routine.targetValue;
    return routine.currentValue >= routine.targetValue;
  }

  // Status helpers
  function isActive(status: string | undefined): boolean {
    return !status || status === 'active';
  }


  // OKR Status changes
  async function setObjectiveStatus(objectiveId: string, status: string) {
    try {
      await getBindings().SetObjectiveStatus(objectiveId, status);
      for (const t of themes) {
        if (updateObjectiveInTree(t.objectives, objectiveId, (obj) => { obj.status = status; })) break;
      }
      themes = themes;
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to set objective status:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  async function setKeyResultStatus(keyResultId: string, status: string) {
    try {
      await getBindings().SetKeyResultStatus(keyResultId, status);
      for (const t of themes) {
        if (updateKeyResultInTree(t.objectives, keyResultId, (kr) => { kr.status = status; })) break;
      }
      themes = themes;
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to set key result status:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Closing workflow helpers
  const CLOSING_STATUS_OPTIONS = [
    { value: 'achieved', label: 'Achieved', description: 'All key results met or exceeded' },
    { value: 'partially-achieved', label: 'Partially Achieved', description: 'Some key results met' },
    { value: 'missed', label: 'Missed', description: 'Key results not met' },
    { value: 'postponed', label: 'Postponed', description: 'Deferred to a future period' },
    { value: 'canceled', label: 'Canceled', description: 'No longer relevant' },
  ] as const;

  function closingStatusLabel(status: string): string {
    const opt = CLOSING_STATUS_OPTIONS.find(o => o.value === status);
    return opt ? opt.label : status;
  }

  function getClosingObjective(): Objective | undefined {
    if (!closingObjectiveId) return undefined;
    for (const theme of themes) {
      const found = findObjectiveInTree(theme.objectives, closingObjectiveId);
      if (found) return found;
    }
    return undefined;
  }

  function findObjectiveInTree(objectives: Objective[], id: string): Objective | undefined {
    for (const obj of objectives) {
      if (obj.id === id) return obj;
      const found = findObjectiveInTree(obj.objectives ?? [], id);
      if (found) return found;
    }
    return undefined;
  }

  function openCloseDialog(objectiveId: string) {
    closingObjectiveId = objectiveId;
    closingStatus = 'achieved';
    closingNotes = '';
  }

  async function closeObjective() {
    if (!closingObjectiveId) return;
    try {
      await getBindings().CloseObjective(closingObjectiveId, closingStatus, closingNotes);
      const oid = closingObjectiveId;
      closingObjectiveId = null;
      for (const t of themes) {
        if (updateObjectiveInTree(t.objectives, oid, (obj) => { obj.status = 'completed'; obj.closingStatus = closingStatus; obj.closingNotes = closingNotes; })) break;
      }
      themes = themes;
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to close objective:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  async function reopenObjective(objectiveId: string) {
    try {
      await getBindings().ReopenObjective(objectiveId);
      for (const t of themes) {
        if (updateObjectiveInTree(t.objectives, objectiveId, (obj) => { obj.status = 'active'; obj.closingStatus = undefined; obj.closingNotes = undefined; obj.closedAt = undefined; })) break;
      }
      themes = themes;
      await refreshProgress();
      await verifyThemeState();
    } catch (e) {
      console.error('Failed to reopen objective:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  function krProgressPercent(kr: KeyResult): number {
    const target = kr.targetValue ?? 0;
    if (target === 0) return -1;
    const start = kr.startValue ?? 0;
    const range = target - start;
    if (range === 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((kr.currentValue ?? 0) - start) / range * 100)));
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
    reviseTheme(theme.id, editThemeName, editThemeColor);
  }

  function submitEditObjective(objective: Objective) {
    updateObjective(objective.id, editObjectiveTitle, editObjectiveTags);
  }

  async function submitEditKeyResult(kr: KeyResult) {
    const descChanged = editKeyResultDescription !== kr.description;
    const startChanged = editKeyResultStartValue !== (kr.startValue ?? 0);
    const targetChanged = editKeyResultTargetValue !== (kr.targetValue ?? 0);

    if (!descChanged && !startChanged && !targetChanged) {
      editingKeyResultId = null;
      return;
    }

    try {
      const req: Record<string, unknown> = { goalId: kr.id };
      if (descChanged) req.description = editKeyResultDescription;
      if (startChanged) req.startValue = editKeyResultStartValue;
      if (targetChanged) req.targetValue = editKeyResultTargetValue;
      await getBindings().Revise(req as { goalId: string; description?: string; startValue?: number; targetValue?: number });
      for (const t of themes) {
        if (updateKeyResultInTree(t.objectives, kr.id, (k) => {
          if (descChanged) k.description = editKeyResultDescription;
          if (startChanged) k.startValue = editKeyResultStartValue;
          if (targetChanged) k.targetValue = editKeyResultTargetValue;
        })) break;
      }
      themes = themes;
      if (startChanged || targetChanged) await refreshProgress();
      await verifyThemeState();
      editingKeyResultId = null;
    } catch (e) {
      console.error('Failed to update key result:', e);
      error = extractError(e);
      await loadThemes();
    }
  }

  // Cancel editing
  function cancelEdit() {
    editingThemeId = null;
    editingObjectiveId = null;
    editingKeyResultId = null;
    editingRoutineId = null;
  }

  function getColorConflicts(color: string, excludeThemeId?: string): string[] {
    return themes
      .filter(t => t.color.toLowerCase() === color.toLowerCase() && t.id !== excludeThemeId)
      .map(t => t.name);
  }

  // Advisor methods
  async function handleRequestAdvice(message: string, history: ChatMessage[], selectedIds?: string[]): Promise<{text: string; suggestions?: {type: string; action: string; themeData?: {id?: string; name: string; color?: string}; objectiveData?: {id?: string; title: string; parentId?: string}; keyResultData?: {id?: string; description: string; startValue: number; currentValue: number; targetValue: number; parentObjectiveId?: string}; routineData?: {id?: string; description: string; targetValue: number; targetType: string; unit?: string; themeId?: string}}[]}> {
    const bindings = getBindings();
    const historyJSON = JSON.stringify(history.map(m => ({role: m.role === 'advisor' ? 'assistant' : m.role, content: m.content})));
    const result = await bindings.RequestAdvice(message, historyJSON, selectedIds ?? selectedOKRIds);
    // After getting advice, refresh themes to pick up any state changes
    await loadThemes();
    return result as {text: string; suggestions?: {type: string; action: string; themeData?: {id?: string; name: string; color?: string}; objectiveData?: {id?: string; title: string; parentId?: string}; keyResultData?: {id?: string; description: string; startValue: number; currentValue: number; targetValue: number; parentObjectiveId?: string}; routineData?: {id?: string; description: string; targetValue: number; targetType: string; unit?: string; themeId?: string}}[]};
  }

  async function handleAcceptSuggestion(suggestion: {type: string; action: string; themeData?: {id?: string; name: string; color?: string}; objectiveData?: {id?: string; title: string; parentId?: string}; keyResultData?: {id?: string; description: string; startValue: number; currentValue: number; targetValue: number; parentObjectiveId?: string}; routineData?: {id?: string; description: string; targetValue: number; targetType: string; unit?: string; themeId?: string}}): Promise<void> {
    const bindings = getBindings();
    const suggestionJSON = JSON.stringify(suggestion);
    const parentContext = selectedOKRIds.length > 0 ? selectedOKRIds[0] : '';
    await bindings.AcceptSuggestion(suggestionJSON, parentContext);
    await loadThemes();
  }

  async function handleRecheckModels() {
    try {
      advisorModels = await getBindings().GetAvailableModels();
      advisorAvailable = advisorModels.some(m => m.available);
    } catch {
      advisorAvailable = false;
    }
  }

  async function toggleAdvisorPanel() {
    if (!advisorEnabled) {
      // First click: enable the advisor
      try {
        await getBindings().SetAdviceSetting(true);
        advisorEnabled = true;
        advisorModels = await getBindings().GetAvailableModels();
        advisorAvailable = advisorModels.some(m => m.available);
        advisorPanelOpen = true;
      } catch {
        // Silently fail — button remains, user can retry
      }
      return;
    }
    advisorPanelOpen = !advisorPanelOpen;
  }

  function toggleOKRSelection(itemId: string, event: MouseEvent) {
    // Only respond to Cmd+Click (macOS) / Ctrl+Click
    if (!event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey && lastSelectedId) {
      // Range selection: select all items between lastSelectedId and itemId
      const allIds = collectAllItemIds(themes);
      const startIdx = allIds.indexOf(lastSelectedId);
      const endIdx = allIds.indexOf(itemId);
      if (startIdx >= 0 && endIdx >= 0) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        selectedOKRIds = allIds.slice(from, to + 1);
        return;
      }
    }

    // Toggle individual selection
    if (selectedOKRIds.includes(itemId)) {
      selectedOKRIds = selectedOKRIds.filter(id => id !== itemId);
    } else {
      selectedOKRIds = [...selectedOKRIds, itemId];
    }
    lastSelectedId = itemId;
  }

  function collectAllItemIds(themeList: LifeTheme[]): string[] {
    const ids: string[] = [];
    for (const theme of themeList) {
      ids.push(theme.id);
      for (const obj of theme.objectives) {
        collectObjectiveIds(obj, ids);
      }
      for (const routine of theme.routines ?? []) {
        ids.push(routine.id);
      }
    }
    return ids;
  }

  function collectObjectiveIds(obj: Objective, ids: string[]) {
    ids.push(obj.id);
    for (const kr of obj.keyResults) ids.push(kr.id);
    for (const child of obj.objectives ?? []) collectObjectiveIds(child, ids);
  }

  function handleOKRKeyDown(event: KeyboardEvent) {
    const modKey = event.ctrlKey || event.metaKey;
    if (modKey && event.shiftKey && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      toggleAdvisorPanel();
    }
  }

  onMount(async () => {
    try {
      const navCtx = await getBindings().LoadNavigationContext();
      if (navCtx) {
        showCompleted = navCtx.showCompleted ?? false;
        showArchived = navCtx.showArchived ?? false;
        visionCollapsed = navCtx.visionCollapsed ?? true;
        if (navCtx.expandedOkrIds?.length) {
          for (const id of navCtx.expandedOkrIds) {
            expandedIds.add(id);
          }
        }
      }
    } catch {
      // Ignore errors loading nav context
    }
    contextLoaded = true;
    loadThemes();
    loadVision();

    // Load advisor setting and availability
    try {
      advisorEnabled = await getBindings().GetAdviceSetting();
      if (advisorEnabled) {
        advisorModels = await getBindings().GetAvailableModels();
        advisorAvailable = advisorModels.some(m => m.available);
      }
    } catch {
      // Advisor not available — graceful degradation
    }
  });

  // Persist toggle states to NavigationContext
  $effect(() => {
    const sc = showCompleted;
    const sa = showArchived;
    const vc = visionCollapsed;
    if (!contextLoaded) return;
    untrack(() => {
      getBindings().LoadNavigationContext().then((ctx) => {
        if (ctx) {
          getBindings().SaveNavigationContext({ ...ctx, showCompleted: sc, showArchived: sa, visionCollapsed: vc });
        }
      }).catch(() => { /* ignore */ });
    });
  });

  // Persist expanded node IDs to NavigationContext
  $effect(() => {
    const _size = expandedIds.size;
    const ids = [...expandedIds];
    if (!contextLoaded) return;
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

<svelte:window onkeydown={handleOKRKeyDown} />

<div class="okr-view">
  <div class="okr-content">
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
      <Button variant={advisorPanelOpen ? "primary" : "secondary"} onclick={toggleAdvisorPanel}>
        {advisorPanelOpen ? 'Close Advisor' : 'Advisor'}
      </Button>
    </div>
  </header>

  {#if error}
    <ErrorBanner message={error} ondismiss={() => error = null} />
  {/if}

  <!-- Vision & Mission Section -->
  <section class="vision-section">
    <button class="vision-header" onclick={() => { visionCollapsed = !visionCollapsed; }}>
      <span class="expand-icon">{visionCollapsed ? '\u25B6' : '\u25BC'}</span>
      <span class="vision-title">Vision & Mission</span>
    </button>
    {#if !visionCollapsed}
      <div class="vision-body">
        {#if personalVision.mission || personalVision.vision}
          <div class="vision-content">
            {#if personalVision.vision}
              <div class="vision-field">
                <span class="vision-label">Vision</span>
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
                <div class="vision-text markdown-content" onclick={handleVisionLinkClick}>{@html renderMarkdown(personalVision.vision)}</div>
              </div>
            {/if}
            {#if personalVision.mission}
              <div class="vision-field">
                <span class="vision-label">Mission</span>
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
                <div class="vision-text markdown-content" onclick={handleVisionLinkClick}>{@html renderMarkdown(personalVision.mission)}</div>
              </div>
            {/if}
          </div>
          <div class="vision-actions">
            <Button variant="secondary" onclick={startEditVision}>Edit</Button>
          </div>
        {:else}
          <div class="vision-empty">
            <span class="vision-placeholder">Set your personal vision...</span>
            <Button variant="secondary" onclick={startEditVision}>Edit</Button>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Vision Edit Dialog -->
  {#if editingVision}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="vision-dialog-overlay" onkeydown={(e) => { if (e.key === 'Escape') editingVision = false; }}>
      <div class="vision-dialog">
        <h2>Edit Vision & Mission</h2>
        <div class="vision-dialog-body">
          {#if previewMode}
            <div class="vision-dialog-label">
              <span>Vision</span>
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
              <div class="vision-preview markdown-content" onclick={handleVisionLinkClick}>{@html renderMarkdown(editVisionVision)}</div>
            </div>
            <div class="vision-dialog-label">
              <span>Mission</span>
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
              <div class="vision-preview markdown-content" onclick={handleVisionLinkClick}>{@html renderMarkdown(editVisionMission)}</div>
            </div>
          {:else}
            <label class="vision-dialog-label">
              Vision
              <textarea class="vision-textarea" bind:value={editVisionVision} placeholder="What is your long-term vision?" rows="3"></textarea>
            </label>
            <label class="vision-dialog-label">
              Mission
              <textarea class="vision-textarea" bind:value={editVisionMission} placeholder="What is your personal mission?" rows="3"></textarea>
            </label>
          {/if}
        </div>
        <div class="vision-dialog-actions">
          {#if previewMode}
            <Button variant="secondary" onclick={() => { previewMode = false; }}>Edit</Button>
          {:else}
            <Button variant="secondary" onclick={() => { previewMode = true; }}>Preview</Button>
          {/if}
          <Button variant="primary" onclick={saveVision}>Save</Button>
          <Button variant="secondary" onclick={() => { editingVision = false; }}>Cancel</Button>
        </div>
      </div>
    </div>
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
    <ThemeOKRTree
      themes={filteredThemes}
      mode="edit"
      {expandedIds}
      {showCompleted}
      {showArchived}
      {highlightItemId}
    >
      {#snippet themeHeader(theme: LifeTheme)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="item-header theme-header" class:selected-okr={selectedOKRIds.includes(theme.id)} onclick={(e) => toggleOKRSelection(theme.id, e)}>
          <button
            class="expand-button"
            onclick={() => toggleExpanded(theme.id)}
            aria-expanded={expandedIds.has(theme.id)}
          >
            <span class="expand-icon">{expandedIds.has(theme.id) ? '\u25BC' : '\u25B6'}</span>
          </button>
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
            </div>
            {@const editConflicts = getColorConflicts(editThemeColor, theme.id)}
            {#if editConflicts.length > 0}
              <div class="color-warning">Already used by: {editConflicts.join(', ')}</div>
            {/if}
            <Button variant="icon" color="save" onclick={() => submitEditTheme(theme)} title="Save">✅</Button>
            <Button variant="icon" color="cancel" onclick={cancelEdit} title="Cancel">❌</Button>
          {:else}
            <span class="theme-pill" style="background-color: {theme.color};">{theme.name}</span>
            <span class="item-id">{theme.id}</span>
            {@const tp = getThemeProgressValue(theme.id)}
            {#if tp >= 0}
              <span class="progress-bar"><span class="progress-fill" style="width: {tp}%"></span></span>
              <span class="progress-text">{Math.round(tp)}%</span>
            {/if}
            <div class="item-actions">
              {#if onNavigateToCalendar}
                <Button
                  variant="icon" color="nav"
                  onclick={() => onNavigateToCalendar?.(undefined, theme.id)}
                  title="View in Calendar"
                >📅</Button>
              {/if}
              {#if onNavigateToTasks}
                <Button
                  variant="icon" color="nav"
                  onclick={() => onNavigateToTasks?.({ themeId: theme.id })}
                  title="View Tasks"
                >📋</Button>
              {/if}
              <Button variant="icon" color="edit" onclick={() => startEditTheme(theme)} title="Edit">✏️</Button>
              <Button variant="icon" color="delete" onclick={() => deleteTheme(theme.id)} title="Delete">🗑️</Button>
              <Button
                variant="icon" color="add"
                onclick={() => { addingObjectiveTo = theme.id; expandId(theme.id); }}
                title="Add OKR"
              >+ OKR</Button>
              {#if FEATURE_ROUTINES_ENABLED}
                <Button
                  variant="icon" color="add"
                  onclick={() => { addingRoutineToTheme = theme.id; expandId(theme.id); }}
                  title="Add Routine"
                >+ Routine</Button>
              {/if}
            </div>
          {/if}
        </div>
      {/snippet}

      {#snippet themeExtra(theme: LifeTheme)}
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

        {#if FEATURE_ROUTINES_ENABLED}
          {#if theme.objectives.length === 0 && !(theme.routines?.length) && addingObjectiveTo !== theme.id && addingRoutineToTheme !== theme.id}
            <div class="empty-state">
              No objectives or routines yet.
              <button class="link-button" onclick={() => { addingObjectiveTo = theme.id; }}>Add an OKR</button>
              or
              <button class="link-button" onclick={() => { addingRoutineToTheme = theme.id; }}>add a routine</button>
            </div>
          {/if}
        {:else}
          {#if theme.objectives.length === 0 && addingObjectiveTo !== theme.id}
            <div class="empty-state">
              No objectives yet.
              <button class="link-button" onclick={() => { addingObjectiveTo = theme.id; }}>Add an OKR</button>
            </div>
          {/if}
        {/if}

        {#if FEATURE_ROUTINES_ENABLED}
          <!-- Routines Section -->
          <div class="routine-section">
            {#if addingRoutineToTheme === theme.id}
              <div class="new-item-form routine-form">
                <input
                  type="text"
                  placeholder="Routine description"
                  bind:value={newRoutineDescription}
                  onkeydown={(e) => { if (e.key === 'Enter') createRoutine(theme.id); if (e.key === 'Escape') { addingRoutineToTheme = null; newRoutineDescription = ''; } }}
                />
                <div class="routine-form-row">
                  <label class="routine-field-label">Target
                    <input type="number" class="routine-field-input" bind:value={newRoutineTargetValue} min="1" />
                  </label>
                  <label class="routine-field-label routine-field-fixed">Type
                    <select class="routine-field-select" bind:value={newRoutineTargetType}>
                      <option value="at-or-above">&ge; (at or above)</option>
                      <option value="at-or-below">&le; (at or below)</option>
                    </select>
                  </label>
                  <label class="routine-field-label">Unit
                    <input type="text" class="routine-field-input" bind:value={newRoutineUnit} placeholder="e.g. kg, %" />
                  </label>
                  <Button variant="primary" onclick={() => createRoutine(theme.id)}>Create</Button>
                  <Button variant="secondary" onclick={() => { addingRoutineToTheme = null; newRoutineDescription = ''; newRoutineTargetValue = 1; newRoutineTargetType = 'at-or-above'; newRoutineUnit = ''; }}>Cancel</Button>
                </div>
              </div>
            {/if}

            {#each theme.routines ?? [] as routine (routine.id)}
              <div class="routine-card">
                {#if editingRoutineId === routine.id}
                  <div class="routine-edit-form">
                    <input type="text" class="inline-edit" bind:value={editRoutineDescription}
                      onkeydown={(e) => { if (e.key === 'Enter') updateRoutine(routine.id); if (e.key === 'Escape') cancelEdit(); }} />
                    <div class="routine-form-row">
                      <label class="routine-field-label">Current
                        <input type="number" class="routine-field-input" bind:value={editRoutineCurrentValue} />
                      </label>
                      <label class="routine-field-label">Target
                        <input type="number" class="routine-field-input" bind:value={editRoutineTargetValue} min="1" />
                      </label>
                      <label class="routine-field-label routine-field-fixed">Type
                        <select class="routine-field-select" bind:value={editRoutineTargetType}>
                          <option value="at-or-above">&ge; (at or above)</option>
                          <option value="at-or-below">&le; (at or below)</option>
                        </select>
                      </label>
                      <label class="routine-field-label">Unit
                        <input type="text" class="routine-field-input" bind:value={editRoutineUnit} placeholder="e.g. kg, %" />
                      </label>
                      <Button variant="icon" color="save" onclick={() => updateRoutine(routine.id)} title="Save">✅</Button>
                      <Button variant="icon" color="cancel" onclick={cancelEdit} title="Cancel">❌</Button>
                    </div>
                  </div>
                {:else}
                  <div class="routine-display">
                    <span class="routine-status-dot" class:on-track={isRoutineOnTrack(routine)} class:off-track={!isRoutineOnTrack(routine)}></span>
                    <span class="routine-description">{routine.description}</span>
                    <span class="routine-values">
                      <input
                        type="number"
                        class="routine-current-input"
                        value={routine.currentValue}
                        onchange={(e) => updateRoutineCurrentValue(routine.id, parseInt((e.target as HTMLInputElement).value) || 0, routine)}
                        title="Current value"
                      />
                      <span class="routine-direction">{routine.targetType === 'at-or-below' ? '\u2264' : '\u2265'}</span>
                      <span class="routine-target">{routine.targetValue}</span>
                      {#if routine.unit}
                        <span class="routine-unit">{routine.unit}</span>
                      {/if}
                    </span>
                    <div class="item-actions">
                      <Button variant="icon" color="edit" onclick={() => startEditRoutine(routine)} title="Edit">✏️</Button>
                      <Button variant="icon" color="delete" onclick={() => deleteRoutine(routine.id)} title="Delete">🗑️</Button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/snippet}

      {#snippet objectiveHeader(objective: Objective, themeColor: string)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="item-header objective-header" class:okr-completed={!isActive(objective.status)} class:selected-okr={selectedOKRIds.includes(objective.id)} onclick={(e) => toggleOKRSelection(objective.id, e)}>
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
                <Button variant="icon" color="save" onclick={() => submitEditObjective(objective)} title="Save">✅</Button>
                <Button variant="icon" color="cancel" onclick={cancelEdit} title="Cancel">❌</Button>
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
            {@const op = getObjectiveProgress(objective.id)}
            {#if isActive(objective.status)}
              <span class="status-dot {getObjectiveStatus(op)}"></span>
            {/if}
            {#if objective.closingStatus}
              <span class="closing-badge closing-badge-{objective.closingStatus}">{closingStatusLabel(objective.closingStatus)}</span>
            {/if}
            {#if op >= 0}
              <span class="progress-bar"><span class="progress-fill" style="width: {op}%"></span></span>
              <span class="progress-text">{Math.round(op)}%</span>
            {/if}
            <div class="item-actions">
              {#if isActive(objective.status)}
                <Button variant="icon" color="complete" onclick={() => openCloseDialog(objective.id)} title="Close">✅</Button>
              {:else if objective.status === 'completed'}
                <Button variant="icon" color="reopen" onclick={() => reopenObjective(objective.id)} title="Reopen">🔄</Button>
                <Button variant="icon" color="archive" onclick={() => setObjectiveStatus(objective.id, 'archived')} title="Archive">📦</Button>
              {:else}
                <Button variant="icon" color="reopen" onclick={() => setObjectiveStatus(objective.id, 'active')} title="Reopen">🔄</Button>
              {/if}
              <Button variant="icon" color="edit" onclick={() => startEditObjective(objective)} title="Edit">✏️</Button>
              <Button variant="icon" color="delete" onclick={() => deleteObjective(objective.id)} title="Delete">🗑️</Button>
              <Button
                variant="icon" color="add"
                onclick={() => { addingObjectiveTo = objective.id; expandId(objective.id); }}
                title="Add Child Objective"
              >➕O</Button>
              <Button
                variant="icon" color="add"
                onclick={() => { addingKeyResultToObjective = objective.id; expandId(objective.id); }}
                title="Add Key Result"
              >➕KR</Button>
            </div>
          {/if}
        </div>
      {/snippet}

      {#snippet objectiveExtra(objective: Objective)}
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
              <Button variant="secondary" onclick={() => { addingKeyResultToObjective = null; newKeyResultDescription = ''; newKeyResultStartValue = 0; newKeyResultTargetValue = 1; }}>Cancel</Button>
            </div>
          </div>
        {/if}

        {#if (!objective.objectives || objective.objectives.length === 0) && objective.keyResults.length === 0 && addingKeyResultToObjective !== objective.id && addingObjectiveTo !== objective.id}
          <div class="empty-state">
            No children yet.
            <button class="link-button" onclick={() => { addingObjectiveTo = objective.id; }}>Add objective</button>
            or
            <button class="link-button" onclick={() => { addingKeyResultToObjective = objective.id; }}>Add key result</button>
          </div>
        {/if}

        {#if objective.closingNotes}
          <div class="closing-notes">
            <span class="closing-notes-label">Reflection:</span>
            <p class="closing-notes-text">{objective.closingNotes}</p>
          </div>
        {/if}
      {/snippet}

      {#snippet keyResultItem(kr: KeyResult, themeColor: string)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="item-header kr-header" class:okr-completed={!isActive(kr.status)} class:selected-okr={selectedOKRIds.includes(kr.id)} onclick={(e) => toggleOKRSelection(kr.id, e)}>
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
            <Button variant="icon" color="save" onclick={() => submitEditKeyResult(kr)} title="Save">✅</Button>
            <Button variant="icon" color="cancel" onclick={cancelEdit} title="Cancel">❌</Button>
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
                <Button variant="icon" color="complete" onclick={() => setKeyResultStatus(kr.id, 'completed')} title="Complete">✅</Button>
              {:else if kr.status === 'completed'}
                <Button variant="icon" color="reopen" onclick={() => setKeyResultStatus(kr.id, 'active')} title="Reopen">🔄</Button>
                <Button variant="icon" color="archive" onclick={() => setKeyResultStatus(kr.id, 'archived')} title="Archive">📦</Button>
              {:else}
                <Button variant="icon" color="reopen" onclick={() => setKeyResultStatus(kr.id, 'active')} title="Reopen">🔄</Button>
              {/if}
              <Button variant="icon" color="edit" onclick={() => startEditKeyResult(kr)} title="Edit">✏️</Button>
              <Button variant="icon" color="delete" onclick={() => deleteKeyResult(kr.id)} title="Delete">🗑️</Button>
            </div>
          {/if}
        </div>
      {/snippet}
    </ThemeOKRTree>

    {#if themes.length === 0 && !showNewThemeForm}
      <div class="empty-state large">
        <p>No life themes defined yet.</p>
        <p>Create your first theme to start organizing your goals!</p>
        <Button variant="primary" onclick={() => { showNewThemeForm = true; }}>
          + Add Your First Theme
        </Button>
      </div>
    {/if}
  {/if}
  </div><!-- .okr-content -->

  {#if advisorEnabled}
    <div class="advisor-panel" class:open={advisorPanelOpen}>
      <div class="advisor-panel-header">
        <h3>Goal Advisor</h3>
        <button class="advisor-close-btn" onclick={toggleAdvisorPanel} aria-label="Close advisor panel">&times;</button>
      </div>
      {#if advisorModels.length > 0}
        <div class="advisor-model-badges">
          {#each advisorModels as model (model.name)}
            <span class="model-badge" class:available={model.available} class:unavailable={!model.available}>
              <span class="model-type-indicator">{model.type === 'local' ? '\uD83D\uDCBB' : '\u2601\uFE0F'}</span>
              {model.name}
            </span>
          {/each}
        </div>
      {/if}
      <AdvisorChat
        onRequestAdvice={handleRequestAdvice}
        onSendMessage={onAdvisorSend}
        onAcceptSuggestion={handleAcceptSuggestion}
        available={advisorAvailable}
        models={advisorModels}
        {selectedOKRIds}
        onRecheck={handleRecheckModels}
        bind:messages={advisorMessages}
        bind:busy={advisorBusy}
      />
    </div>
  {/if}
</div><!-- .okr-view -->

{#if closingObjectiveId}
  {@const closingObj = getClosingObjective()}
  {#if closingObj}
    <Dialog title="Close Objective" maxWidth="500px" onclose={() => { closingObjectiveId = null; }}>
      <p class="close-dialog-title">{closingObj.title}</p>

      {#if closingObj.keyResults.length > 0}
        <div class="close-dialog-kr-summary">
          <span class="close-dialog-section-label">Key Results</span>
          {#each closingObj.keyResults as kr (kr.id)}
            {@const pct = krProgressPercent(kr)}
            <div class="close-dialog-kr-row">
              <span class="close-dialog-kr-desc">{kr.description}</span>
              {#if pct >= 0}
                <span class="close-dialog-kr-pct">{pct}%</span>
              {:else}
                <span class="close-dialog-kr-pct">--</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="close-dialog-field">
        <span class="close-dialog-section-label">Closing Status</span>
        {#each CLOSING_STATUS_OPTIONS as opt (opt.value)}
          <label class="close-dialog-radio">
            <input type="radio" bind:group={closingStatus} value={opt.value} />
            <span class="close-dialog-radio-label">{opt.label}</span>
            <span class="close-dialog-radio-desc">{opt.description}</span>
          </label>
        {/each}
      </div>

      <div class="close-dialog-field">
        <label class="close-dialog-section-label" for="closing-notes">Reflection Notes</label>
        <textarea
          id="closing-notes"
          class="close-dialog-textarea"
          bind:value={closingNotes}
          placeholder="What worked? What would you do differently? What's next?"
          rows="3"
        ></textarea>
      </div>

      {#snippet actions()}
        <Button variant="secondary" onclick={() => { closingObjectiveId = null; }}>Cancel</Button>
        <Button variant="primary" onclick={closeObjective}>Close Objective</Button>
      {/snippet}
    </Dialog>
  {/if}
{/if}

<style>
  .okr-view {
    display: flex;
    flex-direction: row;
    min-height: 100%;
  }

  .okr-content {
    flex: 1;
    min-width: 0;
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

  .item-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }

  .theme-header {
    background-color: var(--color-gray-50);
  }

  .theme-pill {
    font-weight: 700;
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
    margin-left: auto;
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

  .objective-header {
    background-color: #fafafa;
  }

  .objective-marker {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
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

  .new-item-form input.routine-field-input {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0.25rem;
    font-size: 0.75rem;
    border-radius: 3px;
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

  /* Progress rollup bar */
  .progress-bar {
    display: inline-block;
    width: 60px;
    height: 6px;
    background: var(--color-gray-200, #e5e7eb);
    border-radius: 3px;
    vertical-align: middle;
    margin: 0 6px;
  }

  .progress-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--color-primary-500, #3b82f6);
    transition: width 0.2s;
  }

  .progress-text {
    font-size: 0.75rem;
    color: var(--color-gray-500, #6b7280);
  }

  /* Goal status indicator dot */
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
    flex-shrink: 0;
  }
  .status-dot.on-track { background-color: #22c55e; }
  .status-dot.needs-attention { background-color: #eab308; }
  .status-dot.off-track { background-color: #ef4444; }
  .status-dot.no-status { background-color: #9ca3af; }

  /* Vision & Mission Section */
  .vision-section {
    background-color: var(--color-gray-50);
    border: 1px solid var(--color-gray-200);
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .vision-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .vision-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-gray-700);
  }

  .vision-body {
    padding: 0 1rem 0.75rem;
  }

  .vision-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .vision-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vision-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-gray-500);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .vision-text {
    font-size: 0.875rem;
    color: var(--color-gray-700);
    line-height: 1.5;
  }

  .vision-actions {
    margin-top: 0.5rem;
  }

  .vision-empty {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .vision-placeholder {
    font-size: 0.875rem;
    color: var(--color-gray-400);
    font-style: italic;
  }

  /* Vision Edit Dialog */
  .vision-dialog-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .vision-dialog {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    width: 100%;
    max-width: 750px;
    height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  }

  .vision-dialog-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .vision-dialog h2 {
    margin: 0 0 1rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-gray-800);
  }

  .vision-dialog-label {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
    flex: 1;
    min-height: 0;
  }

  .vision-textarea {
    width: 100%;
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
  }

  .vision-textarea:focus {
    outline: none;
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .vision-preview {
    padding: 0.5rem;
    border: 1px solid var(--color-gray-200);
    border-radius: 4px;
    background-color: var(--color-gray-50);
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--color-gray-700);
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 0.5rem 0 0.25rem;
    color: var(--color-gray-800);
    line-height: 1.3;
  }
  .markdown-content :global(h1) { font-size: 1.25rem; }
  .markdown-content :global(h2) { font-size: 1.125rem; }
  .markdown-content :global(h3) { font-size: 1rem; }

  .markdown-content :global(p) {
    margin: 0 0 0.5rem;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0 0 0.5rem;
    padding-left: 1.5rem;
  }

  .markdown-content :global(li) {
    margin-bottom: 0.125rem;
  }

  .markdown-content :global(a) {
    color: var(--color-primary-500);
    text-decoration: underline;
    cursor: pointer;
  }
  .markdown-content :global(a:hover) {
    color: var(--color-primary-600);
  }

  .markdown-content :global(blockquote) {
    margin: 0.5rem 0;
    padding: 0.25rem 0.75rem;
    border-left: 3px solid var(--color-gray-300);
    color: var(--color-gray-600);
  }

  .markdown-content :global(code) {
    background-color: var(--color-gray-100);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-size: 0.8125rem;
  }

  .markdown-content :global(pre) {
    background-color: var(--color-gray-100);
    padding: 0.5rem;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-gray-200);
    margin: 0.75rem 0;
  }

  .vision-dialog-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  /* Routine Section */
  .routine-section {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--color-gray-200);
  }

  .routine-card {
    padding: 0.375rem 0.5rem;
    margin: 0.125rem 0;
    border-radius: 4px;
    background-color: #fafafa;
  }

  .routine-card:hover .item-actions {
    opacity: 1;
  }

  .routine-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .routine-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .routine-status-dot.on-track { background-color: #22c55e; }
  .routine-status-dot.off-track { background-color: #ef4444; }

  .routine-description {
    flex: 1;
    font-size: 0.875rem;
    color: var(--color-gray-700);
  }

  .routine-values {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-gray-600);
    flex-shrink: 0;
  }

  .routine-current-input {
    width: 40px;
    padding: 0 0.25rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 3px;
    font-size: 0.75rem;
    text-align: center;
  }

  .routine-current-input:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  .routine-direction {
    font-size: 0.875rem;
    color: var(--color-gray-500);
  }

  .routine-target {
    font-weight: 500;
  }

  .routine-unit {
    font-size: 0.75rem;
    color: var(--color-gray-400);
  }

  .routine-form {
    margin: 0.5rem 0;
  }

  .routine-form > input {
    width: 100%;
    flex-basis: 100%;
  }

  .routine-form-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .routine-edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .routine-field-label {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .routine-field-fixed {
    flex: 0 0 auto;
  }

  .routine-field-input {
    flex: 1;
    min-width: 0;
    width: 100%;
    padding: 0.25rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 3px;
    font-size: 0.75rem;
  }

  .routine-field-input:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  .routine-field-select {
    padding: 0.25rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 3px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .routine-field-select:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  /* Closing status badge */
  .closing-badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  .closing-badge-achieved { background-color: #dcfce7; color: #166534; }
  .closing-badge-partially-achieved { background-color: #fef9c3; color: #854d0e; }
  .closing-badge-missed { background-color: #fee2e2; color: #991b1b; }
  .closing-badge-postponed { background-color: #e0e7ff; color: #3730a3; }
  .closing-badge-canceled { background-color: #f3f4f6; color: #4b5563; }

  /* Closing notes display */
  .closing-notes {
    padding: 0.5rem 1rem;
    margin: 0.25rem 0;
    background-color: #f8fafc;
    border-left: 3px solid var(--color-gray-300);
    font-size: 0.8rem;
  }

  .closing-notes-label {
    font-weight: 600;
    color: var(--color-gray-500);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .closing-notes-text {
    margin: 0.25rem 0 0;
    color: var(--color-gray-600);
    line-height: 1.4;
    white-space: pre-wrap;
  }

  /* Close dialog styles */
  .close-dialog-title {
    font-weight: 600;
    margin: 0 0 0.75rem;
    color: var(--color-gray-800);
  }

  .close-dialog-kr-summary {
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: #f8fafc;
    border-radius: 4px;
  }

  .close-dialog-kr-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
    font-size: 0.8rem;
  }

  .close-dialog-kr-desc {
    color: var(--color-gray-700);
    flex: 1;
    margin-right: 0.5rem;
  }

  .close-dialog-kr-pct {
    font-weight: 500;
    color: var(--color-gray-500);
    font-family: monospace;
    flex-shrink: 0;
  }

  .close-dialog-field {
    margin-bottom: 1rem;
  }

  .close-dialog-section-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-gray-500);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.375rem;
  }

  .close-dialog-radio {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    padding: 0.25rem 0;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .close-dialog-radio input[type="radio"] {
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .close-dialog-radio-label {
    font-weight: 500;
    color: var(--color-gray-800);
  }

  .close-dialog-radio-desc {
    color: var(--color-gray-400);
    font-size: 0.75rem;
  }

  .close-dialog-textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
  }

  .close-dialog-textarea:focus {
    outline: none;
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  /* Advisor slide-out panel */
  .advisor-panel {
    width: 0;
    overflow: hidden;
    transition: width 0.3s ease;
    border-left: 1px solid var(--color-gray-200);
    display: flex;
    flex-direction: column;
    background: white;
    flex-shrink: 0;
  }

  .advisor-panel.open {
    width: 380px;
  }

  .advisor-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-gray-200);
    flex-shrink: 0;
  }

  .advisor-panel-header h3 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .advisor-close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--color-gray-500);
    padding: 0.25rem;
    line-height: 1;
  }

  .advisor-close-btn:hover {
    color: var(--color-gray-700);
  }

  .advisor-model-badges {
    padding: 0.5rem 1rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .model-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  .model-badge.available {
    background: color-mix(in srgb, var(--color-primary-500) 10%, white);
    color: var(--color-primary-600);
  }

  .model-badge.unavailable {
    opacity: 0.5;
  }

  .model-type-indicator {
    font-size: 0.75rem;
  }

  :global(.selected-okr) {
    background-color: color-mix(in srgb, var(--color-primary-500) 10%, transparent) !important;
    border-radius: 4px;
  }
</style>
