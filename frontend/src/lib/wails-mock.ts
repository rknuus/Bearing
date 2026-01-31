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
  description: string;
}

export interface Objective {
  id: string;
  title: string;
  keyResults: KeyResult[];
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
}

// Type declarations for extended Window properties
interface MockConfig {
  // Add mock configuration options as needed
}

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

// Mock data storage for browser testing
let mockThemes: LifeTheme[] = [
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
  { id: 'THEME-03', name: 'Personal Finance', color: '#f59e0b', objectives: [] },
  { id: 'THEME-04', name: 'Learning', color: '#8b5cf6', objectives: [] },
  { id: 'THEME-05', name: 'Relationships', color: '#ec4899', objectives: [] },
];

let mockYearFocus: Map<number, DayFocus[]> = new Map();

// Mock tasks storage
let mockTasks: TaskWithStatus[] = [
  { id: 'task-001', title: 'Complete project proposal', themeId: 'THEME-02', dayDate: '2026-01-31', priority: 'important-urgent', status: 'todo' },
  { id: 'task-002', title: 'Review quarterly goals', themeId: 'THEME-01', dayDate: '2026-01-31', priority: 'important-not-urgent', status: 'todo' },
  { id: 'task-003', title: 'Respond to emails', themeId: 'THEME-02', dayDate: '2026-01-31', priority: 'not-important-urgent', status: 'doing' },
  { id: 'task-004', title: 'Update documentation', themeId: 'THEME-04', dayDate: '2026-01-31', priority: 'important-not-urgent', status: 'done' },
];
let mockTaskIdCounter = 5;

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
    const maxNum = mockThemes.reduce((max, t) => {
      const match = t.id.match(/^THEME-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    const newTheme: LifeTheme = {
      id: `THEME-${String(maxNum + 1).padStart(2, '0')}`,
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
        const maxNum = mockThemes.reduce((max, t) => {
          const match = t.id.match(/^THEME-(\d+)$/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        theme.id = `THEME-${String(maxNum + 1).padStart(2, '0')}`;
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

  // Objective operations
  CreateObjective: async (themeId: string, title: string): Promise<Objective> => {
    const theme = mockThemes.find(t => t.id === themeId);
    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const maxNum = theme.objectives.reduce((max, o) => {
      const match = o.id.match(/\.OKR-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);

    const newObjective: Objective = {
      id: `${themeId}.OKR-${String(maxNum + 1).padStart(2, '0')}`,
      title,
      keyResults: [],
    };
    theme.objectives.push(newObjective);
    return newObjective;
  },

  UpdateObjective: async (themeId: string, objective: Objective): Promise<void> => {
    const theme = mockThemes.find(t => t.id === themeId);
    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const index = theme.objectives.findIndex(o => o.id === objective.id);
    if (index >= 0) {
      theme.objectives[index] = objective;
    }
  },

  DeleteObjective: async (themeId: string, objectiveId: string): Promise<void> => {
    const theme = mockThemes.find(t => t.id === themeId);
    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    theme.objectives = theme.objectives.filter(o => o.id !== objectiveId);
  },

  // Key Result operations
  CreateKeyResult: async (okrId: string, description: string): Promise<KeyResult> => {
    // Parse okrId to find theme and objective
    const themeId = okrId.split('.')[0];
    const theme = mockThemes.find(t => t.id === themeId);
    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const objective = theme.objectives.find(o => o.id === okrId);
    if (!objective) {
      throw new Error(`Objective ${okrId} not found`);
    }

    const maxNum = objective.keyResults.reduce((max, kr) => {
      const match = kr.id.match(/\.KR-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);

    const newKR: KeyResult = {
      id: `${okrId}.KR-${String(maxNum + 1).padStart(2, '0')}`,
      description,
    };
    objective.keyResults.push(newKR);
    return newKR;
  },

  UpdateKeyResult: async (themeId: string, objectiveId: string, keyResult: KeyResult): Promise<void> => {
    const theme = mockThemes.find(t => t.id === themeId);
    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const objective = theme.objectives.find(o => o.id === objectiveId);
    if (!objective) {
      throw new Error(`Objective ${objectiveId} not found`);
    }

    const index = objective.keyResults.findIndex(kr => kr.id === keyResult.id);
    if (index >= 0) {
      objective.keyResults[index] = keyResult;
    }
  },

  DeleteKeyResult: async (themeId: string, objectiveId: string, keyResultId: string): Promise<void> => {
    const theme = mockThemes.find(t => t.id === themeId);
    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const objective = theme.objectives.find(o => o.id === objectiveId);
    if (!objective) {
      throw new Error(`Objective ${objectiveId} not found`);
    }

    objective.keyResults = objective.keyResults.filter(kr => kr.id !== keyResultId);
  },

  // Calendar operations
  GetYearFocus: async (year: number): Promise<DayFocus[]> => {
    return mockYearFocus.get(year) || [];
  },

  SaveDayFocus: async (day: DayFocus): Promise<void> => {
    const year = parseInt(day.date.substring(0, 4));
    let entries = mockYearFocus.get(year) || [];

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
    let entries = mockYearFocus.get(year) || [];

    const index = entries.findIndex(e => e.date === date);
    if (index >= 0) {
      // Clear the theme but preserve notes
      entries[index] = { ...entries[index], themeId: '' };
    }

    mockYearFocus.set(year, entries);
  },

  // Task operations
  GetTasks: async (): Promise<TaskWithStatus[]> => {
    return [...mockTasks];
  },

  CreateTask: async (title: string, themeId: string, dayDate: string, priority: string): Promise<Task> => {
    const newTask: TaskWithStatus = {
      id: `task-${String(mockTaskIdCounter++).padStart(3, '0')}`,
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
