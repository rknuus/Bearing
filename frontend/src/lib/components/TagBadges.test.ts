import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import TagBadges from './TagBadges.svelte';

describe('TagBadges', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderBadges(props: { tags?: string[] }) {
    const result = render(TagBadges, { target: container, props });
    await tick();
    return result;
  }

  function getBadgesContainer(): HTMLElement | null {
    return container.querySelector<HTMLElement>('.tag-badges');
  }

  function getAllBadges(): NodeListOf<HTMLElement> {
    return container.querySelectorAll<HTMLElement>('.tag-badge');
  }

  it('renders tags as #-prefixed badges', async () => {
    await renderBadges({ tags: ['backend', 'api'] });

    const badges = getAllBadges();
    expect(badges.length).toBe(2);
    expect(badges[0].textContent).toBe('#backend');
    expect(badges[1].textContent).toBe('#api');
  });

  it('renders nothing when tags is empty array', async () => {
    await renderBadges({ tags: [] });

    expect(getBadgesContainer()).toBeNull();
  });

  it('renders nothing when tags is undefined', async () => {
    await renderBadges({ tags: undefined });

    expect(getBadgesContainer()).toBeNull();
  });

  it('each badge has correct text with # prefix', async () => {
    await renderBadges({ tags: ['urgent', 'review', 'frontend'] });

    const badges = getAllBadges();
    expect(badges.length).toBe(3);
    expect(badges[0].textContent).toBe('#urgent');
    expect(badges[1].textContent).toBe('#review');
    expect(badges[2].textContent).toBe('#frontend');
  });

  it('shows overflow indicator when tags overflow', async () => {
    // Mock requestAnimationFrame to run callback synchronously
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

    // Mock getBoundingClientRect at the prototype level so it applies during
    // the $effect that fires on initial render. The container (.tag-badges)
    // reports a narrow width; the first badge fits, and the last two overflow.
    const origGetBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains('tag-badges')) {
        return { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
      }
      if (this.classList.contains('tag-badge')) {
        const text = this.textContent ?? '';
        if (text === '#alpha') {
          return { top: 0, left: 0, right: 50, bottom: 20, width: 50, height: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
        }
        if (text === '#beta') {
          return { top: 0, left: 50, right: 110, bottom: 20, width: 60, height: 20, x: 50, y: 0, toJSON() {} } as DOMRect;
        }
        if (text === '#gamma') {
          return { top: 0, left: 110, right: 170, bottom: 20, width: 60, height: 20, x: 110, y: 0, toJSON() {} } as DOMRect;
        }
      }
      return origGetBCR.call(this);
    };

    await renderBadges({ tags: ['alpha', 'beta', 'gamma'] });

    const overflowEl = container.querySelector<HTMLElement>('.tag-overflow');
    expect(overflowEl).toBeTruthy();
    expect(overflowEl?.textContent).toBe('+2');

    // Only the first tag should remain visible
    const visibleBadges = getAllBadges();
    expect(visibleBadges.length).toBe(1);
    expect(visibleBadges[0].textContent).toBe('#alpha');

    Element.prototype.getBoundingClientRect = origGetBCR;
    rafSpy.mockRestore();
  });
});
