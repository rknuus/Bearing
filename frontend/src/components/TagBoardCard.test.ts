import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick, createRawSnippet } from 'svelte';
import TagBoardCard from './TagBoardCard.svelte';
// Vite `?raw` import surfaces the component source so we can assert the
// CSS contract — jsdom doesn't expose Svelte-injected stylesheets reliably
// (no document.styleSheets entry, no <style> textContent). The compiled
// CSS is a 1:1 reflection of what we write here, so source-text assertions
// are a safe proxy for runtime behaviour.
import componentSource from './TagBoardCard.svelte?raw';

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

  it('renders the label in both modes', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const label = container.querySelector('.tag-board-card-label');
    expect(label?.textContent).toBe('work');
  });

  it('foreground mode mounts the children snippet (full board content)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('foreground-board-content') },
    });
    await tick();

    const marker = container.querySelector('.board-content-marker');
    expect(marker?.textContent).toBe('foreground-board-content');
  });

  it('receded mode does NOT mount children — chrome only (AD-5 invariant)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', children: fixedSnippet('should-not-render') },
    });
    await tick();

    // Children must NOT be rendered.
    expect(container.querySelector('.board-content-marker')).toBeNull();

    // The receded shell must be present.
    expect(container.querySelector('.tag-board-card-receded-shell')).not.toBeNull();
  });

  it('receded mode applies the receded class', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'meetings' },
    });
    await tick();

    expect(container.querySelector('.tag-board-card.receded')).not.toBeNull();
    expect(container.querySelector('.tag-board-card.foreground')).toBeNull();
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

  it('exposes depth as a CSS custom property for #122 animation', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work', depth: 3 },
    });
    await tick();

    const card = container.querySelector('.tag-board-card') as HTMLElement;
    expect(card.style.cssText).toContain('--card-depth: 3');
  });

  it('marks the receded shell as aria-hidden', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work' },
    });
    await tick();

    const shell = container.querySelector('.tag-board-card-receded-shell');
    expect(shell?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the entire receded card as aria-hidden (issue #122)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work' },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.receded') as HTMLElement;
    expect(card.getAttribute('aria-hidden')).toBe('true');
  });

  it('does NOT set aria-hidden on the foreground card (issue #122)', async () => {
    render(TagBoardCard, {
      target: container,
      props: { mode: 'foreground', label: 'work', children: fixedSnippet('content') },
    });
    await tick();

    const card = container.querySelector('.tag-board-card.foreground') as HTMLElement;
    expect(card.getAttribute('aria-hidden')).toBeNull();
  });

  it('disables the flip transition under prefers-reduced-motion (CSS-based assertion, issue #122)', async () => {
    // CSS-based verification is the canonical path here — a JS-driven
    // matchMedia mock would only test our mock, not the actual
    // reduced-motion fallback. We assert the @media block exists in the
    // component's compiled CSS by reading the <style> tag text.
    render(TagBoardCard, {
      target: container,
      props: { mode: 'receded', label: 'work' },
    });
    await tick();

    // Assert the CSS contract via the component's <style> source text.
    // The @media (prefers-reduced-motion: reduce) block must disable
    // the card's transition.
    expect(componentSource).toMatch(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/
    );
    const reducedMotionBlock = componentSource.match(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?\n\s*\}/
    );
    expect(reducedMotionBlock).not.toBeNull();
    expect(reducedMotionBlock![0]).toContain('.tag-board-card');
    expect(reducedMotionBlock![0]).toContain('transition: none');
  });
});
