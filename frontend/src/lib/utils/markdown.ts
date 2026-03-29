import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(source: string): string {
  if (!source) return '';
  const html = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

/**
 * Render markdown in restricted mode — only bold and lists are rendered.
 * Used for suggestion cards where full markdown would be too rich.
 */
export function renderRestrictedMarkdown(source: string): string {
  if (!source) return '';
  const html = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'ul', 'ol', 'li', 'p', 'br'],
    ALLOWED_ATTR: [],
  });
}

/**
 * Render inline markdown — only inline formatting is allowed.
 * Used for task titles where block-level elements would be inappropriate.
 */
export function renderInlineMarkdown(source: string): string {
  if (!source) return '';
  const html = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'em', 'code', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href'],
  });
}
