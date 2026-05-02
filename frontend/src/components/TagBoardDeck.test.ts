import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick, createRawSnippet } from 'svelte';
import TagBoardDeck from './TagBoardDeck.svelte';
import type { TaskWithStatus } from '../lib/wails-mock';
import { setClockForTesting, resetClock } from '../lib/utils/clock';

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
    expect(container.querySelector('.focus-group-frame')).toBeNull();
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

    expect(container.querySelector('.focus-group-frame')).not.toBeNull();
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
  // Issue #120 redesign: vertical-accordion stack.
  //
  // The deck stacks all boards as title bars; only the selected board
  // expands its content inline. Visual top-to-bottom order is the
  // REVERSE of the strip order, so the rightmost-strip tag (`All`) sits
  // at the top of the stack and the leftmost user tag at the bottom.
  // ---------------------------------------------------------------------

  describe('vertical-accordion stack (issue #120 redesign)', () => {
    function stackTitleBarLabels(c: HTMLElement): string[] {
      return Array.from(
        c.querySelectorAll<HTMLElement>('.tag-board-stack .tag-board-card-label'),
      ).map(el => el.textContent?.trim() ?? '');
    }

    function stackCardOrder(c: HTMLElement): string[] {
      // The top-to-bottom ordering of every rendered card in the stack.
      // Non-selected entries no longer render in the deck (issue #120) —
      // their visual indication is conveyed by the body peek frames'
      // stair-stepped top / bottom edges.
      return Array.from(
        c.querySelectorAll<HTMLElement>('.tag-board-stack > .tag-board-card'),
      ).map(card => card.querySelector('.tag-board-card-label')?.textContent?.trim() ?? '');
    }

    it('renders only the foreground card in the stack (every non-selected board omitted)', async () => {
      // makeTasks() user tags (alpha): personal, urgent, work; an
      // untagged task exists. Strip order = [personal, urgent, work,
      // Untagged, All]; visual order = [All, Untagged, work, urgent,
      // personal] (reversed). Selected `All` foregrounded → only the
      // foreground (All) renders in the flex stack; every non-selected
      // entry is conveyed by the body peek frames behind the foreground.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      expect(stackCardOrder(container)).toEqual(['All']);
      expect(stackTitleBarLabels(container)).toEqual(['All']);
    });

    it('renders the selected board in foreground mode and no other cards in the deck', async () => {
      // `work` selected — visual order = [All, Untagged, work, urgent,
      // personal]. Only `work` renders as a card in the deck stack.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      const cards = Array.from(
        container.querySelectorAll<HTMLElement>('.tag-board-stack > .tag-board-card'),
      );
      expect(cards.length).toBe(1);
      expect(cards[0].classList.contains('foreground')).toBe(true);
      expect(cards[0].querySelector('.tag-board-card-label')?.textContent?.trim()).toBe('work');
    });

    it('selected board is the only one that mounts board content (AD-5 invariant)', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      // Exactly one .board-content node — owned by the foreground card.
      const contents = container.querySelectorAll('.board-content');
      expect(contents.length).toBe(1);

      // It must live inside the foreground card.
      const foreground = container.querySelector('.tag-board-card.foreground');
      expect(foreground?.querySelector('.board-content')).not.toBeNull();
    });

    it('does not render any receded title bars in the deck (no clickable cards beyond the foreground)', async () => {
      // Issue #120 simplification: the deck exposes selection only via
      // the strip; non-selected boards no longer render as title-bar
      // rows in the deck. Verify that no receded card is present.
      render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: 'All',
          board: boardSnippet(),
        },
      });
      await tick();

      const recededCards = container.querySelectorAll(
        '.tag-board-stack .tag-board-card.receded',
      );
      expect(recededCards.length).toBe(0);
    });

    it('does NOT render the currently-foregrounded tag anywhere as a receded title bar', async () => {
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      const recededLabels = Array.from(
        container.querySelectorAll('.tag-board-stack .tag-board-card.receded .tag-board-card-label'),
      ).map(el => el.textContent?.trim());
      expect(recededLabels).not.toContain('work');
    });

    it('does not render an Untagged row in the deck regardless of untagged-task presence', async () => {
      // Even when untagged tasks exist, the deck renders no row for
      // them — `Untagged` is reachable only via the strip.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      expect(stackTitleBarLabels(container)).not.toContain('Untagged');
    });

    it('foreground is the sole card in the deck irrespective of selection or focus', async () => {
      // Probe several selections; only the foreground card ever renders
      // inside the deck stack. No before-/after-foreground siblings.
      for (const tag of ['All', 'Untagged', 'work', 'urgent', 'personal']) {
        container.innerHTML = '';
        render(TagBoardDeck, {
          target: container,
          props: { tasks: makeTasks(), selectedTag: tag, board: boardSnippet() },
        });
        await tick();

        const cards = Array.from(
          container.querySelectorAll<HTMLElement>('.tag-board-stack > .tag-board-card'),
        );
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('foreground')).toBe(true);
        expect(cards[0].classList.contains('before-foreground')).toBe(false);
        expect(cards[0].classList.contains('after-foreground')).toBe(false);
      }
    });

    it('does not render any focus-marked title bar for non-selected focus tags (deck has no receded rows)', async () => {
      // Focus = ['work']. With `personal` selected, `work` is omitted
      // from the deck entirely (no title bar). Selecting `work` puts the
      // focus marker on the foreground; verifying that here as well.
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

      const focusedBars = Array.from(
        container.querySelectorAll<HTMLElement>('.tag-board-stack .tag-board-card-title-bar.focused'),
      ).map(el => el.querySelector('.tag-board-card-label')?.textContent?.trim());

      // `personal` is not in focus, so no focused title bar in the deck.
      expect(focusedBars).toEqual([]);
    });

    it('projects --stack-x-offset = 0px on the foreground (the sole card in the deck)', async () => {
      // Only the foreground renders in the deck (issue #120). The
      // foreground always sits at offset 0 — it is the fan centre.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      const cards = Array.from(
        container.querySelectorAll<HTMLElement>('.tag-board-stack > .tag-board-card'),
      );
      expect(cards.length).toBe(1);
      expect(cards[0].style.getPropertyValue('--stack-x-offset')).toBe('0px');
    });

    it('does NOT project a --stack-y-offset on the foreground card', async () => {
      // The foreground stays in its natural flex-flow Y position. The
      // body peek frames are translated diagonally as a unit (via
      // `--peek-y-offset` in TagBoardCard) so their L-shaped
      // protrusions stair-step on all four corners.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      const cards = Array.from(
        container.querySelectorAll<HTMLElement>('.tag-board-stack > .tag-board-card'),
      );
      expect(cards.length).toBe(1);
      expect(cards[0].style.getPropertyValue('--stack-y-offset')).toBe('');
    });

    it('foreground always has --stack-x-offset = 0px (it is the fan centre)', async () => {
      // The foreground sits at the centre of the symmetric fan
      // regardless of its position in the visual order. Probe several
      // selections to confirm the invariant.
      for (const tag of ['All', 'Untagged', 'work', 'urgent', 'personal']) {
        container.innerHTML = '';
        render(TagBoardDeck, {
          target: container,
          props: { tasks: makeTasks(), selectedTag: tag, board: boardSnippet() },
        });
        await tick();
        const fg = container.querySelector('.tag-board-card.foreground') as HTMLElement;
        expect(fg.style.getPropertyValue('--stack-x-offset')).toBe('0px');
      }
    });

    // -------------------------------------------------------------------
    // Body peeks (issue #120). The deck emits one peek per non-selected
    // board into the foreground TagBoardCard, with `depth = |i -
    // foregroundIndex|`, `xOffset = (i - foregroundIndex) * 2px`, and
    // `yOffset = (i - foregroundIndex) * 5px`. The peeks render as
    // `.board-body-peek` siblings inside the foreground card; their
    // inline styles encode the per-peek depth and diagonal translation
    // for the deck contract.
    // -------------------------------------------------------------------

    function peekDescriptors(c: HTMLElement): Array<{ depth: number; xOffset: number; yOffset: number }> {
      return Array.from(
        c.querySelectorAll<HTMLElement>('.tag-board-card.foreground .board-body-peek'),
      ).map(el => ({
        depth: parseInt(el.style.getPropertyValue('--peek-depth'), 10),
        xOffset: parseInt(el.style.getPropertyValue('--peek-x-offset'), 10),
        yOffset: parseInt(el.style.getPropertyValue('--peek-y-offset'), 10),
      }));
    }

    it('emits peeks behind the foreground for every non-selected board', async () => {
      // Visual order = [All, Untagged, work, urgent, personal] (length 5)
      // with `work` selected (foregroundIndex = 2). Four peeks expected.
      // Each peek is the same size as the foreground and translated
      // diagonally by (signedDist × 2px, signedDist × 5px):
      // i=0 (All)      → depth 2, xOffset -4, yOffset -10
      // i=1 (Untagged) → depth 1, xOffset -2, yOffset  -5
      // i=3 (urgent)   → depth 1, xOffset +2, yOffset  +5
      // i=4 (personal) → depth 2, xOffset +4, yOffset +10
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      expect(peekDescriptors(container)).toEqual([
        { depth: 2, xOffset: -4, yOffset: -10 },
        { depth: 1, xOffset: -2, yOffset: -5 },
        { depth: 1, xOffset: 2, yOffset: 5 },
        { depth: 2, xOffset: 4, yOffset: 10 },
      ]);
    });

    it('emits no peeks when the foreground is at index 0 of the visual order (issue #126)', async () => {
      // Visual order = [All, Untagged, work, urgent, personal] with
      // `All` selected → foregroundIndex = 0. With the leftmost-strip
      // tag (top of stack) foregrounded, every non-selected board would
      // otherwise sit below — peeks would shift down-right by
      // (+N×2px, +N×5px). Their straight left edges and bottom-left
      // curved corners would then fall inside the foreground's bottom-
      // left rounded-corner recession zone (border-radius: 8px),
      // painting a small "ear" artefact at the bottom-left of the
      // foreground (issue #126). The deck must therefore emit no peek
      // descriptors at all when foregroundIndex === 0 so no peek-frame
      // visual extent appears anywhere left-of or below the foreground.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      expect(peekDescriptors(container)).toEqual([]);
    });

    it('renders no .board-body-peek elements when the leftmost-strip tag is foregrounded (issue #126)', async () => {
      // Direct DOM-level invariant: when `selectedTag === 'All'` (the
      // canonical leftmost-strip tag → foregroundIndex 0 in visualOrder
      // after the deck's reverse), there must be zero `.board-body-peek`
      // elements rendered. This guards against a future regression that
      // would re-introduce peek descriptors on the leftmost-selected
      // case (where the rounded-corner reveal exposed the depth-1
      // peek's left edge as a bottom-left "ear" artefact).
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      const peekFrames = container.querySelectorAll('.tag-board-card.foreground .board-body-peek');
      expect(peekFrames.length).toBe(0);
    });

    it('emits peeks with negative xOffset and negative yOffset when the foreground is at the end of the visual order', async () => {
      // Visual order = [All, Untagged, work, urgent, personal] with
      // `personal` selected → foregroundIndex = 4. Every non-selected
      // board sits ABOVE the foreground, so every peek shifts up-left
      // by (-N×2px, -N×5px).
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'personal', board: boardSnippet() },
      });
      await tick();

      expect(peekDescriptors(container)).toEqual([
        { depth: 4, xOffset: -8, yOffset: -20 },
        { depth: 3, xOffset: -6, yOffset: -15 },
        { depth: 2, xOffset: -4, yOffset: -10 },
        { depth: 1, xOffset: -2, yOffset: -5 },
      ]);
    });

    it('does not render any receded cards in the deck (peeks only emit on the foreground)', async () => {
      // Issue #120 simplification: only the foreground card mounts in
      // the deck, so there is no receded-card surface that could carry
      // a `.board-body-peek`. The peeks only ever live inside the
      // foreground card.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      const recededCards = container.querySelectorAll(
        '.tag-board-stack .tag-board-card.receded',
      );
      expect(recededCards.length).toBe(0);
    });

    // -------------------------------------------------------------------
    // Dynamic stack padding (issue #120). Body peek frames extend past
    // the foreground edge by N × 5 px where N is the worst-case above /
    // below depth. The deck must project matching padding via
    // `--stack-padding-top` / `--stack-padding-bottom` so peek
    // extensions stay inside the stack's bounds.
    // -------------------------------------------------------------------

    function stackPadding(c: HTMLElement): { top: string; bottom: string } {
      const stack = c.querySelector('.tag-board-stack') as HTMLElement;
      return {
        top: stack.style.getPropertyValue('--stack-padding-top'),
        bottom: stack.style.getPropertyValue('--stack-padding-bottom'),
      };
    }

    it('projects zero padding on both sides when foreground sits at the top of the visual order (issue #126)', async () => {
      // Visual order = [All, Untagged, work, urgent, personal] (length 5)
      // with `All` selected → foregroundIndex = 0. maxAboveDepth = 0 →
      // padding-top = 0. Issue #126: peek descriptors are suppressed
      // entirely when foregroundIndex === 0, so there is no extension
      // below to absorb either — padding-bottom collapses to 0 to keep
      // the foreground flush with the stack's bottom edge.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'All', board: boardSnippet() },
      });
      await tick();

      expect(stackPadding(container)).toEqual({ top: '0px', bottom: '0px' });
    });

    it('projects symmetric stack padding when foreground sits in the middle of the visual order', async () => {
      // Visual order = [All, Untagged, work, urgent, personal] (length 5)
      // with `work` selected → foregroundIndex = 2. maxAboveDepth = 2 →
      // padding-top = 2*5 = 10; maxBelowDepth = 2 → padding-bottom = 10.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'work', board: boardSnippet() },
      });
      await tick();

      expect(stackPadding(container)).toEqual({ top: '10px', bottom: '10px' });
    });

    it('projects zero bottom padding when foreground sits at the bottom of the visual order', async () => {
      // Visual order = [All, Untagged, work, urgent, personal] (length 5)
      // with `personal` selected → foregroundIndex = 4. maxAboveDepth = 4
      // → padding-top = 4*5 = 20; maxBelowDepth = 0 → padding-bottom = 0.
      render(TagBoardDeck, {
        target: container,
        props: { tasks: makeTasks(), selectedTag: 'personal', board: boardSnippet() },
      });
      await tick();

      expect(stackPadding(container)).toEqual({ top: '20px', bottom: '0px' });
    });

    it('marks the foreground title bar as focused when the selected board is in focus', async () => {
      render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: 'work',
          focusTags: ['work'],
          board: boardSnippet(),
        },
      });
      await tick();

      const fg = container.querySelector(
        '.tag-board-card.foreground .tag-board-card-title-bar',
      );
      expect(fg?.classList.contains('focused')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Issue #123: default-board rule on view-mount and midnight rollover.
  //
  // These tests cover the two AD-4 live-update triggers (view-mount
  // re-read, midnight rollover) and the US-1 default-board rule. The
  // mount-only re-read is exercised implicitly: each `render(...)` call
  // is a fresh mount and the focus snapshot is captured per mount.
  // ---------------------------------------------------------------------

  describe('default-board rule (US-1)', () => {
    function activeUserTagLabel(c: HTMLElement): string | null {
      const active = c.querySelector('.tag-board-strip-item.active');
      return active?.textContent?.trim() ?? null;
    }

    it('foregrounds the alphabetically-first focus tag when no persisted selection', async () => {
      // Focus = ['work', 'deep-work']. Tasks include both. With no
      // persisted selection the deck must land on `deep-work` (alpha-1st).
      const tasks: TaskWithStatus[] = [
        { id: 'A', title: 'A', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['work'] },
        { id: 'B', title: 'B', themeId: 'HF', priority: 'important-urgent', status: 'todo', tags: ['deep-work'] },
      ];

      const onSelectionChange = vi.fn();
      render(TagBoardDeck, {
        target: container,
        props: {
          tasks,
          selectedTag: null,
          focusTags: ['work', 'deep-work'],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await tick();

      expect(activeUserTagLabel(container)).toBe('deep-work');
      // Default-board resolution must be persisted upward so the next
      // view-mount sees a recognised selection (US-1 + AD-6).
      expect(onSelectionChange).toHaveBeenCalledWith('deep-work');
    });

    it('falls back to All when no focus tag matches a board (focus = [])', async () => {
      const onSelectionChange = vi.fn();
      render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: null,
          focusTags: [],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await tick();

      const allBtn = container.querySelector('.tag-board-strip-item.synthetic.all');
      expect(allBtn?.classList.contains('active')).toBe(true);
      // Persisted is null → resolved is `All`; deck propagates the
      // resolution so the next mount sees a recognised selection.
      expect(onSelectionChange).toHaveBeenCalledWith('All');
    });

    it('falls back to All when every focus tag has no matching board', async () => {
      // Focus tags exist but none matches a tag carried by any task →
      // intersection is empty → default rule returns `All`.
      const onSelectionChange = vi.fn();
      render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: null,
          focusTags: ['marketing', 'sales'],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await tick();

      const allBtn = container.querySelector('.tag-board-strip-item.synthetic.all');
      expect(allBtn?.classList.contains('active')).toBe(true);
      expect(onSelectionChange).toHaveBeenCalledWith('All');
    });

    it('persisted user-tag selection wins over the default-board rule', async () => {
      // Focus would default to `personal` (alpha-1st present), but the
      // user has `urgent` persisted and that tag still has a board, so
      // selection must stick on `urgent`.
      const onSelectionChange = vi.fn();
      render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: 'urgent',
          focusTags: ['personal'],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await tick();

      expect(activeUserTagLabel(container)).toBe('urgent');
      // Persisted was already recognised → no upward propagation.
      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('persisted "All" / "Untagged" always wins (synthetic boards exist by definition)', async () => {
      // Even with focus tags pointing at real boards, an explicit `All`
      // selection must be respected. Synthetic identifiers always count
      // as recognised.
      for (const seed of ['All', 'Untagged']) {
        container.innerHTML = '';
        const onSelectionChange = vi.fn();
        render(TagBoardDeck, {
          target: container,
          props: {
            tasks: makeTasks(),
            selectedTag: seed,
            focusTags: ['work'],
            onSelectionChange,
            board: boardSnippet(),
          },
        });
        await tick();
        const activeSynth = container.querySelector('.tag-board-strip-item.synthetic.active');
        expect(activeSynth?.textContent?.trim()).toBe(seed);
        expect(onSelectionChange).not.toHaveBeenCalled();
      }
    });

    it('falls back to default-board rule when persisted selection refers to a removed tag', async () => {
      // `errands` is persisted but no task carries that tag any more
      // (e.g., the last task with that tag was retagged). Focus =
      // `personal` exists → resolved = `personal`.
      const onSelectionChange = vi.fn();
      render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: 'errands',
          focusTags: ['personal'],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await tick();

      expect(activeUserTagLabel(container)).toBe('personal');
      expect(onSelectionChange).toHaveBeenCalledWith('personal');
    });
  });

  describe('midnight rollover (FR-11)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      resetClock();
      vi.useRealTimers();
    });

    /** Flush microtasks so reactive updates propagate under fake timers. */
    async function flush(rounds = 5) {
      for (let i = 0; i < rounds; i++) {
        await vi.advanceTimersByTimeAsync(0);
        await tick();
      }
    }

    it('reschedules at midnight and re-applies the default-board rule when no manual pick', async () => {
      // Day-1 clock is just before midnight. Today's focus has `personal`
      // (alpha-1st present), so the deck lands on `personal`.
      setClockForTesting(() => new Date(2026, 4, 1, 23, 59, 59, 900));

      const onSelectionChange = vi.fn();
      const result = render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: null,
          focusTags: ['personal'],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await flush();

      // Initial mount resolves to `personal`.
      expect(onSelectionChange).toHaveBeenCalledWith('personal');
      onSelectionChange.mockClear();

      // Cross midnight; parent has updated focus to `urgent` and pushed
      // an updated prop. Persisted selection is still null (the parent
      // hasn't accepted the previous emit in this test wiring).
      setClockForTesting(() => new Date(2026, 4, 2, 0, 0, 0, 100));
      result.rerender({
        tasks: makeTasks(),
        selectedTag: null,
        focusTags: ['urgent'],
        onSelectionChange,
        board: boardSnippet(),
      });
      // Fire the midnight timeout (~100ms after the original 23:59:59:900
      // baseline) and let reactivity settle.
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      // Default-board rule must re-evaluate against the new focus and
      // the resolved choice must propagate upward.
      expect(onSelectionChange).toHaveBeenCalledWith('urgent');
    });

    it('persisted user selection persists across midnight (US-8)', async () => {
      // User has explicitly selected `personal`. Even though midnight
      // rolls over and focus changes, a recognised persisted selection
      // wins — no spurious onSelectionChange emission.
      setClockForTesting(() => new Date(2026, 4, 1, 23, 59, 59, 900));

      const onSelectionChange = vi.fn();
      const result = render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: 'personal',
          focusTags: ['urgent'],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await flush();
      // Mount: persisted is recognised → no emission.
      expect(onSelectionChange).not.toHaveBeenCalled();

      // Cross midnight with a different focus.
      setClockForTesting(() => new Date(2026, 4, 2, 0, 0, 0, 100));
      result.rerender({
        tasks: makeTasks(),
        selectedTag: 'personal',
        focusTags: ['work'],
        onSelectionChange,
        board: boardSnippet(),
      });
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      // Persisted `personal` is still a valid user tag → no override.
      expect(onSelectionChange).not.toHaveBeenCalled();
      const active = container.querySelector('.tag-board-strip-item.active');
      expect(active?.textContent?.trim()).toBe('personal');
    });

    it('clears the midnight timer on unmount (no leaked callback)', async () => {
      setClockForTesting(() => new Date(2026, 4, 1, 23, 59, 59, 900));

      const onSelectionChange = vi.fn();
      const result = render(TagBoardDeck, {
        target: container,
        props: {
          tasks: makeTasks(),
          selectedTag: null,
          focusTags: [],
          onSelectionChange,
          board: boardSnippet(),
        },
      });
      await flush();
      onSelectionChange.mockClear();

      // Unmount before the timer fires.
      result.unmount();

      // Cross midnight; the cleared timer must not invoke the callback.
      setClockForTesting(() => new Date(2026, 4, 2, 0, 0, 0, 100));
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      expect(onSelectionChange).not.toHaveBeenCalled();
    });
  });
});
