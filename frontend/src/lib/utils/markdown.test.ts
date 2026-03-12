import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('wraps plain text in <p> tags', () => {
    expect(renderMarkdown('hello')).toBe('<p>hello</p>\n');
  });

  it('renders bold text', () => {
    expect(renderMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>\n');
  });

  it('renders italic text', () => {
    expect(renderMarkdown('*italic*')).toBe('<p><em>italic</em></p>\n');
  });

  it('renders headings', () => {
    expect(renderMarkdown('# Heading')).toBe('<h1>Heading</h1>\n');
  });

  it('renders unordered lists', () => {
    const result = renderMarkdown('- item');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item</li>');
    expect(result).toContain('</ul>');
  });

  it('renders links', () => {
    const result = renderMarkdown('[link](http://example.com)');
    expect(result).toContain('<a href="http://example.com">link</a>');
  });

  it('renders blockquotes', () => {
    const result = renderMarkdown('> quote');
    expect(result).toContain('<blockquote>');
    expect(result).toContain('<p>quote</p>');
    expect(result).toContain('</blockquote>');
  });

  it('preserves line breaks', () => {
    const result = renderMarkdown('line1\nline2');
    expect(result).toContain('<br');
  });

  it('strips <script> tags (XSS)', () => {
    const result = renderMarkdown("<script>alert('xss')</script>");
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
  });

  it('strips event handlers from tags (XSS)', () => {
    const result = renderMarkdown('<img onerror="alert(\'xss\')" src="x">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('sanitizes javascript: URLs (XSS)', () => {
    const result = renderMarkdown("[click](javascript:alert('xss'))");
    expect(result).not.toContain('javascript:');
  });
});
