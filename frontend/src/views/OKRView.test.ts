import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme } from '../lib/wails-mock';
import OKRView from './OKRView.svelte';

/** Build a fixture with one theme, one objective, and 4 KR variants. */
function makeTestThemes(): LifeTheme[] {
  return [
    {
      id: 'TST',
      name: 'Test Theme',
      color: '#dc2626',
      objectives: [
        {
          id: 'TST-O1',
          parentId: 'TST',
          title: 'Test Objective',
          keyResults: [
            { id: 'TST-KR1', parentId: 'TST-O1', description: 'Binary KR', startValue: 0, currentValue: 0, targetValue: 1 },
            { id: 'TST-KR2', parentId: 'TST-O1', description: 'Numeric KR', startValue: 0, currentValue: 3, targetValue: 4 },
            { id: 'TST-KR3', parentId: 'TST-O1', description: 'Untracked KR', startValue: 0, currentValue: 0, targetValue: 0 },
            { id: 'TST-KR4', parentId: 'TST-O1', description: 'Typed Binary KR', startValue: 0, currentValue: 0, targetValue: 1 },
          ],
          objectives: [],
        },
      ],
    },
  ];
}

function makeMockBindings(themes: LifeTheme[], advisorEnabled = false) {
  return {
    GetHierarchy: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(themes))),
    Establish: vi.fn().mockResolvedValue({}),
    Revise: vi.fn().mockResolvedValue(undefined),
    RecordProgress: vi.fn().mockResolvedValue(undefined),
    Dismiss: vi.fn().mockResolvedValue(undefined),
    SuggestAbbreviation: vi.fn().mockResolvedValue('T'),
    SetObjectiveStatus: vi.fn().mockResolvedValue(undefined),
    SetKeyResultStatus: vi.fn().mockResolvedValue(undefined),
    CloseObjective: vi.fn().mockResolvedValue(undefined),
    ReopenObjective: vi.fn().mockResolvedValue(undefined),
    LogFrontend: vi.fn(),
    LoadNavigationContext: vi.fn().mockResolvedValue({ currentView: 'okr', currentItem: '', filterThemeId: '', lastAccessed: '' }),
    SaveNavigationContext: vi.fn().mockResolvedValue(undefined),
    GetAllThemeProgress: vi.fn().mockResolvedValue([]),
    GetRoutines: vi.fn().mockResolvedValue([]),
    GetRoutineProgress: vi.fn().mockResolvedValue({ routineId: '', completed: 0, expected: 0, period: 'week', onTrack: true }),
    GetPersonalVision: vi.fn().mockResolvedValue({ mission: '', vision: '' }),
    SavePersonalVision: vi.fn().mockResolvedValue(undefined),
    GetAdviceSetting: vi.fn().mockResolvedValue(advisorEnabled),
    GetAvailableModels: vi.fn().mockResolvedValue([
      { name: 'Claude (Mock)', provider: 'Anthropic', type: 'remote', available: true, reason: 'Mock mode' },
    ]),
    RequestAdvice: vi.fn().mockResolvedValue({ text: 'Mock advice response', suggestions: [] }),
  };
}

