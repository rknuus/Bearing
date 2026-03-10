/**
 * Mock Wails Runtime for Browser-Based Testing
 *
 * This mock provides browser-compatible implementations of Wails bindings
 * for development and Playwright E2E tests running against Vite dev server.
 *
 * Wails v2 bindings are ONLY available in native WebView via IPC,
 * NOT via HTTP. This mock enables browser-based testing.
 */

// Types matching Go structs
export interface KeyResult {
  id: string;
  parentId?: string;
  description: string;
  type?: string;
  status?: string;
  startValue?: number;
  currentValue?: number;
  targetValue?: number;
}

export interface Objective {
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

export interface Routine {
  id: string;
  description: string;
  currentValue: number;
  targetValue: number;
  targetType: string; // "at-or-above" | "at-or-below"
  unit?: string;
}

export interface LifeTheme {
  id: string;
  name: string;
  color: string;
  objectives: Objective[];
  routines?: Routine[];
}

export interface DayFocus {
  date: string;
  themeIds?: string[];
  notes: string;
  text: string;
  okrIds?: string[];
  tags?: string[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  themeId: string;
  priority: string;
  tags?: string[];
  promotionDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskWithStatus extends Task {
  status: string;
}

export interface SectionDefinition {
  name: string;
  title: string;
  color: string;
}

export interface ColumnDefinition {
  name: string;
  title: string;
  type: string;
  sections?: SectionDefinition[];
}

export interface BoardConfiguration {
  name: string;
  columnDefinitions: ColumnDefinition[];
}

export interface RuleViolation {
  ruleId: string;
  priority: number;
  message: string;
  category: string;
}

export interface MoveTaskResult {
  success: boolean;
  violations?: RuleViolation[];
  positions?: Record<string, string[]>;
}

export interface ReorderResult {
  success: boolean;
  positions: Record<string, string[]>;
}

export interface PromotedTask {
  id: string;
  title: string;
  oldPriority: string;
  newPriority: string;
}

export interface ObjectiveProgress {
  objectiveId: string;
  progress: number;
}

export interface ThemeProgress {
  themeId: string;
  progress: number;
  objectives: ObjectiveProgress[];
}

export interface PersonalVision {
  mission: string;
  vision: string;
  updatedAt?: string;
}

export interface NavigationContext {
  currentView: string;
  currentItem: string;
  filterThemeId: string;
  filterThemeIds?: string[];
  lastAccessed: string;
  showCompleted?: boolean;
  showArchived?: boolean;
  showArchivedTasks?: boolean;
  expandedOkrIds?: string[];
  filterTagIds?: string[];
  todayFocusActive?: boolean;
  tagFocusActive?: boolean;
  collapsedSections?: string[];
  collapsedColumns?: string[];
  calendarDayEditorDate?: string;
  calendarDayEditorExpandedIds?: string[];
  visionCollapsed?: boolean;
}

// Type declarations for extended Window properties
type MockConfig = Record<string, never>;

interface WailsGoBindings {
  main?: {
    App?: typeof mockAppBindings;
  };
}

declare global {
  interface Window {
    __E2E_MOCK_CONFIG__?: MockConfig;
    go?: WailsGoBindings;
    runtime?: typeof mockRuntimeBindings;
  }
}

// Recursive tree-walk helpers for nested objectives

/** Search all themes for an objective by ID, returning it (or undefined). */
function findObjectiveById(themes: LifeTheme[], id: string): Objective | undefined {
  function searchObjectives(objectives: Objective[]): Objective | undefined {
    for (const obj of objectives) {
      if (obj.id === id) return obj;
      const found = searchObjectives(obj.objectives || []);
      if (found) return found;
    }
    return undefined;
  }
  for (const theme of themes) {
    const found = searchObjectives(theme.objectives);
    if (found) return found;
  }
  return undefined;
}

/** Find the parent objectives array and index for a given objective ID. */
function findObjectiveParent(themes: LifeTheme[], id: string): { list: Objective[]; index: number } | undefined {
  function searchObjectives(objectives: Objective[]): { list: Objective[]; index: number } | undefined {
    for (let i = 0; i < objectives.length; i++) {
      if (objectives[i].id === id) return { list: objectives, index: i };
      const found = searchObjectives(objectives[i].objectives || []);
      if (found) return found;
    }
    return undefined;
  }
  for (const theme of themes) {
    const found = searchObjectives(theme.objectives);
    if (found) return found;
  }
  return undefined;
}

/** Find the parent objective that owns a given key result ID, plus the KR index. */
function findKeyResultParent(themes: LifeTheme[], krId: string): { objective: Objective; index: number } | undefined {
  function searchObjectives(objectives: Objective[]): { objective: Objective; index: number } | undefined {
    for (const obj of objectives) {
      const idx = obj.keyResults.findIndex(kr => kr.id === krId);
      if (idx >= 0) return { objective: obj, index: idx };
      const found = searchObjectives(obj.objectives || []);
      if (found) return found;
    }
    return undefined;
  }
  for (const theme of themes) {
    const found = searchObjectives(theme.objectives);
    if (found) return found;
  }
  return undefined;
}

/** Find the theme that contains a given entity (objective, KR, or task by themeId). */
function findThemeForObjective(themes: LifeTheme[], objectiveId: string): LifeTheme | undefined {
  for (const theme of themes) {
    if (findObjectiveInList(theme.objectives, objectiveId)) return theme;
  }
  return undefined;
}

function findObjectiveInList(objectives: Objective[], id: string): boolean {
  for (const obj of objectives) {
    if (obj.id === id) return true;
    if (findObjectiveInList(obj.objectives || [], id)) return true;
  }
  return false;
}

/** Get max N from <abbr>-O<N> IDs within a single theme. */
function getMaxObjNumInTheme(theme: LifeTheme): number {
  const abbr = theme.id;
  let max = 0;
  const re = new RegExp(`^${abbr}-O(\\d+)$`);
  function scan(objectives: Objective[]) {
    for (const obj of objectives) {
      const match = obj.id.match(re);
      if (match) max = Math.max(max, parseInt(match[1]));
      scan(obj.objectives || []);
    }
  }
  scan(theme.objectives);
  return max;
}

/** Get max N from <abbr>-KR<N> IDs within a single theme. */
function getMaxKRNumInTheme(theme: LifeTheme): number {
  const abbr = theme.id;
  let max = 0;
  const re = new RegExp(`^${abbr}-KR(\\d+)$`);
  function scan(objectives: Objective[]) {
    for (const obj of objectives) {
      for (const kr of obj.keyResults) {
        const match = kr.id.match(re);
        if (match) max = Math.max(max, parseInt(match[1]));
      }
      scan(obj.objectives || []);
    }
  }
  scan(theme.objectives);
  return max;
}

/** Get max N from <abbr>-T<N> IDs for a given theme abbreviation. */
function getMaxTaskNumForTheme(tasks: TaskWithStatus[], themeAbbr: string): number {
  let max = 0;
  const re = new RegExp(`^${themeAbbr}-T(\\d+)$`);
  for (const t of tasks) {
    const match = t.id.match(re);
    if (match) max = Math.max(max, parseInt(match[1]));
  }
  return max;
}

/**
 * Suggest a theme abbreviation from a name, avoiding collisions with existing themes.
 */
function suggestAbbreviation(name: string, existingThemes: LifeTheme[]): string {
  const existingIds = new Set(existingThemes.map(t => t.id));
  const words = name.trim().split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) return 'A';

  // Multi-word: first letter of each word (up to 3)
  if (words.length >= 2) {
    const abbr = words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
    if (!existingIds.has(abbr)) return abbr;
  }

  // Single word or multi-word collision: try progressive lengths
  const word = words[0].toUpperCase();
  for (let len = 1; len <= 3 && len <= word.length; len++) {
    const abbr = word.substring(0, len);
    if (!existingIds.has(abbr)) return abbr;
  }

  // Fallback: try A-Z suffixes
  const base = word.substring(0, 2);
  for (let c = 65; c <= 90; c++) {
    const abbr = base + String.fromCharCode(c);
    if (!existingIds.has(abbr)) return abbr;
  }

  return word.substring(0, 3);
}

// Mock data storage for browser testing
let mockThemes: LifeTheme[] = [
  {
    id: 'HF',
    name: 'Health & Fitness',
    color: '#10b981',
    objectives: [
      {
        id: 'HF-O1',
        parentId: 'HF',
        title: 'Improve cardiovascular health',
        tags: ['Q1', 'health'],
        keyResults: [
          { id: 'HF-KR1', parentId: 'HF-O1', description: 'Run 5K in under 25 minutes', status: 'completed', startValue: 0, currentValue: 1, targetValue: 1 },
          { id: 'HF-KR2', parentId: 'HF-O1', description: 'Exercise 4 times per week', startValue: 0, currentValue: 3, targetValue: 4 },
        ],
        objectives: [
          {
            id: 'HF-O2',
            parentId: 'HF-O1',
            title: 'Build running endurance',
            keyResults: [
              { id: 'HF-KR3', parentId: 'HF-O2', description: 'Run 3 times per week for 8 weeks', startValue: 0, currentValue: 10, targetValue: 8 },
            ],
            objectives: [],
          },
        ],
      },
      {
        id: 'HF-O3',
        parentId: 'HF',
        title: 'Build strength',
        keyResults: [
          { id: 'HF-KR4', parentId: 'HF-O3', description: 'Complete 50 push-ups in one set', status: 'archived', startValue: 0, currentValue: 1, targetValue: 1 },
        ],
        objectives: [],
      },
    ],
    routines: [
      { id: 'HF-R1', description: 'Exercise sessions per week', currentValue: 3, targetValue: 3, targetType: 'at-or-above', unit: 'times/week' },
      { id: 'HF-R2', description: 'Body weight', currentValue: 82, targetValue: 80, targetType: 'at-or-below', unit: 'kg' },
    ],
  },
  {
    id: 'CG',
    name: 'Career Growth',
    color: '#3b82f6',
    objectives: [
      {
        id: 'CG-O1',
        parentId: 'CG',
        title: 'Develop leadership skills',
        tags: ['blocked'],
        keyResults: [
          { id: 'CG-KR1', parentId: 'CG-O1', description: 'Lead 2 major projects', startValue: 0, currentValue: 1, targetValue: 2 },
          { id: 'CG-KR2', parentId: 'CG-O1', description: 'Mentor 1 junior developer' },  // untracked KR (no target)
          { id: 'CG-KR3', parentId: 'CG-O1', description: 'Complete leadership course', type: 'binary', startValue: 0, currentValue: 0, targetValue: 1 },
        ],
        objectives: [],
      },
    ],
  },
  { id: 'PF', name: 'Personal Finance', color: '#f59e0b', objectives: [] },
  { id: 'L', name: 'Learning', color: '#8b5cf6', objectives: [] },
  { id: 'R', name: 'Relationships', color: '#ec4899', objectives: [] },
];

const mockYearFocus: Map<number, DayFocus[]> = new Map();

// Mock tasks storage
let mockTasks: TaskWithStatus[] = [
  { id: 'CG-T1', title: 'Complete project proposal', themeId: 'CG', priority: 'important-urgent', status: 'todo', tags: ['backend', 'api'], createdAt: '2026-01-31T08:00:00Z', updatedAt: '2026-01-31T08:00:00Z' },
  { id: 'HF-T1', title: 'Review quarterly goals', themeId: 'HF', priority: 'important-not-urgent', status: 'todo', createdAt: '2026-01-31T08:00:00Z', updatedAt: '2026-01-31T08:00:00Z' },
  { id: 'CG-T2', title: 'Respond to emails', themeId: 'CG', priority: 'not-important-urgent', status: 'doing', tags: ['urgent', 'review'], createdAt: '2026-01-31T09:00:00Z', updatedAt: '2026-01-31T10:00:00Z' },
  { id: 'L-T1', title: 'Update documentation', themeId: 'L', priority: 'important-not-urgent', status: 'done', tags: ['frontend'], createdAt: '2026-01-31T08:30:00Z', updatedAt: '2026-01-31T14:00:00Z' },
  { id: 'PF-T1', title: 'Review budget spreadsheet', themeId: 'PF', priority: 'important-not-urgent', status: 'todo', createdAt: '2026-01-31T09:00:00Z', updatedAt: '2026-01-31T09:00:00Z' },
];

// Mock task drafts storage
let mockTaskDrafts = '{}';

// Mock personal vision storage
let mockPersonalVision: PersonalVision = { mission: '', vision: '' };

// Mock navigation context storage
let mockNavigationContext: NavigationContext = {
  currentView: 'okr',
  currentItem: '',
  filterThemeId: '',
  lastAccessed: ''
};

// Task ordering state (mirrors Go task_order.json)
const taskPositions: Record<string, string[]> = {};

/** Get drop zone ID for a task (mirrors Go dropZoneForTask). */
function dropZoneForTask(task: TaskWithStatus): string {
  const todoSlug = mockBoardConfig.columnDefinitions.find(c => c.type === 'todo')?.name ?? 'todo';
  if (task.status === todoSlug && task.priority) {
    return task.priority;
  }
  return task.status;
}

/** Slugify a title (mirrors Go Slugify). */
function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Default board configuration matching Go DefaultBoardConfiguration()
const defaultBoardConfiguration: BoardConfiguration = {
  name: 'Bearing Board',
  columnDefinitions: [
    {
      name: 'todo',
      title: 'TODO',
      type: 'todo',
      sections: [
        { name: 'important-urgent', title: 'Important & Urgent', color: '#ef4444' },
        { name: 'not-important-urgent', title: 'Not Important & Urgent', color: '#f59e0b' },
        { name: 'important-not-urgent', title: 'Important & Not Urgent', color: '#3b82f6' },
      ],
    },
    {
      name: 'doing',
      title: 'DOING',
      type: 'doing',
    },
    {
      name: 'done',
      title: 'DONE',
      type: 'done',
    },
  ],
};

// Mutable board config state (initialized from default, mutated by column CRUD)
const mockBoardConfig: BoardConfiguration = JSON.parse(JSON.stringify(defaultBoardConfiguration));

// Check if we're running in Wails (has window.go)
export const isWailsRuntime = (): boolean => {
  return typeof window !== 'undefined' &&
         !!window.go &&
         !!window.go.main &&
         !!window.go.main.App;
};

// Mock App bindings
export const mockAppBindings = {
  Greet: async (name: string): Promise<string> => {
    return `Hello ${name}, Welcome to Bearing!`;
  },

  GetLocale: async (): Promise<string> => {
    return navigator.language;
  },

  // Theme operations
  GetThemes: async (): Promise<LifeTheme[]> => {
    return JSON.parse(JSON.stringify(mockThemes)); // Deep copy
  },

  CreateTheme: async (name: string, color: string): Promise<LifeTheme> => {
    const abbr = suggestAbbreviation(name, mockThemes);
    const newTheme: LifeTheme = {
      id: abbr,
      name,
      color,
      objectives: [],
    };
    mockThemes.push(newTheme);
    return newTheme;
  },

  UpdateTheme: async (theme: LifeTheme): Promise<void> => {
    const index = mockThemes.findIndex(t => t.id === theme.id);
    if (index >= 0) {
      mockThemes[index] = theme;
    }
  },

  SaveTheme: async (theme: LifeTheme): Promise<void> => {
    const index = mockThemes.findIndex(t => t.id === theme.id);
    if (index >= 0) {
      mockThemes[index] = theme;
    } else {
      // Generate ID if not provided
      if (!theme.id) {
        theme.id = suggestAbbreviation(theme.name, mockThemes);
      }
      if (!theme.objectives) {
        theme.objectives = [];
      }
      mockThemes.push(theme);
    }
  },

  DeleteTheme: async (id: string): Promise<void> => {
    mockThemes = mockThemes.filter(t => t.id !== id);
  },

  // Abbreviation suggestion
  SuggestThemeAbbreviation: async (name: string): Promise<string> => {
    return suggestAbbreviation(name, mockThemes);
  },

  // Objective operations
  CreateObjective: async (parentId: string, title: string): Promise<Objective> => {
    // parentId can be a theme ID or an objective ID
    let parentObjectives: Objective[];
    let theme: LifeTheme | undefined;

    theme = mockThemes.find(t => t.id === parentId);
    if (theme) {
      parentObjectives = theme.objectives;
    } else {
      const parentObj = findObjectiveById(mockThemes, parentId);
      if (!parentObj) {
        throw new Error(`Parent ${parentId} not found`);
      }
      if (!parentObj.objectives) parentObj.objectives = [];
      parentObjectives = parentObj.objectives;
      theme = findThemeForObjective(mockThemes, parentId);
    }

    if (!theme) throw new Error(`Theme not found for parent ${parentId}`);

    const maxNum = getMaxObjNumInTheme(theme);
    const newObjective: Objective = {
      id: `${theme.id}-O${maxNum + 1}`,
      parentId,
      title,
      keyResults: [],
      objectives: [],
    };
    parentObjectives.push(newObjective);
    return newObjective;
  },

  UpdateObjective: async (objectiveId: string, title: string, tags: string[]): Promise<void> => {
    const obj = findObjectiveById(mockThemes, objectiveId);
    if (!obj) {
      throw new Error(`Objective ${objectiveId} not found`);
    }
    obj.title = title;
    obj.tags = tags;
  },

  DeleteObjective: async (objectiveId: string): Promise<void> => {
    const result = findObjectiveParent(mockThemes, objectiveId);
    if (!result) {
      throw new Error(`Objective ${objectiveId} not found`);
    }
    result.list.splice(result.index, 1);
  },

  // Key Result operations
  CreateKeyResult: async (parentObjectiveId: string, description: string, startValue: number = 0, targetValue: number = 1, krType: string = ''): Promise<KeyResult> => {
    const objective = findObjectiveById(mockThemes, parentObjectiveId);
    if (!objective) {
      throw new Error(`Objective ${parentObjectiveId} not found`);
    }

    if (krType !== '' && krType !== 'metric' && krType !== 'binary') {
      throw new Error(`invalid key result type: ${krType}`);
    }

    if (krType === 'binary') {
      startValue = 0;
      targetValue = 1;
    }

    const theme = findThemeForObjective(mockThemes, parentObjectiveId);
    if (!theme) throw new Error(`Theme not found for objective ${parentObjectiveId}`);

    const maxNum = getMaxKRNumInTheme(theme);
    const newKR: KeyResult = {
      id: `${theme.id}-KR${maxNum + 1}`,
      parentId: parentObjectiveId,
      description,
      type: krType || undefined,
      startValue,
      currentValue: 0,
      targetValue,
    };
    objective.keyResults.push(newKR);
    return newKR;
  },

  UpdateKeyResult: async (keyResultId: string, description: string): Promise<void> => {
    const result = findKeyResultParent(mockThemes, keyResultId);
    if (!result) {
      throw new Error(`KeyResult ${keyResultId} not found`);
    }
    result.objective.keyResults[result.index].description = description;
  },

  UpdateKeyResultProgress: async (keyResultId: string, currentValue: number): Promise<void> => {
    const result = findKeyResultParent(mockThemes, keyResultId);
    if (!result) {
      throw new Error(`KeyResult ${keyResultId} not found`);
    }
    result.objective.keyResults[result.index].currentValue = currentValue;
  },

  DeleteKeyResult: async (keyResultId: string): Promise<void> => {
    const result = findKeyResultParent(mockThemes, keyResultId);
    if (!result) {
      throw new Error(`KeyResult ${keyResultId} not found`);
    }
    result.objective.keyResults.splice(result.index, 1);
  },

  SetObjectiveStatus: async (objectiveId: string, status: string): Promise<void> => {
    const obj = findObjectiveById(mockThemes, objectiveId);
    if (!obj) {
      throw new Error(`Objective ${objectiveId} not found`);
    }
    const current = obj.status || 'active';
    const target = status || 'active';
    if (current === 'active' && target === 'archived') {
      throw new Error('cannot archive an active item; complete it first');
    }
    if (target === 'completed') {
      const incompleteItems: string[] = [];
      for (const child of (obj.objectives || [])) {
        if ((child.status || 'active') === 'active') {
          incompleteItems.push(`${child.id} (${child.title})`);
        }
      }
      for (const kr of obj.keyResults) {
        if ((kr.status || 'active') === 'active') {
          incompleteItems.push(`${kr.id} (${kr.description})`);
        }
      }
      if (incompleteItems.length > 0) {
        throw new Error('cannot complete: it still has active items — complete them first');
      }
    }
    obj.status = status;
  },

  SetKeyResultStatus: async (keyResultId: string, status: string): Promise<void> => {
    const result = findKeyResultParent(mockThemes, keyResultId);
    if (!result) {
      throw new Error(`KeyResult ${keyResultId} not found`);
    }
    const kr = result.objective.keyResults[result.index];
    const current = kr.status || 'active';
    const target = status || 'active';
    if (current === 'active' && target === 'archived') {
      throw new Error('cannot archive an active item; complete it first');
    }
    kr.status = status;
  },

  CloseObjective: async (objectiveId: string, closingStatus: string, closingNotes: string): Promise<void> => {
    const obj = findObjectiveById(mockThemes, objectiveId);
    if (!obj) {
      throw new Error(`Objective ${objectiveId} not found`);
    }
    const current = obj.status || 'active';
    if (current !== 'active') {
      throw new Error(`cannot close: objective is not active (current status: ${current})`);
    }
    const validStatuses = ['achieved', 'partially-achieved', 'missed', 'postponed', 'canceled'];
    if (!validStatuses.includes(closingStatus)) {
      throw new Error(`invalid closing status "${closingStatus}"`);
    }
    obj.status = 'completed';
    obj.closingStatus = closingStatus;
    obj.closingNotes = closingNotes || undefined;
    obj.closedAt = new Date().toISOString();
    // Close all active direct child KRs
    for (const kr of obj.keyResults) {
      if ((kr.status || 'active') === 'active') {
        kr.status = 'completed';
      }
    }
  },

  ReopenObjective: async (objectiveId: string): Promise<void> => {
    const obj = findObjectiveById(mockThemes, objectiveId);
    if (!obj) {
      throw new Error(`Objective ${objectiveId} not found`);
    }
    const current = obj.status || 'active';
    if (current !== 'completed') {
      throw new Error(`cannot reopen: objective is not completed (current status: ${current})`);
    }
    obj.status = undefined;
    obj.closingStatus = undefined;
    obj.closingNotes = undefined;
    obj.closedAt = undefined;
    // Reopen all completed direct child KRs
    for (const kr of obj.keyResults) {
      if (kr.status === 'completed') {
        kr.status = undefined;
      }
    }
  },

  // Calendar operations
  GetYearFocus: async (year: number): Promise<DayFocus[]> => {
    return mockYearFocus.get(year) || [];
  },

  SaveDayFocus: async (day: DayFocus): Promise<void> => {
    const year = parseInt(day.date.substring(0, 4));
    const entries = mockYearFocus.get(year) || [];

    const index = entries.findIndex(e => e.date === day.date);
    if (index >= 0) {
      entries[index] = day;
    } else {
      entries.push(day);
    }

    // Sort by date
    entries.sort((a, b) => a.date.localeCompare(b.date));
    mockYearFocus.set(year, entries);
  },

  ClearDayFocus: async (date: string): Promise<void> => {
    const year = parseInt(date.substring(0, 4));
    const entries = mockYearFocus.get(year) || [];

    const index = entries.findIndex(e => e.date === date);
    if (index >= 0) {
      // Clear the themes but preserve notes and text
      entries[index] = { ...entries[index], themeIds: undefined };
    }

    mockYearFocus.set(year, entries);
  },

  // Task operations
  GetTasks: async (): Promise<TaskWithStatus[]> => {
    const result = [...mockTasks];
    // Sort by persisted order within each drop zone
    result.sort((a, b) => {
      const zoneA = dropZoneForTask(a);
      const zoneB = dropZoneForTask(b);
      if (zoneA !== zoneB) return zoneA < zoneB ? -1 : 1;
      const order = taskPositions[zoneA] ?? [];
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) {
        return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      }
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
    return result;
  },

  CreateTask: async (title: string, themeId: string, priority: string, description: string = '', tags: string = '', _promotionDate: string = ''): Promise<Task> => {
    const now = new Date().toISOString();
    const maxNum = getMaxTaskNumForTheme(mockTasks, themeId);
    const newTask: TaskWithStatus = {
      id: `${themeId}-T${maxNum + 1}`,
      title,
      themeId,
      priority,
      status: 'todo',
      createdAt: now,
      updatedAt: now,
    };
    if (description) newTask.description = description;
    if (tags) newTask.tags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    mockTasks.push(newTask);
    const zone = dropZoneForTask(newTask);
    taskPositions[zone] = [...(taskPositions[zone] ?? []), newTask.id];
    return newTask;
  },

  MoveTask: async (taskId: string, newStatus: string, positions?: Record<string, string[]>): Promise<MoveTaskResult> => {
    const task = mockTasks.find(t => t.id === taskId);
    if (task) {
      const oldZone = dropZoneForTask(task);
      task.status = newStatus;
      task.updatedAt = new Date().toISOString();
      const newZone = dropZoneForTask(task);
      if (oldZone !== newZone) {
        taskPositions[oldZone] = (taskPositions[oldZone] ?? []).filter(id => id !== taskId);
      }
      if (positions) {
        for (const [zone, ids] of Object.entries(positions)) {
          taskPositions[zone] = ids;
        }
      } else if (oldZone !== newZone) {
        taskPositions[newZone] = [...(taskPositions[newZone] ?? []), taskId];
      }
    }
    return { success: true, positions: { ...taskPositions } };
  },

  UpdateTask: async (task: Task): Promise<void> => {
    const index = mockTasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      mockTasks[index] = { ...mockTasks[index], ...task, updatedAt: new Date().toISOString() };
    }
  },

  DeleteTask: async (taskId: string): Promise<void> => {
    const task = mockTasks.find(t => t.id === taskId);
    if (task) {
      const zone = dropZoneForTask(task);
      taskPositions[zone] = (taskPositions[zone] ?? []).filter(id => id !== taskId);
    }
    mockTasks = mockTasks.filter(t => t.id !== taskId);
  },

  ArchiveTask: async (taskId: string): Promise<void> => {
    const task = mockTasks.find(t => t.id === taskId);
    if (!task) return;
    const oldZone = dropZoneForTask(task);
    taskPositions[oldZone] = (taskPositions[oldZone] ?? []).filter(tid => tid !== taskId);
    task.status = 'archived';
  },

  ArchiveAllDoneTasks: async (): Promise<void> => {
    const doneTasks = mockTasks.filter(t => t.status === 'done');
    for (const task of doneTasks) {
      await mockAppBindings.ArchiveTask(task.id);
    }
  },

  RestoreTask: async (taskId: string): Promise<void> => {
    const task = mockTasks.find(t => t.id === taskId);
    if (!task || task.status !== 'archived') return;
    task.status = 'done';
  },

  ReorderTasks: async (positions: Record<string, string[]>): Promise<ReorderResult> => {
    for (const [zone, ids] of Object.entries(positions)) {
      taskPositions[zone] = [...ids];
    }
    return { success: true, positions: { ...taskPositions } };
  },

  // Priority promotions
  ProcessPriorityPromotions: async (): Promise<PromotedTask[]> => {
    const now = new Date().toISOString().split('T')[0];
    const promoted: PromotedTask[] = [];
    for (const task of mockTasks) {
      if (task.promotionDate && task.promotionDate <= now && task.priority === 'important-not-urgent') {
        const oldPriority = task.priority;
        task.priority = 'important-urgent';
        task.promotionDate = undefined;
        task.updatedAt = new Date().toISOString();
        promoted.push({
          id: task.id,
          title: task.title,
          oldPriority,
          newPriority: 'important-urgent',
        });
      }
    }
    return promoted;
  },

  // Board configuration
  GetBoardConfiguration: async (): Promise<BoardConfiguration> => {
    return JSON.parse(JSON.stringify(mockBoardConfig)); // Deep copy
  },

  AddColumn: async (title: string, insertAfterSlug: string): Promise<BoardConfiguration> => {
    const slug = slugify(title);
    if (!slug) throw new Error('column name must contain at least one letter or number');
    if (mockBoardConfig.columnDefinitions.some(c => c.name === slug)) {
      throw new Error(`column "${slug}" already exists`);
    }
    if (slug === 'archived') throw new Error(`the name "archived" is reserved`);
    const afterIdx = mockBoardConfig.columnDefinitions.findIndex(c => c.name === insertAfterSlug);
    if (afterIdx === -1) throw new Error(`column "${insertAfterSlug}" not found`);
    const afterCol = mockBoardConfig.columnDefinitions[afterIdx];
    if (afterCol.type === 'done') throw new Error('cannot insert after the last column');
    const newCol: ColumnDefinition = { name: slug, title, type: 'doing' };
    mockBoardConfig.columnDefinitions.splice(afterIdx + 1, 0, newCol);
    return JSON.parse(JSON.stringify(mockBoardConfig));
  },

  RemoveColumn: async (slug: string): Promise<BoardConfiguration> => {
    const col = mockBoardConfig.columnDefinitions.find(c => c.name === slug);
    if (!col) throw new Error(`column "${slug}" not found`);
    if (col.type !== 'doing') throw new Error('only custom columns can be removed');
    const tasksInColumn = mockTasks.filter(t => t.status === slug);
    if (tasksInColumn.length > 0) {
      throw new Error(`cannot delete column "${col.title}": it still has ${tasksInColumn.length} task(s) — move or archive them first`);
    }
    mockBoardConfig.columnDefinitions = mockBoardConfig.columnDefinitions.filter(c => c.name !== slug);
    delete taskPositions[slug];
    return JSON.parse(JSON.stringify(mockBoardConfig));
  },

  RenameColumn: async (oldSlug: string, newTitle: string): Promise<BoardConfiguration> => {
    const col = mockBoardConfig.columnDefinitions.find(c => c.name === oldSlug);
    if (!col) throw new Error(`column "${oldSlug}" not found`);
    const newSlug = slugify(newTitle);
    if (!newSlug) throw new Error('column name must contain at least one letter or number');
    if (newSlug !== oldSlug && mockBoardConfig.columnDefinitions.some(c => c.name === newSlug)) {
      throw new Error(`column "${newSlug}" already exists`);
    }
    if (newSlug !== oldSlug && newSlug === 'archived') throw new Error(`the name "archived" is reserved`);
    col.title = newTitle;
    if (newSlug !== oldSlug) {
      col.name = newSlug;
      // Update task statuses
      for (const t of mockTasks) {
        if (t.status === oldSlug) t.status = newSlug;
      }
      // Migrate task positions
      if (taskPositions[oldSlug]) {
        taskPositions[newSlug] = taskPositions[oldSlug];
        delete taskPositions[oldSlug];
      }
    }
    return JSON.parse(JSON.stringify(mockBoardConfig));
  },

  ReorderColumns: async (slugs: string[]): Promise<BoardConfiguration> => {
    const cols = mockBoardConfig.columnDefinitions;
    if (slugs.length !== cols.length) throw new Error(`expected ${cols.length} columns, got ${slugs.length}`);
    const first = cols.find(c => c.type === 'todo');
    const last = cols.find(c => c.type === 'done');
    if (first && slugs[0] !== first.name) throw new Error('first column cannot be moved');
    if (last && slugs[slugs.length - 1] !== last.name) throw new Error('last column cannot be moved');
    const byName = new Map(cols.map(c => [c.name, c]));
    const reordered: ColumnDefinition[] = [];
    for (const s of slugs) {
      const c = byName.get(s);
      if (!c) throw new Error(`column "${s}" not found`);
      reordered.push(c);
    }
    mockBoardConfig.columnDefinitions = reordered;
    return JSON.parse(JSON.stringify(mockBoardConfig));
  },

  // Navigation context operations
  LoadNavigationContext: async (): Promise<NavigationContext> => {
    // Try to load from localStorage for browser persistence
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('bearing_nav_context');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Ignore parse errors
        }
      }
    }
    return { ...mockNavigationContext };
  },

  SaveNavigationContext: async (ctx: NavigationContext): Promise<void> => {
    mockNavigationContext = { ...ctx };
    // Persist to localStorage for browser sessions
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bearing_nav_context', JSON.stringify(ctx));
    }
  },

  // Task drafts operations
  LoadTaskDrafts: async (): Promise<string> => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('bearing_task_drafts');
      if (saved) {
        mockTaskDrafts = saved;
        return saved;
      }
    }
    return mockTaskDrafts;
  },

  SaveTaskDrafts: async (data: string): Promise<void> => {
    mockTaskDrafts = data;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bearing_task_drafts', data);
    }
  },

  // Helper to get tasks filtered by theme
  GetTasksFiltered: async (themeId?: string): Promise<TaskWithStatus[]> => {
    let filtered = [...mockTasks];
    if (themeId) {
      filtered = filtered.filter(t => t.themeId === themeId);
    }
    return filtered;
  },

  // Get days in calendar that use a specific theme
  GetDaysWithTheme: async (themeId: string, year: number): Promise<DayFocus[]> => {
    const yearFocus = mockYearFocus.get(year) || [];
    return yearFocus.filter(d => d.themeIds?.includes(themeId));
  },

  // Frontend logging
  LogFrontend(level: string, message: string, source: string) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level}] ${message} (${source})`);
  },

  // Personal vision
  GetPersonalVision: async (): Promise<PersonalVision> => {
    return { ...mockPersonalVision };
  },

  SavePersonalVision: async (mission: string, vision: string): Promise<void> => {
    mockPersonalVision = { mission, vision, updatedAt: new Date().toISOString() };
  },

  // Progress rollup
  GetAllThemeProgress: async (): Promise<ThemeProgress[]> => {
    function isActive(status: string | undefined): boolean {
      return !status || status === 'active';
    }
    function krProgress(kr: KeyResult): number {
      if (!kr.targetValue) return -1;
      const range = (kr.targetValue ?? 0) - (kr.startValue ?? 0);
      if (range === 0) return 0;
      const p = ((kr.currentValue ?? 0) - (kr.startValue ?? 0)) / range * 100;
      return Math.max(0, Math.min(100, p));
    }
    function computeObjProgress(obj: Objective): { progress: number; all: ObjectiveProgress[] } {
      const all: ObjectiveProgress[] = [];
      const values: number[] = [];
      for (const kr of obj.keyResults) {
        if (!isActive(kr.status)) continue;
        const p = krProgress(kr);
        if (p >= 0) values.push(p);
      }
      for (const child of (obj.objectives ?? [])) {
        if (!isActive(child.status)) continue;
        const r = computeObjProgress(child);
        all.push(...r.all);
        if (r.progress >= 0) values.push(r.progress);
      }
      const progress = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : -1;
      all.push({ objectiveId: obj.id, progress });
      return { progress, all };
    }

    const result: ThemeProgress[] = [];
    for (const theme of mockThemes) {
      const objectives: ObjectiveProgress[] = [];
      const topValues: number[] = [];
      for (const obj of theme.objectives) {
        if (!isActive(obj.status)) continue;
        const r = computeObjProgress(obj);
        objectives.push(...r.all);
        if (r.progress >= 0) topValues.push(r.progress);
      }
      const progress = topValues.length > 0 ? topValues.reduce((a, b) => a + b, 0) / topValues.length : -1;
      result.push({ themeId: theme.id, progress, objectives });
    }
    return result;
  },

  // Routine operations
  AddRoutine: async (themeId: string, description: string, targetValue: number, targetType: string, unit: string): Promise<Routine> => {
    const theme = mockThemes.find(t => t.id === themeId);
    if (!theme) throw new Error(`Theme ${themeId} not found`);
    if (!description.trim()) throw new Error('description cannot be empty');
    if (targetType !== 'at-or-above' && targetType !== 'at-or-below') throw new Error(`invalid target type: ${targetType}`);
    if (targetValue <= 0) throw new Error('targetValue must be positive');

    if (!theme.routines) theme.routines = [];
    let maxNum = 0;
    const re = new RegExp(`^${themeId}-R(\\d+)$`);
    for (const routine of theme.routines) {
      const match = routine.id.match(re);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }
    const newRoutine: Routine = {
      id: `${themeId}-R${maxNum + 1}`,
      description: description.trim(),
      currentValue: 0,
      targetValue,
      targetType,
      unit: unit?.trim() || undefined,
    };
    theme.routines.push(newRoutine);
    return newRoutine;
  },

  UpdateRoutine: async (routineId: string, description: string, currentValue: number, targetValue: number, targetType: string, unit: string): Promise<void> => {
    for (const theme of mockThemes) {
      const idx = (theme.routines ?? []).findIndex(k => k.id === routineId);
      if (idx >= 0) {
        theme.routines![idx] = {
          ...theme.routines![idx],
          description: description.trim(),
          currentValue,
          targetValue,
          targetType,
          unit: unit?.trim() || undefined,
        };
        return;
      }
    }
    throw new Error(`Routine ${routineId} not found`);
  },

  DeleteRoutine: async (routineId: string): Promise<void> => {
    for (const theme of mockThemes) {
      const idx = (theme.routines ?? []).findIndex(k => k.id === routineId);
      if (idx >= 0) {
        theme.routines!.splice(idx, 1);
        return;
      }
    }
    throw new Error(`Routine ${routineId} not found`);
  },
};

// Mock runtime bindings
export const mockRuntimeBindings = {
  WindowSetTitle: async (title: string): Promise<void> => {
    if (typeof document !== 'undefined') {
      document.title = title;
    }
  },

  Quit: (): void => {
    if (typeof window !== 'undefined') {
      window.close();
    }
  },

  // Window management stubs for browser dev mode
  WindowSetSize: (_width: number, _height: number): void => {},
  WindowSetPosition: (_x: number, _y: number): void => {},
  WindowCenter: (): void => {},
  WindowMaximise: (): void => {},
  WindowUnmaximise: (): void => {},
  WindowToggleMaximise: (): void => {},
  WindowFullscreen: (): void => {},
  WindowUnfullscreen: (): void => {},
  WindowIsFullscreen: async (): Promise<boolean> => false,
  WindowIsMaximised: async (): Promise<boolean> => false,
  ScreenGetAll: async (): Promise<{ isCurrent: boolean; isPrimary: boolean; width: number; height: number }[]> => [
    { isCurrent: true, isPrimary: true, width: 1920, height: 1080 },
  ],
};

/**
 * Initialize mock bindings if not in Wails runtime
 * Call this early in your app initialization
 */
export const initMockBindings = (): boolean => {
  if (isWailsRuntime()) {
    // Already in Wails, no mocking needed
    return false;
  }

  // Create mock window.go structure
  if (typeof window !== 'undefined') {
    window.go = window.go || {};
    window.go.main = window.go.main || {};
    window.go.main.App = mockAppBindings;

    // Create mock window.runtime
    window.runtime = mockRuntimeBindings;

    console.warn('[Wails Mock] Running in browser mode with mock bindings');
    return true;
  }

  return false;
};

/**
 * Helper to configure mock responses (for E2E tests)
 */
export const configureMock = (config: MockConfig): void => {
  if (typeof window !== 'undefined') {
    window.__E2E_MOCK_CONFIG__ = config;
  }
};
