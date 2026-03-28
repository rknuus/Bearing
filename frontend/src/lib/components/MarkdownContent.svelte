<script lang="ts">
  import { renderMarkdown, renderRestrictedMarkdown } from '../utils/markdown';

  interface Props {
    content: string;
    restricted?: boolean;
  }

  let { content, restricted = false }: Props = $props();

  let html = $derived(restricted ? renderRestrictedMarkdown(content) : renderMarkdown(content));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
<div class="markdown-content">{@html html}</div>

<style>
  .markdown-content {
    line-height: 1.5;
    color: var(--color-gray-700);
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 0.5rem 0 0.25rem;
    color: var(--color-gray-900);
    line-height: 1.3;
  }
  .markdown-content :global(h1) { font-size: 1.25rem; }
  .markdown-content :global(h2) { font-size: 1.125rem; }
  .markdown-content :global(h3) { font-size: 1rem; }
  .markdown-content :global(h4) { font-size: 0.875rem; }

  .markdown-content :global(p) {
    margin: 0 0 0.5rem;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0 0 0.5rem;
    padding-left: 1.5rem;
  }

  .markdown-content :global(li) {
    margin-bottom: 0.125rem;
  }

  .markdown-content :global(a) {
    color: var(--color-primary-500);
    text-decoration: underline;
    cursor: pointer;
  }
  .markdown-content :global(a:hover) {
    color: var(--color-primary-600);
  }

  .markdown-content :global(blockquote) {
    margin: 0.5rem 0;
    padding: 0.25rem 0.75rem;
    border-left: 3px solid var(--color-primary-200);
    color: var(--color-gray-600);
    font-style: italic;
  }

  .markdown-content :global(code) {
    background-color: var(--color-gray-100);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-size: 0.8125rem;
  }

  .markdown-content :global(pre) {
    background-color: var(--color-gray-50);
    padding: 0.5rem;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .markdown-content :global(pre code) {
    background-color: transparent;
    padding: 0;
  }

  .markdown-content :global(strong) {
    font-weight: 600;
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-gray-200);
    margin: 0.75rem 0;
  }
</style>
