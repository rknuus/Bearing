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
  keyResults: KeyResult[];
  objectives?: Objective[];
}

export interface LifeTheme {
  id: string;
  name: string;
  color: string;
  objectives: Objective[];
}

export interface DayFocus {
  date: string;
  themeId: string;
  notes: string;
  text: string;
}

export interface Task {
  id: string;
  title: string;
  themeId: string;
  dayDate: string;
  priority: string;
}

export interface TaskWithStatus extends Task {
  status: string;
}

export interface NavigationContext {
  currentView: string;
  currentItem: string;
  filterThemeId: string;
  filterDate: string;
  lastAccessed: string;
  showCompleted?: boolean;
  showArchived?: boolean;
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
        keyResults: [
          { id: 'CG-KR1', parentId: 'CG-O1', description: 'Lead 2 major projects', startValue: 0, currentValue: 1, targetValue: 2 },
          { id: 'CG-KR2', parentId: 'CG-O1', description: 'Mentor 1 junior developer' },  // untracked KR (no target)
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
  { id: 'CG-T1', title: 'Complete project proposal', themeId: 'CG', dayDate: '2026-01-31', priority: 'important-urgent', status: 'todo' },
  { id: 'HF-T1', title: 'Review quarterly goals', themeId: 'HF', dayDate: '2026-01-31', priority: 'important-not-urgent', status: 'todo' },
  { id: 'CG-T2', title: 'Respond to emails', themeId: 'CG', dayDate: '2026-01-31', priority: 'not-important-urgent', status: 'doing' },
  { id: 'L-T1', title: 'Update documentation', themeId: 'L', dayDate: '2026-01-31', priority: 'important-not-urgent', status: 'done' },
];

// Mock navigation context storage
let mockNavigationContext: NavigationContext = {
  currentView: 'home',
  currentItem: '',
  filterThemeId: '',
  filterDate: '',
  lastAccessed: ''
};

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

  UpdateObjective: async (objectiveId: string, title: string): Promise<void> => {
    const obj = findObjectiveById(mockThemes, objectiveId);
    if (!obj) {
      throw new Error(`Objective ${objectiveId} not found`);
    }
    obj.title = title;
  },

  DeleteObjective: async (objectiveId: string): Promise<void> => {
    const result = findObjectiveParent(mockThemes, objectiveId);
    if (!result) {
      throw new Error(`Objective ${objectiveId} not found`);
    }
    result.list.splice(result.index, 1);
  },

  // Key Result operations
  CreateKeyResult: async (parentObjectiveId: string, description: string, startValue: number = 0, targetValue: number = 0): Promise<KeyResult> => {
    const objective = findObjectiveById(mockThemes, parentObjectiveId);
    if (!objective) {
      throw new Error(`Objective ${parentObjectiveId} not found`);
    }

    const theme = findThemeForObjective(mockThemes, parentObjectiveId);
    if (!theme) throw new Error(`Theme not found for objective ${parentObjectiveId}`);

    const maxNum = getMaxKRNumInTheme(theme);
    const newKR: KeyResult = {
      id: `${theme.id}-KR${maxNum + 1}`,
      parentId: parentObjectiveId,
      description,
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
        throw new Error(`cannot complete objective ${objectiveId}; active children: ${incompleteItems.join(', ')}`);
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
      // Clear the theme but preserve notes and text
      entries[index] = { ...entries[index], themeId: '' };
    }

    mockYearFocus.set(year, entries);
  },

  // Task operations
  GetTasks: async (): Promise<TaskWithStatus[]> => {
    return [...mockTasks];
  },

  CreateTask: async (title: string, themeId: string, dayDate: string, priority: string): Promise<Task> => {
    const maxNum = getMaxTaskNumForTheme(mockTasks, themeId);
    const newTask: TaskWithStatus = {
      id: `${themeId}-T${maxNum + 1}`,
      title,
      themeId,
      dayDate,
      priority,
      status: 'todo',
    };
    mockTasks.push(newTask);
    return newTask;
  },

  MoveTask: async (taskId: string, newStatus: string): Promise<void> => {
    const task = mockTasks.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
    }
  },

  UpdateTask: async (task: Task): Promise<void> => {
    const index = mockTasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      mockTasks[index] = { ...mockTasks[index], ...task };
    }
  },

  DeleteTask: async (taskId: string): Promise<void> => {
    mockTasks = mockTasks.filter(t => t.id !== taskId);
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

  // Helper to get tasks filtered by theme and/or date
  GetTasksFiltered: async (themeId?: string, date?: string): Promise<TaskWithStatus[]> => {
    let filtered = [...mockTasks];
    if (themeId) {
      filtered = filtered.filter(t => t.themeId === themeId);
    }
    if (date) {
      filtered = filtered.filter(t => t.dayDate === date);
    }
    return filtered;
  },

  // Get days in calendar that use a specific theme
  GetDaysWithTheme: async (themeId: string, year: number): Promise<DayFocus[]> => {
    const yearFocus = mockYearFocus.get(year) || [];
    return yearFocus.filter(d => d.themeId === themeId);
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
