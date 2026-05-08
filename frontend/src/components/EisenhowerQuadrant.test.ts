import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { LifeTheme } from '../lib/wails-mock';
import EisenhowerQuadrant, { type PendingTask } from './EisenhowerQuadrant.svelte';

function makeTestThemes(): LifeTheme[] {
  return [
    { id: 'HF', name: 'Health & Fitness', color: '#10b981', objectives: [] },
  ];
}

describe('EisenhowerQuadrant', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderQuadrant(tasks: PendingTask[]) {
    const result = render(EisenhowerQuadrant, {
      target: container,
      props: {
        quadrantId: 'important-urgent',
        title: 'Important & Urgent',
        color: '#ef4444',
        tasks,
        themes: makeTestThemes(),
        onTasksChange: () => {},
      },
    });
    await tick();
    return result;
  }

  it('renders TagBadges with # prefix on pending task cards', async () => {
    await renderQuadrant([
      { id: 'pending-1', title: 'Test task', tags: ['bug', 'urgent'] },
    ]);

    const badges = container.querySelectorAll('.tag-badge');
    expect(badges.length).toBe(2);
    expect(badges[0].textContent).toBe('#bug');
    expect(badges[1].textContent).toBe('#urgent');
  });

  it('renders no tag badges when tags is undefined', async () => {
    await renderQuadrant([
      { id: 'pending-1', title: 'No tags task' },
    ]);

    const badges = container.querySelectorAll('.tag-badge');
    expect(badges.length).toBe(0);
    expect(container.querySelector('.tag-badges')).toBeNull();
  });

  it('renders no tag badges when tags is empty array', async () => {
    await renderQuadrant([
      { id: 'pending-1', title: 'Empty tags', tags: [] },
    ]);

    const badges = container.querySelectorAll('.tag-badge');
    expect(badges.length).toBe(0);
    expect(container.querySelector('.tag-badges')).toBeNull();
  });

  it('renders task title alongside tag badges', async () => {
    await renderQuadrant([
      { id: 'pending-1', title: 'Tagged task', tags: ['review'] },
    ]);

    const title = container.querySelector('.task-title');
    expect(title?.textContent).toBe('Tagged task');

    const badges = container.querySelectorAll('.tag-badge');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toBe('#review');
  });

  /**
   * Single-click edit affordance (#146 / UX finding I1). The quadrant's
   * pending-task cards do not embed a TaskActionMenu, so the equivalent
   * affordance is a hover-revealed pencil button that calls the same
   * `onTaskDblClick` callback the existing double-click invokes.
   */
  describe('hover-pencil edit affordance (#146)', () => {
    it('renders an edit button when onTaskDblClick is provided and forwards click to the callback', async () => {
      const onTaskDblClick = vi.fn();
      render(EisenhowerQuadrant, {
        target: container,
        props: {
          quadrantId: 'important-urgent',
          title: 'Important & Urgent',
          color: '#ef4444',
          tasks: [{ id: 'pending-1', title: 'Edit me' }],
          themes: makeTestThemes(),
          onTasksChange: () => {},
          onTaskDblClick,
        },
      });
      await tick();

      const button = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Edit task"]',
      );
      expect(button).toBeTruthy();
      await fireEvent.click(button!);
      expect(onTaskDblClick).toHaveBeenCalledTimes(1);
      expect(onTaskDblClick).toHaveBeenCalledWith({ id: 'pending-1', title: 'Edit me' });
    });

    it('omits the edit button when onTaskDblClick is not provided', async () => {
      render(EisenhowerQuadrant, {
        target: container,
        props: {
          quadrantId: 'important-urgent',
          title: 'Important & Urgent',
          color: '#ef4444',
          tasks: [{ id: 'pending-1', title: 'Read-only' }],
          themes: makeTestThemes(),
          onTasksChange: () => {},
        },
      });
      await tick();
      expect(container.querySelector('button[aria-label="Edit task"]')).toBeNull();
    });
  });
});
