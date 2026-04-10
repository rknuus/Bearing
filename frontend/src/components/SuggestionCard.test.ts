import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SuggestionCard from './SuggestionCard.svelte';
import type { Suggestion } from './SuggestionCard.svelte';

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    type: 'objective',
    action: 'create',
    objectiveData: { title: 'Exercise consistently', parentId: 'H' },
    ...overrides,
  };
}

describe('SuggestionCard', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderCard(
    suggestion: Suggestion,
    overrides: Partial<{
      onAccept: (s: Suggestion) => Promise<void>;
      onDecline: (s: Suggestion) => void;
      selectedOKRIds: string[];
    }> = {},
  ) {
    const result = render(SuggestionCard, {
      target: container,
      props: {
        suggestion,
        onAccept: overrides.onAccept ?? vi.fn(async () => {}),
        onDecline: overrides.onDecline ?? vi.fn(),
        selectedOKRIds: overrides.selectedOKRIds,
      },
    });
    await tick();
    return result;
  }

  it('renders type badge for objective', async () => {
    await renderCard(makeSuggestion({ type: 'objective' }));
    const badge = container.querySelector('.type-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('Objective');
  });

  it('renders type badge for theme', async () => {
    await renderCard(makeSuggestion({
      type: 'theme',
      action: 'create',
      themeData: { name: 'Wellness', color: '#22c55e' },
    }));
    const badge = container.querySelector('.type-badge');
    expect(badge?.textContent).toBe('Theme');
  });

  it('renders type badge for key result', async () => {
    await renderCard(makeSuggestion({
      type: 'key_result',
      action: 'create',
      keyResultData: { description: 'Run 40km/week', startValue: 0, currentValue: 0, targetValue: 40, parentObjectiveId: 'H-O1' },
    }));
    const badge = container.querySelector('.type-badge');
    expect(badge?.textContent).toBe('Key Result');
  });

  it('renders type badge for routine', async () => {
    await renderCard(makeSuggestion({
      type: 'routine',
      action: 'create',
      routineData: { description: 'Sleep 8 hours' },
    }));
    const badge = container.querySelector('.type-badge');
    expect(badge?.textContent).toBe('Routine');
  });

  it('renders action badge "New" for create', async () => {
    await renderCard(makeSuggestion({ action: 'create' }));
    const badge = container.querySelector('.action-badge');
    expect(badge?.textContent?.trim()).toBe('New');
    expect(badge?.classList.contains('action-new')).toBe(true);
  });

  it('renders action badge "Edit" for edit', async () => {
    await renderCard(makeSuggestion({
      action: 'edit',
      objectiveData: { id: 'H-O1', title: 'Updated title' },
    }));
    const badge = container.querySelector('.action-badge');
    expect(badge?.textContent?.trim()).toBe('Edit');
    expect(badge?.classList.contains('action-edit')).toBe(true);
  });

  it('Accept button calls onAccept with suggestion', async () => {
    const suggestion = makeSuggestion();
    const onAccept = vi.fn<(s: Suggestion) => Promise<void>>(async () => {});
    await renderCard(suggestion, { onAccept });

    const acceptBtn = container.querySelector<HTMLButtonElement>('.btn-accept');
    expect(acceptBtn).not.toBeNull();
    await fireEvent.click(acceptBtn!);
    await tick();

    await vi.waitFor(() => {
      expect(onAccept).toHaveBeenCalledOnce();
    });

    const calledWith = onAccept.mock.calls[0][0];
    expect(calledWith.type).toBe('objective');
    expect(calledWith.objectiveData?.title).toBe('Exercise consistently');
  });

  it('Decline button grays out card', async () => {
    const onDecline = vi.fn();
    await renderCard(makeSuggestion(), { onDecline });

    const declineBtn = container.querySelector<HTMLButtonElement>('.btn-decline');
    await fireEvent.click(declineBtn!);
    await tick();

    const card = container.querySelector('.suggestion-card');
    expect(card?.classList.contains('card-declined')).toBe(true);

    // Content should have strikethrough class
    const content = container.querySelector('.card-content');
    expect(content?.classList.contains('content-declined')).toBe(true);

    // Declined label should show
    const label = container.querySelector('.declined-label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Declined');

    expect(onDecline).toHaveBeenCalledOnce();
  });

  it('Applied state shows check label', async () => {
    const onAccept = vi.fn(async () => {});
    await renderCard(makeSuggestion(), { onAccept });

    const acceptBtn = container.querySelector<HTMLButtonElement>('.btn-accept');
    await fireEvent.click(acceptBtn!);

    await vi.waitFor(() => {
      const label = container.querySelector('.applied-label');
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe('Applied');
    });

    // Buttons should be hidden after apply
    const buttons = container.querySelectorAll('.btn');
    expect(buttons.length).toBe(0);
  });

  it('Error state shows error text and returns to actionable on Retry', async () => {
    const onAccept = vi.fn<(s: Suggestion) => Promise<void>>(async () => { throw new Error('Network failure'); });
    await renderCard(makeSuggestion(), { onAccept });

    // Suppress console.error
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const acceptBtn = container.querySelector<HTMLButtonElement>('.btn-accept');
    await fireEvent.click(acceptBtn!);

    await vi.waitFor(() => {
      const errorRow = container.querySelector('.error-row');
      expect(errorRow).not.toBeNull();
      expect(errorRow?.textContent).toContain('Network failure');
    });

    const card = container.querySelector('.suggestion-card');
    expect(card?.classList.contains('card-error')).toBe(true);

    // Retry button should be present
    const retryBtn = container.querySelector<HTMLButtonElement>('.btn-accept');
    expect(retryBtn?.textContent?.trim()).toBe('Retry');

    // Click retry to return to default state
    onAccept.mockImplementation(async () => {});
    await fireEvent.click(retryBtn!);
    await tick();

    // Should be back to default (error cleared)
    await vi.waitFor(() => {
      const errorRow = container.querySelector('.error-row');
      expect(errorRow).toBeNull();
    });
  });

  it('uses selectedOKRIds as parent when suggestion has no parent', async () => {
    const suggestion: Suggestion = {
      type: 'objective',
      action: 'create',
      objectiveData: { title: 'New objective' },
    };
    const onAccept = vi.fn<(s: Suggestion) => Promise<void>>(async () => {});
    await renderCard(suggestion, { onAccept, selectedOKRIds: ['H'] });

    // Parent picker should NOT show (selectedOKRIds provides parent)
    const parentPicker = container.querySelector('.parent-picker');
    expect(parentPicker).toBeNull();

    const acceptBtn = container.querySelector<HTMLButtonElement>('.btn-accept');
    expect(acceptBtn?.disabled).toBe(false);

    await fireEvent.click(acceptBtn!);
    await vi.waitFor(() => {
      expect(onAccept).toHaveBeenCalledOnce();
    });

    // The enriched suggestion should have parentId = 'H'
    const calledWith = onAccept.mock.calls[0][0];
    expect(calledWith.objectiveData?.parentId).toBe('H');
  });

  it('shows parent picker when no parent and no selectedOKRIds', async () => {
    const suggestion: Suggestion = {
      type: 'objective',
      action: 'create',
      objectiveData: { title: 'Orphan objective' },
    };
    await renderCard(suggestion);

    const parentPicker = container.querySelector('.parent-picker');
    expect(parentPicker).not.toBeNull();

    // Accept should be disabled without parent input
    const acceptBtn = container.querySelector<HTMLButtonElement>('.btn-accept');
    expect(acceptBtn?.disabled).toBe(true);
  });

  it('renders color swatch for theme suggestion', async () => {
    await renderCard(makeSuggestion({
      type: 'theme',
      action: 'create',
      themeData: { name: 'Fitness', color: '#ef4444' },
    }));
    const swatch = container.querySelector('.color-swatch');
    expect(swatch).not.toBeNull();
    expect((swatch as HTMLElement).style.backgroundColor).toBe('rgb(239, 68, 68)');
  });

  it('renders key result values', async () => {
    await renderCard(makeSuggestion({
      type: 'key_result',
      action: 'create',
      keyResultData: { description: 'Run 40km', startValue: 0, currentValue: 10, targetValue: 40, parentObjectiveId: 'H-O1' },
    }));
    const values = container.querySelector('.kr-values');
    expect(values).not.toBeNull();
    expect(values?.textContent).toContain('0');
    expect(values?.textContent).toContain('40');
  });

  it('renders routine description', async () => {
    await renderCard(makeSuggestion({
      type: 'routine',
      action: 'create',
      routineData: { description: 'Sleep' },
    }));
    expect(container.textContent).toContain('Sleep');
  });
});
