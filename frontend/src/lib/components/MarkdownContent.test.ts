import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import MarkdownContent from './MarkdownContent.svelte';

describe('MarkdownContent', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderMarkdown(props: { content: string; restricted?: boolean }) {
    const result = render(MarkdownContent, { target: container, props });
    await tick();
    return result;
  }

  it('renders bold text', async () => {
    await renderMarkdown({ content: '**bold text**' });
    const el = container.querySelector('.markdown-content');
    expect(el?.innerHTML).toContain('<strong>bold text</strong>');
  });

  it('renders italic text', async () => {
    await renderMarkdown({ content: '*italic text*' });
    const el = container.querySelector('.markdown-content');
    expect(el?.innerHTML).toContain('<em>italic text</em>');
  });

  it('renders h2 headings', async () => {
    await renderMarkdown({ content: '## Heading Two' });
    const h2 = container.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2?.textContent).toBe('Heading Two');
  });

  it('renders h3 headings', async () => {
    await renderMarkdown({ content: '### Heading Three' });
    const h3 = container.querySelector('h3');
    expect(h3).toBeTruthy();
    expect(h3?.textContent).toBe('Heading Three');
  });

  it('renders unordered lists', async () => {
    await renderMarkdown({ content: '- item one\n- item two' });
    const ul = container.querySelector('ul');
    expect(ul).toBeTruthy();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('item one');
    expect(items[1].textContent).toBe('item two');
  });

  it('renders ordered lists', async () => {
    await renderMarkdown({ content: '1. first\n2. second' });
    const ol = container.querySelector('ol');
    expect(ol).toBeTruthy();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('first');
  });

  it('renders code blocks', async () => {
    await renderMarkdown({ content: '```\nconst x = 1;\n```' });
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    const code = pre?.querySelector('code');
    expect(code).toBeTruthy();
    expect(code?.textContent).toContain('const x = 1;');
  });

  it('renders inline code', async () => {
    await renderMarkdown({ content: 'Use `console.log` here' });
    const code = container.querySelector('code');
    expect(code).toBeTruthy();
    expect(code?.textContent).toBe('console.log');
  });

  it('renders blockquotes', async () => {
    await renderMarkdown({ content: '> This is a quote' });
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeTruthy();
    expect(blockquote?.textContent).toContain('This is a quote');
  });

  it('strips script tags (XSS)', async () => {
    await renderMarkdown({ content: "<script>alert('xss')</script>" });
    const el = container.querySelector('.markdown-content');
    expect(el?.innerHTML).not.toContain('<script');
    expect(el?.innerHTML).not.toContain('alert');
  });

  it('strips event handlers (XSS)', async () => {
    await renderMarkdown({ content: '<img onerror="alert(\'xss\')" src="x">' });
    const el = container.querySelector('.markdown-content');
    expect(el?.innerHTML).not.toContain('onerror');
    expect(el?.innerHTML).not.toContain('alert');
  });

  it('renders only bold and lists in restricted mode', async () => {
    await renderMarkdown({
      content: '## Heading\n\n**bold** and *italic*\n\n- list item\n\n> quote\n\n`code`',
      restricted: true,
    });
    const el = container.querySelector('.markdown-content');
    // Bold should be preserved
    expect(el?.innerHTML).toContain('<strong>bold</strong>');
    // Lists should be preserved
    expect(el?.querySelector('ul')).toBeTruthy();
    expect(el?.querySelector('li')).toBeTruthy();
    // Headings, blockquotes, and code should be stripped
    expect(el?.querySelector('h2')).toBeNull();
    expect(el?.querySelector('blockquote')).toBeNull();
    expect(el?.querySelector('code')).toBeNull();
    // Italic (em) should be stripped
    expect(el?.querySelector('em')).toBeNull();
  });

  it('renders empty content as empty', async () => {
    await renderMarkdown({ content: '' });
    const el = container.querySelector('.markdown-content');
    expect(el).toBeTruthy();
    expect(el?.innerHTML).toBe('');
  });
});
