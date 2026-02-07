import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
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
    LoadNavigationContext: vi.fn().mockResolvedValue({ currentView: 'okr', currentItem: '', filterThemeId: '', filterDate: '', lastAccessed: '' }),
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

    const themeName = container.querySelector('.theme-item .item-name');
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
    const krItems = container.querySelectorAll('.kr-item');
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
    const addKRButton = container.querySelector<HTMLButtonElement>('.objective-item .icon-button.add[title="Add Key Result"]');
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
    expect(progressInputs[1].value).toBe('0');
  });

  it('shows Start and Target inputs pre-filled in KR edit form', async () => {
    await renderView();
    await expandThemeAndObjective();

    // Click edit button on the numeric KR (second KR item)
    const krItems = container.querySelectorAll('.kr-item');
    const numericKR = krItems[1];
    const editButton = numericKR.querySelector<HTMLButtonElement>('.icon-button.edit');
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
});
