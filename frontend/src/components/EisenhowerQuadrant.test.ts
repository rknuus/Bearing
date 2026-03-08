import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
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
});
