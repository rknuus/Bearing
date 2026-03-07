import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme } from '../lib/wails-mock';
import OKRView from './OKRView.svelte';

/** Build a fixture with one theme, one objective, and 3 KR variants. */
function makeTestThemes(): LifeTheme[] {
  return [
    {
      id: 'TST',
      name: 'Test Theme',
      color: '#3b82f6',
      objectives: [
        {
          id: 'TST-O1',
          parentId: 'TST',
          title: 'Test Objective',
          keyResults: [
            { id: 'TST-KR1', parentId: 'TST-O1', description: 'Binary KR', startValue: 0, currentValue: 0, targetValue: 1 },
            { id: 'TST-KR2', parentId: 'TST-O1', description: 'Numeric KR', startValue: 0, currentValue: 3, targetValue: 4 },
            { id: 'TST-KR3', parentId: 'TST-O1', description: 'Untracked KR', startValue: 0, currentValue: 0, targetValue: 0 },
          ],
          objectives: [],
        },
      ],
    },
  ];
}

function makeMockBindings(themes: LifeTheme[]) {
  return {
    GetThemes: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(themes))),
    CreateTheme: vi.fn().mockResolvedValue(null),
    UpdateTheme: vi.fn().mockResolvedValue(undefined),
    SaveTheme: vi.fn().mockResolvedValue(undefined),
    DeleteTheme: vi.fn().mockResolvedValue(undefined),
    CreateObjective: vi.fn().mockResolvedValue(null),
    UpdateObjective: vi.fn().mockResolvedValue(undefined),
    DeleteObjective: vi.fn().mockResolvedValue(undefined),
    CreateKeyResult: vi.fn().mockResolvedValue(null),
    UpdateKeyResult: vi.fn().mockResolvedValue(undefined),
    UpdateKeyResultProgress: vi.fn().mockResolvedValue(undefined),
    DeleteKeyResult: vi.fn().mockResolvedValue(undefined),
    SetObjectiveStatus: vi.fn().mockResolvedValue(undefined),
    SetKeyResultStatus: vi.fn().mockResolvedValue(undefined),
    LogFrontend: vi.fn(),
    LoadNavigationContext: vi.fn().mockResolvedValue({ currentView: 'okr', currentItem: '', filterThemeId: '', lastAccessed: '' }),
    SaveNavigationContext: vi.fn().mockResolvedValue(undefined),
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
    // Flush the promise from GetThemes
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

    const themeName = container.querySelector('.tree-theme-item .item-name');
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

  it('renders untracked KR without checkbox, progress, or current input', async () => {
    await renderView();
    await expandThemeAndObjective();

    // Find the KR items and check the untracked one (third KR)
    const krItems = container.querySelectorAll('.tree-kr-item');
    expect(krItems.length).toBe(3);

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
    expect(krItems.length).toBe(3);
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

  it('checkbox click calls UpdateKeyResultProgress with toggled value', async () => {
    await renderView();
    await expandThemeAndObjective();

    const checkbox = container.querySelector<HTMLInputElement>('.kr-checkbox');
    expect(checkbox).toBeTruthy();

    // Click the checkbox (currently unchecked, currentValue=0 -> should toggle to 1)
    checkbox!.click();
    await tick();

    expect(mockBindings.UpdateKeyResultProgress).toHaveBeenCalledWith('TST-KR1', 1);
  });

  describe('state-check verification', () => {
    it('detects state mismatch when backend diverges after mutation', async () => {
      await renderView();
      // Opt out of global error detection: this test deliberately triggers state-check errors
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const normalData = makeTestThemes();
      const divergentData = makeTestThemes();
      // Introduce a mismatch: change currentValue on a key result
      divergentData[0].objectives[0].keyResults[1].currentValue = 999;

      // After createTheme: loadThemes (call 1) gets normal data, verifyThemeState (call 2) gets divergent
      mockBindings.GetThemes
        .mockResolvedValueOnce(JSON.parse(JSON.stringify(normalData)))
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
        expect(mockBindings.CreateTheme).toHaveBeenCalled();
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

  it('custom color input is present in create-theme form', async () => {
    await renderView();

    // Click "+ Add Theme" button
    const addThemeBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    addThemeBtn!.click();
    await tick();

    const colorInput = container.querySelector<HTMLInputElement>('.theme-form input[type="color"]');
    expect(colorInput).toBeTruthy();
  });

  it('custom color input is present in edit-theme form', async () => {
    await renderView();

    // Click edit button on the theme
    const editButton = container.querySelector<HTMLButtonElement>('.theme-header .btn-icon.icon-edit');
    expect(editButton).toBeTruthy();
    editButton!.click();
    await tick();

    const colorInput = container.querySelector<HTMLInputElement>('.theme-header input[type="color"]');
    expect(colorInput).toBeTruthy();
  });

  it('duplicate warning appears when selecting a color used by another theme', async () => {
    await renderView();

    // Click "+ Add Theme" button — default color is #3b82f6, same as Test Theme
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

    // Change to a unique color
    const colorInput = container.querySelector<HTMLInputElement>('.theme-form input[type="color"]');
    expect(colorInput).toBeTruthy();
    await fireEvent.input(colorInput!, { target: { value: '#000000' } });
    await tick();

    const warning = container.querySelector('.theme-form .color-warning');
    expect(warning).toBeNull();
  });

  it('custom color via change event updates color state (WebView compat)', async () => {
    await renderView();

    // Click "+ Add Theme" button — default color is #3b82f6, same as Test Theme
    const addThemeBtn = container.querySelector<HTMLButtonElement>('.btn-primary');
    addThemeBtn!.click();
    await tick();

    // Verify warning is present initially (default color conflicts)
    expect(container.querySelector('.theme-form .color-warning')).toBeTruthy();

    // Fire change event (not input) to simulate WebView behavior
    const colorInput = container.querySelector<HTMLInputElement>('.theme-form input[type="color"]');
    expect(colorInput).toBeTruthy();
    await fireEvent.change(colorInput!, { target: { value: '#000000' } });
    await tick();

    // Warning should disappear — proves change event updated the color state
    expect(container.querySelector('.theme-form .color-warning')).toBeNull();
  });

  it('duplicate warning excludes the theme being edited (no self-conflict)', async () => {
    await renderView();

    // Click edit button on the theme (its color is #3b82f6)
    const editButton = container.querySelector<HTMLButtonElement>('.theme-header .btn-icon.icon-edit');
    expect(editButton).toBeTruthy();
    editButton!.click();
    await tick();

    // Its own color should NOT show a warning (self-conflict excluded)
    const warning = container.querySelector('.theme-header .color-warning');
    expect(warning).toBeNull();
  });

  describe('tag filter bar', () => {
    /** Build themes where objectives have tags for filter testing. */
    function makeTaggedThemes(): LifeTheme[] {
      return [
        {
          id: 'T1',
          name: 'Theme One',
          color: '#3b82f6',
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

    it('shows TagFilterBar when objectives have tags', async () => {
      await renderTaggedView();

      const filterBar = container.querySelector('.tag-filter-bar');
      expect(filterBar).toBeTruthy();

      // Should have "All" pill plus pills for "career" and "health" (sorted)
      const pills = container.querySelectorAll('.filter-pill');
      expect(pills.length).toBe(3); // All + career + health
      expect(pills[1].textContent).toContain('career');
      expect(pills[2].textContent).toContain('health');
    });

    it('does not show TagFilterBar when no objectives have tags', async () => {
      await renderView(); // uses makeTestThemes which has no tags

      const filterBar = container.querySelector('.tag-filter-bar');
      expect(filterBar).toBeNull();
    });

    it('shows all themes when no filter is active', async () => {
      await renderTaggedView();

      const themeNames = container.querySelectorAll('.tree-theme-item .item-name');
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
      const themeNames = container.querySelectorAll('.tree-theme-item .item-name');
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
      let themeNames = container.querySelectorAll('.tree-theme-item .item-name');
      expect(themeNames.length).toBe(1);

      // Click "All" to clear
      const allPill = container.querySelector<HTMLButtonElement>('.filter-pill.all-pill');
      allPill!.click();
      await tick();

      // All themes restored
      themeNames = container.querySelectorAll('.tree-theme-item .item-name');
      expect(themeNames.length).toBe(3);
    });

    it('preserves ancestor theme when child objective matches', async () => {
      // Create themes with nested objectives where only a child has the tag
      const nestedThemes: LifeTheme[] = [
        {
          id: 'NT1',
          name: 'Nested Theme',
          color: '#3b82f6',
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
      const themeNames = container.querySelectorAll('.tree-theme-item .item-name');
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
});
