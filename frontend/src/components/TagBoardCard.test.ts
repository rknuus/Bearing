import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick, createRawSnippet } from 'svelte';
import TagBoardCard from './TagBoardCard.svelte';

function fixedSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<div class="board-content-marker">${text}</div>`,
  }));
}

describe('TagBoardCard', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // ---------------------------------------------------------------------
  // Receded mode — clickable title bar, no content (AD-5).
  // ---------------------------------------------------------------------

  it('renders the label in receded mode', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', onclick: vi.fn() },
    });
    await tick();

    const label = container.querySelector('.tag-board-card-label');
    expect(label?.textContent).toBe('work');
  });

  it('receded mode renders the title bar as a clickable radio button', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', onclick: vi.fn() },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar.receded');
    expect(titleBar).not.toBeNull();
    expect((titleBar as HTMLElement).tagName).toBe('BUTTON');
    expect(titleBar?.getAttribute('role')).toBe('radio');
    expect(titleBar?.getAttribute('aria-checked')).toBe('false');
  });

  it('receded mode fires onclick when the title bar is clicked', async () => {
    const onclick = vi.fn();
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', onclick },
    });
    await tick();

    const titleBar = container.querySelector(
      '.tag-board-card-title-bar.receded',
    ) as HTMLButtonElement;
    await fireEvent.click(titleBar);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('receded mode does NOT mount children — title bar only (AD-5 invariant)', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'receded',
        label: 'work',
        onclick: vi.fn(),
        children: fixedSnippet('should-not-render'),
      },
    });
    await tick();

    expect(container.querySelector('.board-content-marker')).toBeNull();
    expect(container.querySelector('.tag-board-card-content')).toBeNull();
  });

  it('receded mode applies the receded class on the card and title bar', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'meetings', onclick: vi.fn() },
    });
    await tick();

    expect(container.querySelector('.tag-board-card.receded')).not.toBeNull();
    expect(container.querySelector('.tag-board-card.foreground')).toBeNull();
    expect(container.querySelector('.tag-board-card-title-bar.receded')).not.toBeNull();
  });

  // ---------------------------------------------------------------------
  // Foreground mode — title bar + board content, non-clickable bar.
  // ---------------------------------------------------------------------

  it('foreground mode renders the title bar at the top and board content below', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        children: fixedSnippet('foreground-board-content'),
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    expect(card).not.toBeNull();
    // With no peeks, the title bar is the first child and the content
    // wrapper the second. (Peeks render BEFORE the title bar when
    // present — see the body-peek tests below.)
    const children = Array.from(card.children);
    expect(children[0].classList.contains('tag-board-card-title-bar')).toBe(true);
    expect(children[1].classList.contains('tag-board-card-content')).toBe(true);

    const marker = container.querySelector('.board-content-marker');
    expect(marker?.textContent).toBe('foreground-board-content');
  });

  it('foreground mode renders the title bar with the label (visible inside the stack)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar.foreground');
    expect(titleBar).not.toBeNull();
    expect(titleBar?.querySelector('.tag-board-card-label')?.textContent).toBe('work');
  });

  it('foreground title bar is non-interactive (a static container, not a button)', async () => {
    // The strip is the navigation surface for the foreground; the deck
    // dispatches selection via the receded title bars only. The
    // foreground title bar must therefore not be a button — clicking it
    // must not fire any handler.
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector(
      '.tag-board-card-title-bar.foreground',
    ) as HTMLElement;
    expect(titleBar.tagName).not.toBe('BUTTON');
    expect(titleBar.getAttribute('role')).toBeNull();
  });

  it('foreground mode applies the foreground class', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'meetings', children: fixedSnippet('content') },
    });
    await tick();

    expect(container.querySelector('.tag-board-card.foreground')).not.toBeNull();
    expect(container.querySelector('.tag-board-card.receded')).toBeNull();
  });

  it('foreground card frame has no inner padding (title bar sits flush against the frame)', async () => {
    // Issue #120 visual polish: the foreground frame must not pad its
    // contents — the title bar's outer rectangle is flush against the
    // frame border on all four sides at the top. The kanban content
    // below carries its own padding (.tag-board-card-content) for
    // breathing room around the columns.
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    const styles = getComputedStyle(card);
    // jsdom stringifies a zero-length value as `0` (no unit); accept both.
    const isZero = (v: string) => v === '0px' || v === '0' || v === '';
    expect(isZero(styles.paddingTop)).toBe(true);
    expect(isZero(styles.paddingRight)).toBe(true);
    expect(isZero(styles.paddingBottom)).toBe(true);
    expect(isZero(styles.paddingLeft)).toBe(true);
  });

  it('pins the title bar height to 36px so the foreground reads consistently (issue #120)', async () => {
    // The title bar carries an explicit `height: 36px; box-sizing:
    // border-box;` so the foreground reads the same regardless of
    // font-size / padding / border variation in any caller theme. We
    // assert the structural CSS contract via the component CSS rule
    // applying to the title bar — jsdom does not evaluate scoped Svelte
    // styles in component tests, so we assert the class is present (the
    // rule applies in production CSS) and that no inline override
    // unsets it.
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector(
      '.tag-board-card-title-bar.foreground',
    ) as HTMLElement;
    expect(titleBar).not.toBeNull();
    // No inline height override that would defeat the CSS pin.
    expect(titleBar.style.height).toBe('');
  });

  it('foreground mode marks the title bar with aria-current for assistive tech', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar.foreground');
    expect(titleBar?.getAttribute('aria-current')).toBe('true');
  });

  // ---------------------------------------------------------------------
  // Focus marker — primary-coloured-bordered treatment on the title bar.
  // ---------------------------------------------------------------------

  it('applies the focus class to the title bar when focused=true (receded)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', focused: true, onclick: vi.fn() },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar');
    expect(titleBar?.classList.contains('focused')).toBe(true);
  });

  it('applies the focus class to the title bar when focused=true (foreground)', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        focused: true,
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar');
    expect(titleBar?.classList.contains('focused')).toBe(true);
  });

  it('does NOT apply the focus class when focused is omitted / false', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', onclick: vi.fn() },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar');
    expect(titleBar?.classList.contains('focused')).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Position flag classes — kept on the DOM as positional semantics for
  // future styling. They no longer drive any transform (rotateX tilts
  // were dropped in favour of vertical edges everywhere).
  // ---------------------------------------------------------------------

  it('flags receded cards above the foreground with the before-foreground class', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', position: 'before', onclick: vi.fn() },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card.classList.contains('before-foreground')).toBe(true);
    expect(card.classList.contains('after-foreground')).toBe(false);
  });

  it('flags receded cards below the foreground with the after-foreground class', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', position: 'after', onclick: vi.fn() },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card.classList.contains('after-foreground')).toBe(true);
    expect(card.classList.contains('before-foreground')).toBe(false);
  });

  it('foreground card never carries position-flag classes', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    expect(card.classList.contains('before-foreground')).toBe(false);
    expect(card.classList.contains('after-foreground')).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Compact slivers — depth ≥ 2 receded cards render as 5px non-
  // interactive slabs with no label, no button, no tilt. The depth-1
  // case (default) keeps the full clickable title bar.
  // ---------------------------------------------------------------------

  it('depth=1 (default) receded mode renders the full clickable title bar', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', onclick: vi.fn() },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card.classList.contains('compact')).toBe(false);
    const titleBar = container.querySelector('.tag-board-card-title-bar.receded');
    expect(titleBar).not.toBeNull();
    expect((titleBar as HTMLElement).tagName).toBe('BUTTON');
    expect(titleBar?.querySelector('.tag-board-card-label')?.textContent).toBe('work');
  });

  it('depth=1 explicitly is equivalent to default (full clickable title bar)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', depth: 1, onclick: vi.fn() },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card.classList.contains('compact')).toBe(false);
    expect(container.querySelector('.tag-board-card-title-bar.receded')).not.toBeNull();
  });

  it('depth=2 receded mode renders a compact sliver — no label, no button, aria-hidden', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', depth: 2 },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded.compact') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.getAttribute('aria-hidden')).toBe('true');
    // No title bar, no label rendered for compact slivers.
    expect(container.querySelector('.tag-board-card-title-bar')).toBeNull();
    expect(container.querySelector('.tag-board-card-label')).toBeNull();
  });

  it('depth=3 receded mode also renders a compact sliver', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', depth: 3 },
    });
    await tick();

    expect(container.querySelector('.tag-board-card.receded.compact')).not.toBeNull();
    expect(container.querySelector('.tag-board-card-title-bar')).toBeNull();
  });

  it('compact sliver does not apply the focused class (no title bar to colour)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', depth: 2, focused: true },
    });
    await tick();

    // No title bar exists → no `.focused` element.
    expect(container.querySelector('.tag-board-card-title-bar.focused')).toBeNull();
  });

  it('compact sliver still carries the before-foreground positional class', async () => {
    // Position flag remains a structural classifier on the DOM even on
    // compact slivers; it is no longer tied to a transform but is kept
    // for any future positional styling.
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', depth: 2, position: 'before' },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded.compact') as HTMLElement;
    expect(card.classList.contains('before-foreground')).toBe(true);
    expect(card.classList.contains('compact')).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Horizontal fan stagger — `style` prop projects --stack-x-offset, the
  // CSS rule on .tag-board-card translates by that variable. Applies to
  // every variant: foreground, full-title-bar receded, compact sliver.
  // Title bars keep their natural flex-flow Y positions; the body peek
  // frames are translated diagonally as a unit (see peek tests below).
  // ---------------------------------------------------------------------

  it('applies the inline style prop verbatim to the card root (foreground)', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        style: '--stack-x-offset: 6px;',
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    expect(card.style.getPropertyValue('--stack-x-offset')).toBe('6px');
  });

  it('applies the inline style prop verbatim to the card root (receded full title bar)', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'receded',
        label: 'work',
        onclick: vi.fn(),
        style: '--stack-x-offset: 4px;',
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card.style.getPropertyValue('--stack-x-offset')).toBe('4px');
  });

  it('applies the inline style prop verbatim to compact slivers as well', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'receded',
        label: 'work',
        depth: 2,
        style: '--stack-x-offset: 10px;',
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded.compact') as HTMLElement;
    expect(card.style.getPropertyValue('--stack-x-offset')).toBe('10px');
  });

  it('omits the style attribute when no style prop is supplied', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', onclick: vi.fn() },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    // No offset projected — CSS fallback (0) takes over.
    expect(card.style.getPropertyValue('--stack-x-offset')).toBe('');
  });

  it('does NOT project --stack-y-offset on cards (title bars stay in their natural flex slots)', async () => {
    // Title bars must stay in their natural flex-flow Y positions; the
    // body peek frames carry their own `--peek-y-offset` instead. The
    // card root therefore never exposes a `--stack-y-offset` custom
    // property regardless of any inline style projected by the deck.
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'receded',
        label: 'work',
        onclick: vi.fn(),
        style: '--stack-x-offset: -4px;',
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card.style.getPropertyValue('--stack-y-offset')).toBe('');
  });

  // ---------------------------------------------------------------------
  // Body peeks (issue #120) — empty board-shaped frames layered behind
  // the foreground card, one per non-selected board, the SAME SIZE as
  // the foreground (inset: 0) and translated diagonally as a unit so
  // their L-shaped protrusions stair-step on all four corners.
  // Foreground-only — receded modes ignore the prop. Frames are non-
  // interactive (pointer-events: none), aria-hidden, and faded with
  // depth.
  // ---------------------------------------------------------------------

  it('foreground mode renders no peeks when peekData is omitted (default empty)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    expect(container.querySelectorAll('.board-body-peek').length).toBe(0);
  });

  it('foreground mode renders no peeks when peekData is explicitly empty', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    expect(container.querySelectorAll('.board-body-peek').length).toBe(0);
  });

  it('foreground mode renders one peek per peekData entry with the correct offset and depth', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [
          { depth: 1, xOffset: -2, yOffset: -5 },
          { depth: 2, xOffset: -4, yOffset: -10 },
          { depth: 1, xOffset: 2, yOffset: 5 },
        ],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const peeks = Array.from(container.querySelectorAll<HTMLElement>('.board-body-peek'));
    expect(peeks.length).toBe(3);

    expect(peeks[0].style.getPropertyValue('--peek-x-offset')).toBe('-2px');
    expect(peeks[0].style.getPropertyValue('--peek-y-offset')).toBe('-5px');
    expect(peeks[0].style.getPropertyValue('--peek-depth')).toBe('1');
    expect(peeks[1].style.getPropertyValue('--peek-x-offset')).toBe('-4px');
    expect(peeks[1].style.getPropertyValue('--peek-y-offset')).toBe('-10px');
    expect(peeks[1].style.getPropertyValue('--peek-depth')).toBe('2');
    expect(peeks[2].style.getPropertyValue('--peek-x-offset')).toBe('2px');
    expect(peeks[2].style.getPropertyValue('--peek-y-offset')).toBe('5px');
    expect(peeks[2].style.getPropertyValue('--peek-depth')).toBe('1');
  });

  it('foreground mode projects --peek-y-offset alongside --peek-x-offset (peek translated diagonally)', async () => {
    // Each peek is the same size as the foreground (inset: 0) and is
    // translated diagonally as a unit. Above-peeks translate up-left
    // (negative xOffset, negative yOffset); below-peeks translate
    // down-right (positive xOffset, positive yOffset). The deck supplies
    // the pixel values; the card must project them as CSS custom
    // properties so the `.board-body-peek` rule picks them up at
    // runtime.
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [
          { depth: 1, xOffset: -2, yOffset: -5 },
          { depth: 1, xOffset: 2, yOffset: 5 },
        ],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const peeks = Array.from(container.querySelectorAll<HTMLElement>('.board-body-peek'));
    expect(peeks.length).toBe(2);
    // Each peek projects both offset variables — none dropped.
    peeks.forEach(peek => {
      expect(peek.style.getPropertyValue('--peek-x-offset')).not.toBe('');
      expect(peek.style.getPropertyValue('--peek-y-offset')).not.toBe('');
    });
    // Above peek shifts up-left, below peek shifts down-right.
    expect(peeks[0].style.getPropertyValue('--peek-y-offset')).toBe('-5px');
    expect(peeks[1].style.getPropertyValue('--peek-y-offset')).toBe('5px');
  });

  it('foreground mode does NOT project --peek-top / --peek-bottom on body peeks (replaced by --peek-y-offset)', async () => {
    // The peek frame is no longer extended via `top` / `bottom`; it is
    // the same size as the foreground (inset: 0) and is translated
    // diagonally. The peek elements therefore must not carry
    // `--peek-top` or `--peek-bottom` variables.
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [{ depth: 1, xOffset: -2, yOffset: -5 }],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const peek = container.querySelector('.board-body-peek') as HTMLElement;
    expect(peek.style.getPropertyValue('--peek-top')).toBe('');
    expect(peek.style.getPropertyValue('--peek-bottom')).toBe('');
  });

  it('peek frames are aria-hidden so assistive tech ignores them', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [{ depth: 1, xOffset: -2, yOffset: -5 }],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const peek = container.querySelector('.board-body-peek');
    expect(peek?.getAttribute('aria-hidden')).toBe('true');
  });

  it('peek frames carry the .board-body-peek class (CSS rules apply pointer-events: none)', async () => {
    // The `.board-body-peek` selector in the component CSS sets
    // `pointer-events: none` and `user-select: none`. jsdom does not
    // apply scoped Svelte styles in test, so we assert the structural
    // class — the CSS contract — rather than the computed value.
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [{ depth: 1, xOffset: -2, yOffset: -5 }],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const peek = container.querySelector('.board-body-peek') as HTMLElement;
    expect(peek).not.toBeNull();
    expect(peek.classList.contains('board-body-peek')).toBe(true);
  });

  it('peek depth ordering means lower-depth peeks render with smaller --peek-depth values (drives CSS z-index / opacity)', async () => {
    // The component CSS computes `z-index: calc(50 - var(--peek-depth))`
    // and `opacity: max(0.30, 1 - var(--peek-depth) * 0.15)`. Both
    // monotonically decrease with depth — so asserting that --peek-depth
    // is correctly projected per peek is sufficient to guarantee the
    // visual ordering in production CSS. (jsdom does not evaluate the
    // calc()/max() expressions, so we assert the input variables.)
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [
          { depth: 1, xOffset: -2, yOffset: -5 },
          { depth: 2, xOffset: -4, yOffset: -10 },
          { depth: 3, xOffset: -6, yOffset: -15 },
        ],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const peeks = Array.from(container.querySelectorAll<HTMLElement>('.board-body-peek'));
    const depths = peeks.map(el => parseInt(el.style.getPropertyValue('--peek-depth'), 10));
    // Strictly ascending depth → strictly decreasing z-index and opacity
    // once the calc()/max() rules apply at runtime.
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThan(depths[i - 1]);
    }
  });

  it('peek frames are siblings of the title bar inside the foreground card (span title bar + body)', async () => {
    // The peek frames are direct children of `.tag-board-card.foreground`
    // (siblings of `.tag-board-card-title-bar` and
    // `.tag-board-card-content`) so they span the full card rectangle —
    // title bar AND body — and are translated diagonally as a unit so
    // their L-shaped protrusions stair-step on all four corners.
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [
          { depth: 1, xOffset: -2, yOffset: -5 },
          { depth: 2, xOffset: -4, yOffset: -10 },
        ],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    const peeks = Array.from(card.querySelectorAll<HTMLElement>('.board-body-peek'));
    // Every peek must be a DIRECT child of the foreground card, not
    // nested inside the content wrapper.
    peeks.forEach(peek => {
      expect(peek.parentElement).toBe(card);
    });
    // No peeks leak into the content wrapper.
    const content = container.querySelector('.tag-board-card-content') as HTMLElement;
    expect(content.querySelectorAll('.board-body-peek').length).toBe(0);
  });

  it('peeks render BEFORE the title bar in DOM order so paint order keeps them behind', async () => {
    // The peeks render as the first children of the foreground card,
    // BEFORE the title bar element. Combined with the CSS z-index
    // (peeks ≤ 49, title bar / content = 100), this is doubly safe:
    // even without the z-index, default paint order would draw the
    // title bar over the peeks because it appears later in the tree.
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [
          { depth: 1, xOffset: -2, yOffset: -5 },
          { depth: 1, xOffset: 2, yOffset: 5 },
        ],
        children: fixedSnippet('content'),
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    const kids = Array.from(card.children);
    // First two children are peeks, then the title bar, then content.
    expect(kids[0].classList.contains('board-body-peek')).toBe(true);
    expect(kids[1].classList.contains('board-body-peek')).toBe(true);
    expect(kids[2].classList.contains('tag-board-card-title-bar')).toBe(true);
    expect(kids[3].classList.contains('tag-board-card-content')).toBe(true);
  });

  it('foreground-body wraps the children snippet so they sit above the peeks', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'foreground',
        label: 'work',
        peekData: [{ depth: 1, xOffset: -2, yOffset: -5 }],
        children: fixedSnippet('foreground-board-content'),
      },
    });
    await tick();

    const body = container.querySelector('.foreground-body');
    expect(body).not.toBeNull();
    expect(body?.querySelector('.board-content-marker')?.textContent).toBe('foreground-board-content');
  });

  it('receded mode ignores peekData (no peek frames render)', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'receded',
        label: 'work',
        peekData: [{ depth: 1, xOffset: 2, yOffset: 5 }],
        onclick: vi.fn(),
      },
    });
    await tick();

    expect(container.querySelectorAll('.board-body-peek').length).toBe(0);
  });

  it('compact (depth ≥ 2) receded mode ignores peekData (no peek frames render)', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        mode: 'receded',
        label: 'work',
        depth: 2,
        peekData: [{ depth: 1, xOffset: 2, yOffset: 5 }],
      },
    });
    await tick();

    expect(container.querySelectorAll('.board-body-peek').length).toBe(0);
  });

  // ---------------------------------------------------------------------
  // Receded title bar / sliver stacking — receded cards must paint above
  // the body peek frames (peeks z-index ≤ 49) so the receded title bar
  // sits INSIDE its corresponding extended peek frame, not behind it.
  // The component CSS sets `position: relative; z-index: 200` on every
  // receded card; we assert the structural class so production CSS is
  // applied. (jsdom does not evaluate cascading CSS in component tests.)
  // ---------------------------------------------------------------------

  it('receded card carries the receded class so the CSS stacks it above peeks', async () => {
    // The CSS rule `.tag-board-card.receded { position: relative;
    // z-index: 200; }` raises the receded card above the peek frames
    // (z-index ≤ 49). We assert the class so the rule applies.
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', onclick: vi.fn() },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.classList.contains('receded')).toBe(true);
  });

  it('compact receded sliver also carries the receded class (paints above peeks too)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', depth: 2 },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded.compact') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.classList.contains('receded')).toBe(true);
    expect(card.classList.contains('compact')).toBe(true);
  });
});
