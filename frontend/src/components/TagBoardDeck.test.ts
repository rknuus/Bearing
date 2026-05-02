import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick, createRawSnippet } from 'svelte';
import TagBoardDeck from './TagBoardDeck.svelte';
import type { TaskWithStatus } from '../lib/wails-mock';

/**
 * Renders the deck with a board snippet that surfaces every task in the
 * sliced subset as a `<div class="board-task" data-id="...">` so the test
 * can observe what the foreground card actually contains for each
 * selection — that is exactly the deck's contract with its consumer.
 */
function boardSnippet() {
  return createRawSnippet<[TaskWithStatus[]]>((slice) => ({
    render: () => {
      const items = (slice() as unknown as TaskWithStatus[])
        .map(t => `<div class="board-task" data-id="${t.id}">${t.title}</div>`)
        .join('');
      return `<div class="board-content">${items}</div>`;
    },
  }));
}

function makeTasks(): TaskWithStatus[] {
  return [
    { id: 'T1', title: 'Alpha task', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['work', 'urgent'] },
    { id: 'T2', title: 'Beta task', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['personal'] },
    { id: 'T3', title: 'Gamma task', themeId: 'CG', priority: 'important-urgent', status: 'doing', tags: ['work'] },
    { id: 'T4', title: 'Delta task', themeId: 'CG', priority: 'important-urgent', status: 'todo' },
  ];
}

function visibleIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.board-task')).map(el => el.dataset.id ?? '');
}

describe('TagBoardDeck', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('derives an alphabetical user-tag list from tasks (FR-10 walking skeleton)', async () => {
    render(TagBoardDeck, {
      target: container,
      props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
    });
    await tick();

    const items = Array.from(container.querySelectorAll('.tag-board-strip-item:not(.synthetic)'));
    const labels = items.map(b => b.textContent?.trim());
    expect(labels).toEqual(['personal', 'urgent', 'work']);
  });

  it('All board surfaces every task', async () => {
    render(TagBoardDeck, {
      target: container,
      props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
    });
    await tick();

    expect(visibleIds(container).sort()).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('Untagged board surfaces only tasks without tags', async () => {
    render(TagBoardDeck, {
      target: container,
      props: { tasks: makeTasks(), selectedTag: 'Untagged', board: boardSnippet() },
    });
    await tick();

    expect(visibleIds(container)).toEqual(['T4']);
  });

  it('selecting a user tag surfaces only tasks carrying that tag', async () => {
    render(TagBoardDeck, {
      target: container,
      props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
    });
    await tick();

    // T1 ([work, urgent]) and T3 ([work]) both carry `work`; T2/T4 do not.
    expect(visibleIds(container).sort()).toEqual(['T1', 'T3']);
  });

  it('US-3 mirror-render: a multi-tag task appears on every matching board and on All', async () => {
    // T1 carries ['work', 'urgent'] — must surface on `work`, on `urgent`,
    // and on `All`. This is the canonical mirror-correctness invariant.
    const tasks = makeTasks();

    const tagsToCheck: string[] = ['work', 'urgent', 'All'];
    for (const tag of tagsToCheck) {
      // Re-render the deck for each board selection.
      container.innerHTML = '';
      render(TagBoardDeck, {
        target: container,
        props: { tasks, selectedTag: tag, board: boardSnippet() },
      });
      await tick();
      expect(visibleIds(container)).toContain('T1');
    }
  });

  it('US-4 mirror update: a single mutation to tasks reflects on every matching board', async () => {
    // Mutate the master tasks list once and assert the change surfaces on
    // every board T1 belongs to. This guards the AD-5 virtualisation
    // invariant: the deck reads from one tasks source and re-derives the
    // slice; no per-board copies are kept.
    const tasks = makeTasks();

    const result = render(TagBoardDeck, {
      target: container,
      props: { tasks, selectedTag: 'work', board: boardSnippet() },
    });
    await tick();
    expect(visibleIds(container)).toContain('T1');

    // Move T1 to "doing" by mutating the master list, then re-render.
    const updated = tasks.map(t => t.id === 'T1' ? { ...t, status: 'doing' as const } : t);

    result.rerender({ tasks: updated, selectedTag: 'urgent', board: boardSnippet() });
    await tick();
    expect(visibleIds(container)).toContain('T1');

    result.rerender({ tasks: updated, selectedTag: 'All', board: boardSnippet() });
    await tick();
    expect(visibleIds(container)).toContain('T1');
  });

  it('falls back to All when selectedTag is null / empty / unrecognised', async () => {
    for (const seed of [null, '', 'no-such-tag']) {
      container.innerHTML = '';
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: seed, board: boardSnippet() },
      });
      await tick();

      const allBtn = container.querySelector('.tag-board-strip-item.synthetic.all');
      expect(allBtn?.classList.contains('active')).toBe(true);
      expect(visibleIds(container).sort()).toEqual(['T1', 'T2', 'T3', 'T4']);
    }
  });

  it('emits onSelectionChange with the chosen tag', async () => {
    const onSelectionChange = vi.fn();
    render(TagBoardDeck, {
      target: container,
      props: { tasks: makeTasks(), selectedTag: 'All', onSelectionChange, board: boardSnippet() },
    });
    await tick();

    const workBtn = Array.from(container.querySelectorAll('.tag-board-strip-item')).find(
      b => b.textContent?.trim() === 'work'
    ) as HTMLButtonElement;
    await fireEvent.click(workBtn);

    expect(onSelectionChange).toHaveBeenCalledWith('work');
  });

  it('does not re-emit when the user clicks the already-active board', async () => {
    const onSelectionChange = vi.fn();
    render(TagBoardDeck, {
      target: container,
      props: { tasks: makeTasks(), selectedTag: 'work', onSelectionChange, board: boardSnippet() },
    });
    await tick();

    const workBtn = Array.from(container.querySelectorAll('.tag-board-strip-item')).find(
      b => b.textContent?.trim() === 'work'
    ) as HTMLButtonElement;
    await fireEvent.click(workBtn);

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('hides the Untagged button when every task is tagged', async () => {
    const tasks = makeTasks().filter(t => t.tags && t.tags.length > 0);
    render(TagBoardDeck, {
      target: container,
      props: { tasks, selectedTag: 'All', board: boardSnippet() },
    });
    await tick();

    expect(container.querySelector('.tag-board-strip-item.synthetic.untagged')).toBeNull();
  });
});
