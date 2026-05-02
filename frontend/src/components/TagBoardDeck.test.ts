import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick, createRawSnippet } from 'svelte';
import TagBoardDeck from './TagBoardDeck.svelte';
import type { TaskWithStatus } from '../lib/wails-mock';
// Vite `?raw` import surfaces the component source so we can assert the
// CSS contract — jsdom doesn't compute `perspective` / `transform-style`.
import deckSource from './TagBoardDeck.svelte?raw';

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

  // --- FR-10 focus-group ordering and marker derivation (#121) ---

  function userTagLabels(c: HTMLElement): string[] {
    return Array.from(c.querySelectorAll<HTMLElement>('.tag-board-strip-item:not(.synthetic)'))
      .map(b => b.textContent?.trim() ?? '');
  }

  function focusChipLabels(c: HTMLElement): string[] {
    return Array.from(c.querySelectorAll<HTMLElement>('.tag-board-strip-item.focus-group'))
      .map(b => b.textContent?.trim() ?? '');
  }

  it('falls back to alphabetical user-tag order when focusTags is empty', async () => {
    // No focus → group (1) is empty; group (2) holds every tag in alpha
    // order. Synthetic Untagged / All trail at fixed positions.
    render(TagBoardDeck, {
      target: container,
      props: { tasks: makeTasks(), selectedTag: 'All', focusTags: [], board: boardSnippet() },
    });
    await tick();

    expect(userTagLabels(container)).toEqual(['personal', 'urgent', 'work']);
    expect(container.querySelector('.tag-board-strip-focus-marker')).toBeNull();
  });

  it('places focus tags at the front, alphabetically, with non-focus tags following alphabetically', async () => {
    // Available user tags (alpha): personal, urgent, work.
    // Focus = ['work', 'personal'] (input order is intentionally
    // non-alphabetical) → focus group: ['personal', 'work']; non-focus:
    // ['urgent']; synthetic Untagged / All trail.
    render(TagBoardDeck, {
      target: container,
      props: {
        tasks: makeTasks(),
        selectedTag: 'All',
        focusTags: ['work', 'personal'],
        board: boardSnippet(),
      },
    });
    await tick();

    expect(userTagLabels(container)).toEqual(['personal', 'work', 'urgent']);
    expect(focusChipLabels(container)).toEqual(['personal', 'work']);

    // Synthetic Untagged / All still in fixed positions.
    const allItems = Array.from(container.querySelectorAll('.tag-board-strip-item'));
    expect(allItems[allItems.length - 2].textContent?.trim()).toBe('Untagged');
    expect(allItems[allItems.length - 1].textContent?.trim()).toBe('All');
  });

  it('drops focus tags that have no matching board (no tasks carry them)', async () => {
    // `marketing` is in focus but no task carries it → it must NOT
    // surface as a board, and must NOT appear in the focus marker.
    render(TagBoardDeck, {
      target: container,
      props: {
        tasks: makeTasks(),
        selectedTag: 'All',
        focusTags: ['marketing', 'work'],
        board: boardSnippet(),
      },
    });
    await tick();

    expect(userTagLabels(container)).toEqual(['work', 'personal', 'urgent']);
    expect(focusChipLabels(container)).toEqual(['work']);
  });

  it('renders focus marker spanning all focus chips when multiple focus tags are present', async () => {
    render(TagBoardDeck, {
      target: container,
      props: {
        tasks: makeTasks(),
        selectedTag: 'All',
        focusTags: ['urgent', 'work'],
        board: boardSnippet(),
      },
    });
    await tick();

    expect(container.querySelector('.tag-board-strip-focus-marker')).not.toBeNull();
    expect(focusChipLabels(container)).toEqual(['urgent', 'work']);
  });

  it('preserves selection of a non-focus tag when focus group is non-empty (US-2)', async () => {
    // Selected tag (`personal`) is outside the focus group (`work`).
    // Selection must remain on `personal`; the strip must still highlight it.
    render(TagBoardDeck, {
      target: container,
      props: {
        tasks: makeTasks(),
        selectedTag: 'personal',
        focusTags: ['work'],
        board: boardSnippet(),
      },
    });
    await tick();

    const active = container.querySelectorAll('.tag-board-strip-item.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('personal');

    // The slice corresponds to `personal` (T2 only), not `work`.
    expect(visibleIds(container)).toEqual(['T2']);
  });

  it('case-insensitive sort puts mixed-case focus tags in lowercase-alphabetical order', async () => {
    // Construct tasks with mixed-case tags and assert the deck's case-
    // insensitive sort is applied to both groups.
    const tasks: TaskWithStatus[] = [
      { id: 'X1', title: 'X1', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['Banana'] },
      { id: 'X2', title: 'X2', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['apple'] },
      { id: 'X3', title: 'X3', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['Cherry'] },
      { id: 'X4', title: 'X4', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['date'] },
    ];

    render(TagBoardDeck, {
      target: container,
      props: {
        tasks,
        selectedTag: 'All',
        focusTags: ['Cherry', 'apple'],
        board: boardSnippet(),
      },
    });
    await tick();

    // Focus group: ['apple', 'Cherry'] (case-insensitive alpha).
    // Non-focus: ['Banana', 'date'].
    expect(userTagLabels(container)).toEqual(['apple', 'Cherry', 'Banana', 'date']);
    expect(focusChipLabels(container)).toEqual(['apple', 'Cherry']);
  });

  // ---------------------------------------------------------------------
  // Issue #122: 3D stacked rendering — receded card behaviour.
  // These tests cover only the visual layer added in #122. They do NOT
  // overlap with the slicing / mirror / persistence tests above.
  // ---------------------------------------------------------------------

  describe('3D stacked rendering (issue #122)', () => {
    it('renders every non-foreground board as a receded card behind the foreground', async () => {
      // makeTasks() yields user tags [personal, urgent, work] plus an
      // untagged task. With `All` foregrounded we expect 3 user-tag
      // receded cards + Untagged. (No `All` receded — it is the
      // foreground.) Total = 4 receded cards.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      const recededLabels = Array.from(
        container.querySelectorAll('.tag-board-card.receded .tag-board-card-label')
      ).map(el => el.textContent?.trim());

      expect(recededLabels.sort()).toEqual(['Untagged', 'personal', 'urgent', 'work'].sort());
    });

    it('does NOT render the currently-foregrounded tag as a receded card', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      const recededLabels = Array.from(
        container.querySelectorAll('.tag-board-card.receded .tag-board-card-label')
      ).map(el => el.textContent?.trim());

      expect(recededLabels).not.toContain('work');
      const fgLabel = container.querySelector(
        '.tag-board-card.foreground .tag-board-card-label'
      );
      expect(fgLabel?.textContent?.trim()).toBe('work');
    });

    it('only the foreground card mounts board content (AD-5 invariant)', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      // Exactly one .board-content node — owned by the foreground card.
      const contents = container.querySelectorAll('.board-content');
      expect(contents.length).toBe(1);
      // Receded cards must show their chrome shell, not board content.
      const recededShells = container.querySelectorAll(
        '.tag-board-card.receded .tag-board-card-receded-shell'
      );
      expect(recededShells.length).toBeGreaterThan(0);
    });

    it('assigns increasing depth to receded cards in deck order', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      const cards = Array.from(
        container.querySelectorAll<HTMLElement>('.tag-board-card.receded')
      );
      expect(cards.length).toBeGreaterThanOrEqual(2);

      // Depth values come from the inline --card-depth custom property
      // and must form a strictly-increasing sequence across the receded
      // card list (deck order).
      const depths = cards.map(c => Number(c.style.getPropertyValue('--card-depth')));
      for (let i = 1; i < depths.length; i++) {
        expect(depths[i]).toBeGreaterThan(depths[i - 1]);
      }
      expect(depths[0]).toBe(0);
    });

    it('renders the deck inside a 3D perspective container', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      // The container must exist...
      const stack = container.querySelector('.tag-board-stack') as HTMLElement;
      expect(stack).not.toBeNull();
      // ...and the component's compiled CSS contract must declare
      // `perspective` and `transform-style: preserve-3d` on the stack.
      // jsdom does not compute these via getComputedStyle, so we assert
      // the source-text contract — the same approach used for
      // reduced-motion in TagBoardCard.test.ts.
      expect(deckSource).toMatch(
        /\.tag-board-stack\s*\{[\s\S]*?perspective\s*:\s*\d+px/
      );
      expect(deckSource).toMatch(
        /\.tag-board-stack\s*\{[\s\S]*?transform-style\s*:\s*preserve-3d/
      );
    });

    it('does NOT render the All board as a receded card when All is foregrounded', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      const recededLabels = Array.from(
        container.querySelectorAll('.tag-board-card.receded .tag-board-card-label')
      ).map(el => el.textContent?.trim());
      expect(recededLabels).not.toContain('All');
    });

    it('renders the All board as a receded card when a user tag is foregrounded', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      const recededLabels = Array.from(
        container.querySelectorAll('.tag-board-card.receded .tag-board-card-label')
      ).map(el => el.textContent?.trim());
      expect(recededLabels).toContain('All');
    });

    it('hides the Untagged receded card when no tasks are untagged', async () => {
      const tasks = makeTasks().filter(t => t.tags && t.tags.length > 0);
      render(TagBoardDeck, {
        target: container,
        props: { tasks, selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      const recededLabels = Array.from(
        container.querySelectorAll('.tag-board-card.receded .tag-board-card-label')
      ).map(el => el.textContent?.trim());
      expect(recededLabels).not.toContain('Untagged');
    });
  });
});
