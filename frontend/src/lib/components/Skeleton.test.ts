import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Skeleton from './Skeleton.svelte';

describe('Skeleton', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders a span with the .skeleton class', async () => {
    render(Skeleton, { target: container });
    await tick();

    const el = container.querySelector('.skeleton');
    expect(el).toBeTruthy();
    expect(el?.tagName).toBe('SPAN');
  });

  it('applies width, height and border-radius from props', async () => {
    render(Skeleton, {
      target: container,
      props: { width: '120px', height: '24px', rounded: '8px' },
    });
    await tick();

    const el = container.querySelector<HTMLElement>('.skeleton');
    expect(el?.style.width).toBe('120px');
    expect(el?.style.height).toBe('24px');
    expect(el?.style.borderRadius).toBe('8px');
  });

  it('maps rounded="pill" to 9999px and rounded="circle" to 50%', async () => {
    const pill = render(Skeleton, {
      target: container,
      props: { rounded: 'pill' },
    });
    await tick();
    expect(container.querySelector<HTMLElement>('.skeleton')?.style.borderRadius).toBe('9999px');
    pill.unmount();

    render(Skeleton, {
      target: container,
      props: { rounded: 'circle' },
    });
    await tick();
    expect(container.querySelector<HTMLElement>('.skeleton')?.style.borderRadius).toBe('50%');
  });

  it('toggles the shimmer class via the shimmer prop', async () => {
    const off = render(Skeleton, {
      target: container,
      props: { shimmer: false },
    });
    await tick();
    expect(container.querySelector('.skeleton')?.classList.contains('shimmer')).toBe(false);
    off.unmount();

    render(Skeleton, { target: container, props: { shimmer: true } });
    await tick();
    expect(container.querySelector('.skeleton')?.classList.contains('shimmer')).toBe(true);
  });

  it('marks itself aria-hidden so assistive tech ignores the placeholder', async () => {
    render(Skeleton, { target: container });
    await tick();

    const el = container.querySelector('.skeleton');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
  });
});