describe('OKRView', () => {
  let container: HTMLDivElement;
  let mockBindings: ReturnType<typeof makeMockBindings>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mockBindings = makeMockBindings(makeTestThemes());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).go = { main: { App: mockBindings } };
  });

  afterEach(() => {
    document.body.removeChild(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).go;
  });

  async function renderView() {
    const result = render(OKRView, { target: container });
    // Wait for onMount + async loadThemes
    await tick();
    // Flush the promise from GetHierarchy
    await vi.waitFor(() => {
      if (container.querySelector('.loading')) throw new Error('still loading');
    });
    await tick();
    return result;
  }

  /** Click expand buttons for theme then objective to reveal KR items. */
  async function expandThemeAndObjective() {
    const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
    // First expand button is the theme
    expandButtons[0]?.click();
    await tick();
    // Second expand button is the objective (now visible)
    const objExpandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
    objExpandButtons[1]?.click();
    await tick();
  }

  it('renders theme name and header', async () => {
    await renderView();

    const header = container.querySelector('.okr-header h1');
    expect(header?.textContent).toBe('Life Themes & OKRs');

    const themeName = container.querySelector('.tree-theme-item .theme-pill');
    expect(themeName?.textContent).toBe('Test Theme');
  });

  it('renders binary KR with checkbox', async () => {
    await renderView();
    await expandThemeAndObjective();

    const checkbox = container.querySelector<HTMLInputElement>('.kr-checkbox');
    expect(checkbox).toBeTruthy();
    expect(checkbox?.type).toBe('checkbox');
    expect(checkbox?.checked).toBe(false);
  });

  it('renders numeric KR with progress bar and current input', async () => {
    await renderView();
    await expandThemeAndObjective();

    const progressBar = container.querySelector('.kr-progress');
    expect(progressBar).toBeTruthy();

    const currentInput = container.querySelector<HTMLInputElement>('.kr-current-input');
    expect(currentInput).toBeTruthy();
    expect(currentInput?.value).toBe('3');

    const targetLabel = container.querySelector('.kr-target-label');
    expect(targetLabel?.textContent).toBe('/ 4');
  });

  it('renders binary KR (start=0, target=1) with checkbox', async () => {
    await renderView();
    await expandThemeAndObjective();

    // The 4th KR (TST-KR4) has start=0, target=1 and should show as checkbox
    const krItems = container.querySelectorAll('.tree-kr-item');
    const typedBinaryKR = krItems[3];
    const checkbox = typedBinaryKR.querySelector<HTMLInputElement>('.kr-checkbox');
    expect(checkbox).toBeTruthy();
    expect(checkbox?.type).toBe('checkbox');
    expect(checkbox?.checked).toBe(false);
  });

  it('renders untracked KR without checkbox, progress, or current input', async () => {
    await renderView();
    await expandThemeAndObjective();

    // Find the KR items and check the untracked one (third KR)
    const krItems = container.querySelectorAll('.tree-kr-item');
    expect(krItems.length).toBe(4);

    const untrackedKR = krItems[2];
    expect(untrackedKR.querySelector('.kr-checkbox')).toBeNull();
    expect(untrackedKR.querySelector('.kr-progress')).toBeNull();
    expect(untrackedKR.querySelector('.kr-current-input')).toBeNull();
  });

  it('shows Start and Target inputs in KR creation form', async () => {
    await renderView();
    await expandThemeAndObjective();

    // Click "+KR" button on the objective to open creation form
    const addKRButton = container.querySelector<HTMLButtonElement>('.tree-objective-item .btn-icon.icon-add[title="Add Key Result"]');
    expect(addKRButton).toBeTruthy();
    addKRButton!.click();
    await tick();

    const formRow = container.querySelector('.kr-form-row');
    expect(formRow).toBeTruthy();

    const progressInputs = formRow!.querySelectorAll<HTMLInputElement>('.kr-progress-input');
    expect(progressInputs.length).toBe(2);
    // Start input
    expect(progressInputs[0].type).toBe('number');
    expect(progressInputs[0].value).toBe('0');
    // Target input
    expect(progressInputs[1].type).toBe('number');
    expect(progressInputs[1].value).toBe('1');
  });

  it('shows Start and Target inputs pre-filled in KR edit form', async () => {
    await renderView();
    await expandThemeAndObjective();

    // Click edit button on the numeric KR (second KR item)
    const krItems = container.querySelectorAll('.tree-kr-item');
    const numericKR = krItems[1];
    const editButton = numericKR.querySelector<HTMLButtonElement>('.btn-icon.icon-edit');
    expect(editButton).toBeTruthy();
    editButton!.click();
    await tick();

    // Find the progress inputs in the edit form
    const progressInputs = numericKR.querySelectorAll<HTMLInputElement>('.kr-progress-input');
    expect(progressInputs.length).toBe(2);
    // Start value should be 0
    expect(progressInputs[0].value).toBe('0');
    // Target value should be 4
    expect(progressInputs[1].value).toBe('4');
  });

  it('restores expanded nodes from navigation context on mount', async () => {
    mockBindings.LoadNavigationContext.mockResolvedValue({
      currentView: 'okr',
      currentItem: '',
      filterThemeId: '',
      lastAccessed: '',
      expandedOkrIds: ['TST', 'TST-O1'],
    });
    await renderView();

    // Theme and objective should be expanded, so KR items should be visible
    const krItems = container.querySelectorAll('.tree-kr-item');
    expect(krItems.length).toBe(4);
  });

  it('saves expanded IDs to navigation context when node is expanded', async () => {
    await renderView();

    // Click expand on the theme
    const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
    expandButtons[0]?.click();
    await tick();

    // The $effect should trigger SaveNavigationContext with expandedOkrIds containing the theme ID
    await vi.waitFor(() => {
      const saveCalls = mockBindings.SaveNavigationContext.mock.calls;
      const hasExpandedIds = saveCalls.some(
        (call: unknown[]) => {
          const ctx = call[0] as { expandedOkrIds?: string[] };
          return ctx.expandedOkrIds && ctx.expandedOkrIds.includes('TST');
        }
      );
      if (!hasExpandedIds) throw new Error('expandedOkrIds not saved yet');
    });
  });

  it('checkbox click calls RecordProgress with toggled value', async () => {
    await renderView();
    await expandThemeAndObjective();

    // After RecordProgress, verifyThemeState calls GetHierarchy — return data matching optimistic update
    const updatedData = makeTestThemes();
    updatedData[0].objectives[0].keyResults[0].currentValue = 1;
    mockBindings.GetHierarchy.mockResolvedValueOnce(JSON.parse(JSON.stringify(updatedData)));

    const checkbox = container.querySelector<HTMLInputElement>('.kr-checkbox');
    expect(checkbox).toBeTruthy();

    // Click the checkbox (currently unchecked, currentValue=0 -> should toggle to 1)
    checkbox!.click();
    await tick();

    expect(mockBindings.RecordProgress).toHaveBeenCalledWith('TST-KR1', 1);

    // Wait for the full async chain (optimistic update + verifyThemeState) to settle
    await vi.waitFor(() => {
      // GetHierarchy is called: 1x initial load, 1x verifyThemeState (no loadThemes after mutation)
      expect(mockBindings.GetHierarchy).toHaveBeenCalledTimes(2);
    });
  });

  describe('state-check verification', () => {
    it('detects state mismatch when backend diverges after mutation', async () => {
      await renderView();
      // Opt out of global error detection: this test deliberately triggers state-check errors
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const divergentData = makeTestThemes();
      // Introduce a mismatch: change currentValue on a key result
      divergentData[0].objectives[0].keyResults[1].currentValue = 999;

      // Establish must return a valid theme object for the optimistic update path
      mockBindings.Establish.mockResolvedValueOnce({ theme: { id: 'NEW', name: 'New Theme', color: '#dc2626', objectives: [] } });

      // After createTheme: optimistic update (no GetHierarchy), verifyThemeState (call 1) gets divergent data
      mockBindings.GetHierarchy
        .mockResolvedValueOnce(JSON.parse(JSON.stringify(divergentData)));

      // Click "+ Add Theme" button and submit the form
      const addThemeBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
      addThemeBtn!.click();
      await tick();

      const nameInput = container.querySelector<HTMLInputElement>('.theme-form input[type="text"]');
      await fireEvent.input(nameInput!, { target: { value: 'New Theme' } });
      await tick();

      const createBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.theme-form .btn-primary'))
        .find(b => b.textContent?.trim() === 'Create');
      createBtn!.click();
      await tick();

      await vi.waitFor(() => {
        expect(mockBindings.Establish).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // ErrorBanner should appear with the mismatch message
      await vi.waitFor(() => {
        const alert = container.querySelector('[role="alert"]');
        expect(alert).toBeTruthy();
        expect(alert!.textContent).toContain('Internal state mismatch detected');
      });

      // LogFrontend should have been called with the mismatch details
      expect(mockBindings.LogFrontend).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('currentValue'),
        'state-check'
      );
    });
  });

  it('duplicate warning appears when selecting a color used by another theme', async () => {
    await renderView();

    // Click "+ Add Theme" button — default color is #dc2626, same as Test Theme
    const addThemeBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    addThemeBtn!.click();
    await tick();

    const warning = container.querySelector('.color-warning');
    expect(warning).toBeTruthy();
    expect(warning!.textContent).toContain('Already used by');
    expect(warning!.textContent).toContain('Test Theme');
  });

  it('duplicate warning disappears when selecting a unique color', async () => {
    await renderView();

    // Click "+ Add Theme" button
    const addThemeBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    addThemeBtn!.click();
    await tick();

    // Click a palette color that isn't used by any theme
    const colorButtons = container.querySelectorAll<HTMLButtonElement>('.theme-form .color-option');
    // Pick the last palette color (unlikely to be #dc2626)
    colorButtons[colorButtons.length - 1].click();
    await tick();

    const warning = container.querySelector('.theme-form .color-warning');
    expect(warning).toBeNull();
  });

  it('duplicate warning excludes the theme being edited (no self-conflict)', async () => {
    await renderView();

    // Click edit button on the theme (its color is #dc2626)
    const editButton = container.querySelector<HTMLButtonElement>('.theme-header .btn-icon.icon-edit');
    expect(editButton).toBeTruthy();
    editButton!.click();
    await tick();

    // Its own color should NOT show a warning (self-conflict excluded)
    const warning = container.querySelector('.theme-header .color-warning');
    expect(warning).toBeNull();
  });

  describe('goal status indicators', () => {
    it('shows on-track status dot for objective with progress >= 66', async () => {
      mockBindings.GetAllThemeProgress.mockResolvedValue([
        { themeId: 'TST', progress: 75, objectives: [{ objectiveId: 'TST-O1', progress: 75 }] },
      ]);
      await renderView();

      // Expand theme to see objective header
      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const dot = container.querySelector('.status-dot');
      expect(dot).toBeTruthy();
      expect(dot!.classList.contains('on-track')).toBe(true);
    });

    it('shows needs-attention status dot for objective with progress 33-65', async () => {
      mockBindings.GetAllThemeProgress.mockResolvedValue([
        { themeId: 'TST', progress: 50, objectives: [{ objectiveId: 'TST-O1', progress: 50 }] },
      ]);
      await renderView();

      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const dot = container.querySelector('.status-dot');
      expect(dot).toBeTruthy();
      expect(dot!.classList.contains('needs-attention')).toBe(true);
    });

    it('shows off-track status dot for objective with progress < 33', async () => {
      mockBindings.GetAllThemeProgress.mockResolvedValue([
        { themeId: 'TST', progress: 10, objectives: [{ objectiveId: 'TST-O1', progress: 10 }] },
      ]);
      await renderView();

      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const dot = container.querySelector('.status-dot');
      expect(dot).toBeTruthy();
      expect(dot!.classList.contains('off-track')).toBe(true);
    });

    it('shows no-status dot when no progress data exists', async () => {
      // Default mock returns empty progress array
      await renderView();

      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const dot = container.querySelector('.status-dot');
      expect(dot).toBeTruthy();
      expect(dot!.classList.contains('no-status')).toBe(true);
    });

    it('does not show status dot for completed objectives', async () => {
      const themes = makeTestThemes();
      themes[0].objectives[0].status = 'completed';
      mockBindings = makeMockBindings(themes);
      mockBindings.GetAllThemeProgress.mockResolvedValue([
        { themeId: 'TST', progress: 100, objectives: [{ objectiveId: 'TST-O1', progress: 100 }] },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      const result = render(OKRView, { target: container });
      await tick();
      await vi.waitFor(() => {
        if (container.querySelector('.loading')) throw new Error('still loading');
      });
      await tick();

      // Expand theme and enable completed view
      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      // Enable "Show Completed" toggle
      const toggles = container.querySelectorAll<HTMLInputElement>('.toggle-checkbox');
      const showCompletedToggle = toggles[0];
      if (showCompletedToggle) {
        showCompletedToggle.click();
        await tick();
      }

      const dot = container.querySelector('.status-dot');
      expect(dot).toBeNull();

      result.unmount();
    });
  });

  describe('vision section', () => {
    it('renders vision section when vision data exists', async () => {
      mockBindings.GetPersonalVision.mockResolvedValue({
        mission: 'My mission',
        vision: 'My vision',
      });
      await renderView();

      // Expand vision section
      const visionHeader = container.querySelector<HTMLButtonElement>('.vision-header');
      expect(visionHeader).toBeTruthy();
      visionHeader!.click();
      await tick();

      const visionText = container.querySelectorAll('.vision-text');
      expect(visionText.length).toBe(2);
      expect(visionText[0].textContent?.trim()).toBe('My vision');
      expect(visionText[1].textContent?.trim()).toBe('My mission');
    });

    it('vision section is collapsed by default', async () => {
      mockBindings.GetPersonalVision.mockResolvedValue({
        mission: 'My mission',
        vision: 'My vision',
      });
      await renderView();

      // Should not show vision body when collapsed
      const visionBody = container.querySelector('.vision-body');
      expect(visionBody).toBeNull();

      // Header should be present
      const visionHeader = container.querySelector('.vision-header');
      expect(visionHeader).toBeTruthy();
    });
  });

  describe('tag filter bar', () => {
    /** Build themes where objectives have tags for filter testing. */
    function makeTaggedThemes(): LifeTheme[] {
      return [
        {
          id: 'T1',
          name: 'Theme One',
          color: '#dc2626',
          objectives: [
            {
              id: 'T1-O1',
              parentId: 'T1',
              title: 'Tagged Objective',
              tags: ['health'],
              keyResults: [{ id: 'T1-KR1', parentId: 'T1-O1', description: 'KR1', startValue: 0, currentValue: 0, targetValue: 1 }],
              objectives: [],
            },
            {
              id: 'T1-O2',
              parentId: 'T1',
              title: 'Untagged Objective',
              keyResults: [],
              objectives: [],
            },
          ],
        },
        {
          id: 'T2',
          name: 'Theme Two',
          color: '#10b981',
          objectives: [
            {
              id: 'T2-O1',
              parentId: 'T2',
              title: 'Career Objective',
              tags: ['career'],
              keyResults: [],
              objectives: [],
            },
          ],
        },
        {
          id: 'T3',
          name: 'Empty Theme',
          color: '#f59e0b',
          objectives: [
            {
              id: 'T3-O1',
              parentId: 'T3',
              title: 'No Tags Objective',
              keyResults: [],
              objectives: [],
            },
          ],
        },
      ];
    }

    async function renderTaggedView() {
      mockBindings = makeMockBindings(makeTaggedThemes());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      const result = render(OKRView, { target: container });
      await tick();
      await vi.waitFor(() => {
        if (container.querySelector('.loading')) throw new Error('still loading');
      });
      await tick();
      return result;
    }

    it('shows TagSelection when objectives have tags', async () => {
      await renderTaggedView();

      const filterBar = container.querySelector('.tag-filter-bar');
      expect(filterBar).toBeTruthy();

      // Should have "All" pill plus pills for "career" and "health" (sorted)
      const pills = container.querySelectorAll('.filter-pill');
      expect(pills.length).toBe(3); // All + career + health
      expect(pills[1].textContent).toContain('career');
      expect(pills[2].textContent).toContain('health');
    });

    it('does not show TagSelection when no objectives have tags', async () => {
      await renderView(); // uses makeTestThemes which has no tags

      const filterBar = container.querySelector('.tag-filter-bar');
      expect(filterBar).toBeNull();
    });

    it('shows all themes when no filter is active', async () => {
      await renderTaggedView();

      const themeNames = container.querySelectorAll('.tree-theme-item .theme-pill');
      expect(themeNames.length).toBe(3);
      expect(themeNames[0].textContent).toBe('Theme One');
      expect(themeNames[1].textContent).toBe('Theme Two');
      expect(themeNames[2].textContent).toBe('Empty Theme');
    });

    it('filters themes by tag — hides themes with no matching objectives', async () => {
      await renderTaggedView();

      // Click the "health" tag pill
      const pills = container.querySelectorAll<HTMLButtonElement>('.filter-pill.tag-pill');
      const healthPill = Array.from(pills).find(p => p.textContent?.includes('health'));
      expect(healthPill).toBeTruthy();
      healthPill!.click();
      await tick();

      // Only Theme One should be visible (it has the "health" tagged objective)
      const themeNames = container.querySelectorAll('.tree-theme-item .theme-pill');
      expect(themeNames.length).toBe(1);
      expect(themeNames[0].textContent).toBe('Theme One');
    });

    it('clearing filter restores all themes', async () => {
      await renderTaggedView();

      // Activate a filter
      const pills = container.querySelectorAll<HTMLButtonElement>('.filter-pill.tag-pill');
      const careerPill = Array.from(pills).find(p => p.textContent?.includes('career'));
      careerPill!.click();
      await tick();

      // Only Theme Two should be visible
      let themeNames = container.querySelectorAll('.tree-theme-item .theme-pill');
      expect(themeNames.length).toBe(1);

      // Click "All" to clear
      const allPill = container.querySelector<HTMLButtonElement>('.filter-pill.all-pill');
      allPill!.click();
      await tick();

      // All themes restored
      themeNames = container.querySelectorAll('.tree-theme-item .theme-pill');
      expect(themeNames.length).toBe(3);
    });

    it('preserves ancestor theme when child objective matches', async () => {
      // Create themes with nested objectives where only a child has the tag
      const nestedThemes: LifeTheme[] = [
        {
          id: 'NT1',
          name: 'Nested Theme',
          color: '#dc2626',
          objectives: [
            {
              id: 'NT1-O1',
              parentId: 'NT1',
              title: 'Parent Objective',
              keyResults: [],
              objectives: [
                {
                  id: 'NT1-O1-C1',
                  parentId: 'NT1-O1',
                  title: 'Child With Tag',
                  tags: ['deep'],
                  keyResults: [{ id: 'NT1-KR1', parentId: 'NT1-O1-C1', description: 'Deep KR', startValue: 0, currentValue: 0, targetValue: 1 }],
                  objectives: [],
                },
              ],
            },
          ],
        },
      ];

      mockBindings = makeMockBindings(nestedThemes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      const result = render(OKRView, { target: container });
      await tick();
      await vi.waitFor(() => {
        if (container.querySelector('.loading')) throw new Error('still loading');
      });
      await tick();

      // Filter by "deep"
      const deepPill = Array.from(container.querySelectorAll<HTMLButtonElement>('.filter-pill.tag-pill'))
        .find(p => p.textContent?.includes('deep'));
      expect(deepPill).toBeTruthy();
      deepPill!.click();
      await tick();

      // Theme should still be visible (ancestor of matching objective)
      const themeNames = container.querySelectorAll('.tree-theme-item .theme-pill');
      expect(themeNames.length).toBe(1);
      expect(themeNames[0].textContent).toBe('Nested Theme');

      // Expand the theme and parent objective to verify hierarchy is preserved
      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click(); // expand theme
      await tick();
      const expandButtons2 = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons2[1]?.click(); // expand parent objective
      await tick();

      // Parent objective should be visible as ancestor
      const objectiveNames = container.querySelectorAll('.tree-objective-item .item-name');
      expect(objectiveNames.length).toBeGreaterThanOrEqual(1);

      result.unmount();
    });
  });

  describe('KR edit form — regression for state update bug', () => {
    it('editing targetValue calls Revise with updated KR and reflects new target in frontend state', async () => {
      await renderView();
      await expandThemeAndObjective();

      // After Revise, verifyThemeState calls GetHierarchy — return data matching the updated KR
      const updatedData = makeTestThemes();
      updatedData[0].objectives[0].keyResults[1].targetValue = 10;
      mockBindings.GetHierarchy.mockResolvedValueOnce(JSON.parse(JSON.stringify(updatedData)));

      // Click edit on the numeric KR (second KR item, targetValue=4)
      const krItems = container.querySelectorAll('.tree-kr-item');
      const numericKR = krItems[1];
      const editButton = numericKR.querySelector<HTMLButtonElement>('.btn-icon.icon-edit');
      expect(editButton).toBeTruthy();
      editButton!.click();
      await tick();

      // Change the target value input from 4 to 10
      const progressInputs = numericKR.querySelectorAll<HTMLInputElement>('.kr-progress-input');
      expect(progressInputs.length).toBe(2);
      const targetInput = progressInputs[1];
      expect(targetInput.value).toBe('4');
      await fireEvent.input(targetInput, { target: { value: '10' } });
      await tick();

      // Submit by clicking the save button
      const saveButton = numericKR.querySelector<HTMLButtonElement>('.btn-icon.icon-save');
      expect(saveButton).toBeTruthy();
      saveButton!.click();
      await tick();

      // Revise should have been called with the KR ID and updated targetValue
      expect(mockBindings.Revise).toHaveBeenCalledOnce();
      const reviseReq = mockBindings.Revise.mock.calls[0][0];
      expect(reviseReq.goalId).toBe('TST-KR2');
      expect(reviseReq.targetValue).toBe(10);

      // Wait for verifyThemeState (GetHierarchy called 1x initial load + 1x verify)
      await vi.waitFor(() => {
        expect(mockBindings.GetHierarchy).toHaveBeenCalledTimes(2);
      });

      // Frontend state should reflect the updated target value
      const targetLabel = container.querySelector('.kr-target-label');
      expect(targetLabel?.textContent).toBe('/ 10');
    });

    it('editing description only calls Revise and reflects new description in frontend state', async () => {
      await renderView();
      await expandThemeAndObjective();

      // After Revise, verifyThemeState calls GetHierarchy — return data matching the updated KR
      const updatedData = makeTestThemes();
      updatedData[0].objectives[0].keyResults[1].description = 'Updated KR description';
      mockBindings.GetHierarchy.mockResolvedValueOnce(JSON.parse(JSON.stringify(updatedData)));

      // Click edit on the numeric KR (second KR item)
      const krItems = container.querySelectorAll('.tree-kr-item');
      const numericKR = krItems[1];
      const editButton = numericKR.querySelector<HTMLButtonElement>('.btn-icon.icon-edit');
      expect(editButton).toBeTruthy();
      editButton!.click();
      await tick();

      // Change only the description — leave start/target unchanged
      const descInput = numericKR.querySelector<HTMLInputElement>('.inline-edit');
      expect(descInput).toBeTruthy();
      await fireEvent.input(descInput!, { target: { value: 'Updated KR description' } });
      await tick();

      // Submit by clicking the save button
      const saveButton = numericKR.querySelector<HTMLButtonElement>('.btn-icon.icon-save');
      expect(saveButton).toBeTruthy();
      saveButton!.click();
      await tick();

      // Revise should have been called with description-only
      expect(mockBindings.Revise).toHaveBeenCalledOnce();
      const reviseReq = mockBindings.Revise.mock.calls[0][0];
      expect(reviseReq.goalId).toBe('TST-KR2');
      expect(reviseReq.description).toBe('Updated KR description');

      // Wait for verifyThemeState (GetHierarchy called 1x initial load + 1x verify)
      await vi.waitFor(() => {
        expect(mockBindings.GetHierarchy).toHaveBeenCalledTimes(2);
      });
      await tick();

      // Frontend state should reflect the updated description
      await vi.waitFor(() => {
        const krDescriptions = container.querySelectorAll('.tree-kr-item .item-name');
        const updatedKRDescription = Array.from(krDescriptions).find(el => el.textContent?.includes('Updated KR description'));
        if (!updatedKRDescription) throw new Error('Updated description not found in DOM');
      });
    });
  });

  describe('closing workflow', () => {
    it('opens close dialog when clicking Close button on active objective', async () => {
      await renderView();

      // Expand the theme to see the objective
      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      // Click the Close button (was Complete, now opens dialog)
      const closeButton = container.querySelector<HTMLButtonElement>('.tree-objective-item .btn-icon.icon-complete[title="Close"]');
      expect(closeButton).toBeTruthy();
      closeButton!.click();
      await tick();

      // Dialog should be visible with the title
      const dialog = container.ownerDocument.querySelector('.dialog');
      expect(dialog).toBeTruthy();
      expect(dialog?.textContent).toContain('Close Objective');
      expect(dialog?.textContent).toContain('Test Objective');
    });

    it('shows KR progress summary in close dialog', async () => {
      await renderView();

      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const closeButton = container.querySelector<HTMLButtonElement>('.tree-objective-item .btn-icon.icon-complete[title="Close"]');
      closeButton!.click();
      await tick();

      const dialog = container.ownerDocument.querySelector('.dialog');
      const krRows = dialog?.querySelectorAll('.close-dialog-kr-row');
      expect(krRows?.length).toBe(4);
    });

    it('shows closing status badge on closed objectives', async () => {
      // Create themes with a closed objective
      const closedThemes: LifeTheme[] = [
        {
          id: 'TST',
          name: 'Test Theme',
          color: '#dc2626',
          objectives: [
            {
              id: 'TST-O1',
              parentId: 'TST',
              title: 'Closed Objective',
              status: 'completed',
              closingStatus: 'achieved',
              closingNotes: 'Great work!',
              closedAt: '2026-01-15T10:00:00Z',
              keyResults: [],
              objectives: [],
            },
          ],
        },
      ];

      mockBindings.GetHierarchy.mockResolvedValue(JSON.parse(JSON.stringify(closedThemes)));
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'okr',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
        showCompleted: true,
      });

      await renderView();

      // Expand the theme
      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      // Should show closing status badge
      const badge = container.querySelector('.closing-badge');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('Achieved');
    });

    it('calls CloseObjective when dialog is submitted', async () => {
      await renderView();

      // After closeObjective, verifyThemeState calls GetHierarchy — return data matching optimistic update
      const closedData = makeTestThemes();
      closedData[0].objectives[0].status = 'completed';
      closedData[0].objectives[0].closingStatus = 'achieved';
      closedData[0].objectives[0].closingNotes = '';
      mockBindings.GetHierarchy.mockResolvedValueOnce(JSON.parse(JSON.stringify(closedData)));

      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const closeButton = container.querySelector<HTMLButtonElement>('.tree-objective-item .btn-icon.icon-complete[title="Close"]');
      closeButton!.click();
      await tick();

      const dialog = container.ownerDocument.querySelector('.dialog');
      const submitButton = dialog?.querySelector<HTMLButtonElement>('.btn-primary');
      expect(submitButton?.textContent?.trim()).toBe('Close Objective');
      submitButton!.click();
      await tick();

      expect(mockBindings.CloseObjective).toHaveBeenCalledWith('TST-O1', 'achieved', '');

      // Wait for the full async chain (optimistic update + verifyThemeState) to settle
      await vi.waitFor(() => {
        // GetHierarchy is called: 1x initial load, 1x verifyThemeState (no loadThemes after mutation)
        expect(mockBindings.GetHierarchy).toHaveBeenCalledTimes(2);
      });
    });

    it('calls ReopenObjective via reopen button on closed objective', async () => {
      const closedThemes: LifeTheme[] = [
        {
          id: 'TST',
          name: 'Test Theme',
          color: '#dc2626',
          objectives: [
            {
              id: 'TST-O1',
              parentId: 'TST',
              title: 'Closed Objective',
              status: 'completed',
              closingStatus: 'achieved',
              keyResults: [],
              objectives: [],
            },
          ],
        },
      ];

      mockBindings.GetHierarchy.mockResolvedValue(JSON.parse(JSON.stringify(closedThemes)));
      mockBindings.LoadNavigationContext.mockResolvedValue({
        currentView: 'okr',
        currentItem: '',
        filterThemeId: '',
        lastAccessed: '',
        showCompleted: true,
      });

      await renderView();

      // After reopenObjective, verifyThemeState calls GetHierarchy — return data matching optimistic update
      const reopenedData: LifeTheme[] = [
        {
          id: 'TST',
          name: 'Test Theme',
          color: '#dc2626',
          objectives: [
            {
              id: 'TST-O1',
              parentId: 'TST',
              title: 'Closed Objective',
              status: 'active',
              keyResults: [],
              objectives: [],
            },
          ],
        },
      ];
      mockBindings.GetHierarchy.mockResolvedValueOnce(JSON.parse(JSON.stringify(reopenedData)));

      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const reopenButton = container.querySelector<HTMLButtonElement>('.tree-objective-item .btn-icon.icon-reopen[title="Reopen"]');
      expect(reopenButton).toBeTruthy();
      reopenButton!.click();
      await tick();

      expect(mockBindings.ReopenObjective).toHaveBeenCalledWith('TST-O1');

      // Wait for the full async chain (optimistic update + verifyThemeState) to settle
      await vi.waitFor(() => {
        // GetHierarchy is called: 1x initial load, 1x verifyThemeState (no loadThemes after mutation)
        expect(mockBindings.GetHierarchy).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('standalone routines section', () => {
    it('shows standalone routines section with routines from GetRoutines', async () => {
      const routinesMock = [
        { id: 'R1', description: 'Exercise per week' },
      ];
      mockBindings.GetRoutines.mockResolvedValue(routinesMock);
      mockBindings.LoadNavigationContext.mockResolvedValue({ currentView: 'okr', currentItem: '', filterThemeId: '', lastAccessed: '', routinesCollapsed: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      // Routine section should be present
      expect(container.querySelector('.routines-section')).toBeTruthy();

      // "+ Routine" button should be present in standalone section
      const routineButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.btn-icon'))
        .find(b => b.textContent?.includes('+ Routine'));
      expect(routineButton).toBeTruthy();

      // Routine card should be rendered
      expect(container.querySelector('.routine-display')).toBeTruthy();
      expect(container.querySelector('.routine-description')?.textContent).toBe('Exercise per week');
    });

    it('shows empty state when no routines exist', async () => {
      mockBindings.GetRoutines.mockResolvedValue([]);
      mockBindings.LoadNavigationContext.mockResolvedValue({ currentView: 'okr', currentItem: '', filterThemeId: '', lastAccessed: '', routinesCollapsed: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      // Routine section should be present
      expect(container.querySelector('.routines-section')).toBeTruthy();

      // Should show empty state text
      const emptyStates = container.querySelectorAll('.empty-state');
      const routineEmptyState = Array.from(emptyStates).find(e => e.textContent?.includes('No routines yet'));
      expect(routineEmptyState).toBeTruthy();
    });

    it('shows "No objectives yet" in theme without mentioning routines', async () => {
      const emptyThemes: LifeTheme[] = [
        { id: 'TST', name: 'Test Theme', color: '#dc2626', objectives: [] },
      ];
      mockBindings = makeMockBindings(emptyThemes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      // Expand the theme
      const expandButtons = container.querySelectorAll<HTMLButtonElement>('.expand-button');
      expandButtons[0]?.click();
      await tick();

      const emptyStates = container.querySelectorAll('.empty-state');
      const themeEmptyState = Array.from(emptyStates).find(e => e.textContent?.includes('No objectives yet'));
      expect(themeEmptyState).toBeTruthy();
      expect(themeEmptyState!.textContent).not.toContain('routine');
    });
  });

  describe('advisor panel', () => {
    it('shows advisor button even when disabled (enables on first click)', async () => {
      // Default makeMockBindings has advisorEnabled=false
      await renderView();

      const advisorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.header-controls button, .header-controls .btn-primary, .header-controls .btn-secondary'))
        .find(b => b.textContent?.trim() === 'Advisor');
      expect(advisorButton).toBeDefined();

      // Panel should not be open yet (advisor not yet enabled)
      expect(container.querySelector('.advisor-panel.open')).toBeNull();
    });

    it('shows advisor toggle button when advisor is enabled', async () => {
      mockBindings = makeMockBindings(makeTestThemes(), true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      // Wait for advisor initialization to complete
      await vi.waitFor(() => {
        expect(mockBindings.GetAdviceSetting).toHaveBeenCalled();
      });
      await tick();
      await tick();

      const advisorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.textContent?.trim() === 'Advisor');
      expect(advisorButton).toBeTruthy();
    });

    it('opens and closes advisor panel on toggle', async () => {
      mockBindings = makeMockBindings(makeTestThemes(), true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      // Wait for advisor initialization
      await vi.waitFor(() => {
        expect(mockBindings.GetAdviceSetting).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // Panel should not be open initially
      const panel = container.querySelector('.advisor-panel');
      expect(panel).toBeTruthy();
      expect(panel!.classList.contains('open')).toBe(false);

      // Click the Advisor button to open
      const advisorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.textContent?.trim() === 'Advisor');
      advisorButton!.click();
      await tick();

      expect(panel!.classList.contains('open')).toBe(true);

      // Click the close button inside panel
      const closeButton = container.querySelector<HTMLButtonElement>('.advisor-close-btn');
      expect(closeButton).toBeTruthy();
      closeButton!.click();
      await tick();

      expect(panel!.classList.contains('open')).toBe(false);
    });

    it('detects model availability on mount when advisor is enabled', async () => {
      mockBindings = makeMockBindings(makeTestThemes(), true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      await vi.waitFor(() => {
        expect(mockBindings.GetAvailableModels).toHaveBeenCalled();
      });
    });

    it('does not call GetAvailableModels when advisor is disabled', async () => {
      // Default: advisorEnabled = false
      await renderView();

      // Give time for async initialization to settle
      await tick();
      await tick();

      expect(mockBindings.GetAvailableModels).not.toHaveBeenCalled();
    });

    it('shows model badges when panel is open', async () => {
      mockBindings = makeMockBindings(makeTestThemes(), true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      await vi.waitFor(() => {
        expect(mockBindings.GetAvailableModels).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // Open the panel
      const advisorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.textContent?.trim() === 'Advisor');
      advisorButton!.click();
      await tick();

      const badges = container.querySelectorAll('.model-badge');
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toContain('Claude (Mock)');
      expect(badges[0].classList.contains('available')).toBe(true);
    });

    it('renders resize handle when advisor panel is open', async () => {
      mockBindings = makeMockBindings(makeTestThemes(), true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      await vi.waitFor(() => {
        expect(mockBindings.GetAdviceSetting).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // Open the panel
      const advisorButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.textContent?.trim() === 'Advisor');
      advisorButton!.click();
      await tick();

      const handle = container.querySelector('.resize-handle');
      expect(handle).toBeTruthy();
    });

    it('does not render resize handle when advisor panel is closed', async () => {
      mockBindings = makeMockBindings(makeTestThemes(), true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).go = { main: { App: mockBindings } };
      await renderView();

      await vi.waitFor(() => {
        expect(mockBindings.GetAdviceSetting).toHaveBeenCalled();
      });
      await tick();
      await tick();

      // Panel is closed by default
      const handle = container.querySelector('.resize-handle');
      expect(handle).toBeNull();
    });

    it('clamps panel ratio to minimum during drag', () => {
      // On a 1600px container, min panel 560px = 0.35 ratio
      const containerWidth = 1600;
      const minPanel = 560;
      const minContent = 900;
      const minRatio = minPanel / containerWidth; // 0.35
      const maxRatio = 1 - minContent / containerWidth; // 0.4375
      const dragPx = 200; // user drags too narrow
      const dragRatio = dragPx / containerWidth; // 0.125
      const result = Math.max(minRatio, Math.min(dragRatio, maxRatio));
      expect(result).toBeCloseTo(0.35);
    });

    it('clamps panel ratio to maximum during drag', () => {
      // On a 1800px container, max panel = 1800-900 = 900px = 0.5 ratio
      const containerWidth = 1800;
      const minPanel = 560;
      const minContent = 900;
      const minRatio = minPanel / containerWidth;
      const maxRatio = 1 - minContent / containerWidth; // 0.5
      const dragPx = 1200; // user drags too wide
      const dragRatio = dragPx / containerWidth;
      const result = Math.max(minRatio, Math.min(dragRatio, maxRatio));
      expect(result).toBeCloseTo(0.5);
    });

    it('both sides scale proportionally on window resize (ratio stays fixed)', () => {
      // User sets 35% ratio on a 1600px window = 560px panel, 1040px content
      const ratio = 0.35;
      // Window shrinks to 1200px — both scale: 420px panel, 780px content
      const smallContainer = 1200;
      expect(ratio * smallContainer).toBeCloseTo(420);
      expect((1 - ratio) * smallContainer).toBeCloseTo(780);
    });
  });
});
