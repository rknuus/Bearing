import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(source: string): string {
  if (!source) return '';
  const html = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
