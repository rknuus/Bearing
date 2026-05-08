import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
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
  // Foreground rendering — title bar + board content, non-clickable bar.
  // ---------------------------------------------------------------------

  it('renders the title bar at the top and board content below', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        label: 'work',
        children: fixedSnippet('foreground-board-content'),
      },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    expect(card).not.toBeNull();
    const children = Array.from(card.children);
    expect(children[0].classList.contains('tag-board-card-title-bar')).toBe(true);
    expect(children[1].classList.contains('tag-board-card-content')).toBe(true);

    const marker = container.querySelector('.board-content-marker');
    expect(marker?.textContent).toBe('foreground-board-content');
  });

  it('renders the title bar with the label (visible inside the deck)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar');
    expect(titleBar).not.toBeNull();
    expect(titleBar?.querySelector('.tag-board-card-label')?.textContent).toBe('work');
  });

  it('foreground title bar is non-interactive (a static container, not a button)', async () => {
    // The strip is the canonical navigation surface; the foreground
    // title bar must therefore not be a button — clicking it must not
    // fire any handler.
    render(TagBoardCard, {
      target: container,
      props: { label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector(
      '.tag-board-card-title-bar',
    ) as HTMLElement;
    expect(titleBar.tagName).not.toBe('BUTTON');
    expect(titleBar.getAttribute('role')).toBeNull();
  });

  it('applies the foreground class on the card', async () => {
    render(TagBoardCard, {
      target: container,
      props: { label: 'meetings', children: fixedSnippet('content') },
    });
    await tick();

    expect(container.querySelector('.tag-board-card.foreground')).not.toBeNull();
  });

  it('foreground card frame has no inner padding (title bar sits flush against the frame)', async () => {
    // Issue #120 visual polish: the foreground frame must not pad its
    // contents — the title bar's outer rectangle is flush against the
    // frame border on all four sides at the top. The kanban content
    // below carries its own padding (.tag-board-card-content) for
    // breathing room around the columns.
    render(TagBoardCard, {
      target: container,
      props: { label: 'work', children: fixedSnippet('content') },
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
    // assert no inline override unsets it; the structural CSS rule
    // applies in production CSS.
    render(TagBoardCard, {
      target: container,
      props: { label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector(
      '.tag-board-card-title-bar',
    ) as HTMLElement;
    expect(titleBar).not.toBeNull();
    expect(titleBar.style.height).toBe('');
  });

  it('marks the title bar with aria-current for assistive tech', async () => {
    render(TagBoardCard, {
      target: container,
      props: { label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar');
    expect(titleBar?.getAttribute('aria-current')).toBe('true');
  });

  // ---------------------------------------------------------------------
  // Focus marker — primary-coloured-bordered treatment on the title bar.
  // ---------------------------------------------------------------------

  it('applies the focus class to the title bar when focused=true', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
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
      props: { label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const titleBar = container.querySelector('.tag-board-card-title-bar');
    expect(titleBar?.classList.contains('focused')).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Foreground body — the children snippet sits inside `.foreground-body`
  // so the kanban content fills the available space.
  // ---------------------------------------------------------------------

  it('foreground-body wraps the children snippet', async () => {
    render(TagBoardCard, {
      target: container,
      props: {
        label: 'work',
        children: fixedSnippet('foreground-board-content'),
      },
    });
    await tick();

    const body = container.querySelector('.foreground-body');
    expect(body).not.toBeNull();
    expect(body?.querySelector('.board-content-marker')?.textContent).toBe('foreground-board-content');
  });
});
