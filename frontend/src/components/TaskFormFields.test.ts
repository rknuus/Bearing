import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { fireEvent } from '@testing-library/dom';
import TaskFormFields from './TaskFormFields.svelte';

describe('TaskFormFields', () => {
  let container: HTMLDivElement;

  const themes = [
    { id: 'HF', name: 'Health', color: '#22c55e', objectives: [] },
    { id: 'CG', name: 'Career', color: '#3b82f6', objectives: [] },
  ];

  function defaultProps() {
    return {
      title: '',
      themeId: 'HF',
      description: '',
      themes,
    };
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders title, theme, and description fields', () => {
    render(TaskFormFields, { target: container, props: defaultProps() });

    expect(container.querySelector('input[id$="title"]')).toBeTruthy();
    expect(container.querySelector('select[id$="theme"]')).toBeTruthy();
    expect(container.querySelector('textarea[id$="description"]')).toBeTruthy();
  });

  it('applies idPrefix to all field ids', () => {
    render(TaskFormFields, { target: container, props: { ...defaultProps(), idPrefix: 'test' } });

    expect(container.querySelector('#test-title')).toBeTruthy();
    expect(container.querySelector('#test-theme')).toBeTruthy();
    expect(container.querySelector('#test-description')).toBeTruthy();
  });

  it('populates theme select with provided themes', () => {
    render(TaskFormFields, { target: container, props: defaultProps() });

    const select = container.querySelector<HTMLSelectElement>('select[id$="theme"]');
    const options = select!.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toBe('Health');
    expect(options[1].textContent).toBe('Career');
  });

  it('disables all fields when disabled prop is true', async () => {
    render(TaskFormFields, { target: container, props: { ...defaultProps(), disabled: true } });
    await tick();

    const titleInput = container.querySelector<HTMLInputElement>('input[id$="title"]');
    const themeSelect = container.querySelector<HTMLSelectElement>('select[id$="theme"]');
    const descTextarea = container.querySelector<HTMLTextAreaElement>('textarea[id$="description"]');
    expect(titleInput!.disabled).toBe(true);
    expect(themeSelect!.disabled).toBe(true);
    expect(descTextarea!.disabled).toBe(true);
  });

  it('does not render a tag input (tags handled externally)', () => {
    render(TaskFormFields, { target: container, props: defaultProps() });

    expect(container.querySelector('input[id$="tags"]')).toBeNull();
  });

  it('does not focus title input when focusTrigger is 0', async () => {
    render(TaskFormFields, { target: container, props: { ...defaultProps(), focusTrigger: 0 } });
    await tick();

    const titleInput = container.querySelector<HTMLInputElement>('input[id$="title"]');
    expect(document.activeElement).not.toBe(titleInput);
  });

  it('focuses title input when focusTrigger is greater than 0', async () => {
    render(TaskFormFields, { target: container, props: { ...defaultProps(), focusTrigger: 1 } });
    await tick();

    const titleInput = container.querySelector<HTMLInputElement>('input[id$="title"]');
    expect(document.activeElement).toBe(titleInput);
  });

  it('refocuses title input when focusTrigger increments', async () => {
    const result = render(TaskFormFields, { target: container, props: { ...defaultProps(), focusTrigger: 1 } });
    await tick();

    // Focus something else
    const desc = container.querySelector<HTMLTextAreaElement>('textarea[id$="description"]');
    desc!.focus();
    expect(document.activeElement).toBe(desc);

    // Increment focusTrigger
    result.rerender({ ...defaultProps(), focusTrigger: 2 });
    await tick();

    const titleInput = container.querySelector<HTMLInputElement>('input[id$="title"]');
    expect(document.activeElement).toBe(titleInput);
  });

  it('renders Markdown and Preview toggle buttons', () => {
    render(TaskFormFields, { target: container, props: defaultProps() });

    const buttons = container.querySelectorAll<HTMLButtonElement>('.mode-tab');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe('Markdown');
    expect(buttons[1].textContent).toBe('Preview');
  });

  it('has Markdown tab active by default', () => {
    render(TaskFormFields, { target: container, props: defaultProps() });

    const buttons = container.querySelectorAll<HTMLButtonElement>('.mode-tab');
    expect(buttons[0].classList.contains('active')).toBe(true);
    expect(buttons[1].classList.contains('active')).toBe(false);
  });

  it('switches to preview mode and shows rendered content', async () => {
    render(TaskFormFields, {
      target: container,
      props: { ...defaultProps(), title: '**bold title**', description: '# Heading\nSome text' },
    });

    const previewBtn = container.querySelectorAll<HTMLButtonElement>('.mode-tab')[1];
    await fireEvent.click(previewBtn);
    await tick();

    // Input and textarea should be gone
    expect(container.querySelector('input[id$="title"]')).toBeNull();
    expect(container.querySelector('textarea[id$="description"]')).toBeNull();

    // Preview divs should be present with rendered markdown
    const titlePreview = container.querySelector('.preview-title');
    expect(titlePreview).toBeTruthy();
    expect(titlePreview!.innerHTML).toContain('<strong>bold title</strong>');

    const descPreview = container.querySelector('.preview-description');
    expect(descPreview).toBeTruthy();
    expect(descPreview!.innerHTML).toContain('<h1>Heading</h1>');
    expect(descPreview!.innerHTML).toContain('Some text');

    // Theme select is still visible
    expect(container.querySelector('select[id$="theme"]')).toBeTruthy();
  });

  it('returns to edit mode when clicking Markdown tab', async () => {
    render(TaskFormFields, {
      target: container,
      props: { ...defaultProps(), title: 'Test', description: 'Desc' },
    });

    // Switch to preview
    const previewBtn = container.querySelectorAll<HTMLButtonElement>('.mode-tab')[1];
    await fireEvent.click(previewBtn);
    await tick();
    expect(container.querySelector('input[id$="title"]')).toBeNull();

    // Switch back to markdown
    const markdownBtn = container.querySelectorAll<HTMLButtonElement>('.mode-tab')[0];
    await fireEvent.click(markdownBtn);
    await tick();
    expect(container.querySelector('input[id$="title"]')).toBeTruthy();
    expect(container.querySelector('textarea[id$="description"]')).toBeTruthy();
  });

  it('resets preview mode when focusTrigger changes', async () => {
    const result = render(TaskFormFields, {
      target: container,
      props: { ...defaultProps(), title: 'Test', focusTrigger: 1 },
    });
    await tick();

    // Switch to preview
    const previewBtn = container.querySelectorAll<HTMLButtonElement>('.mode-tab')[1];
    await fireEvent.click(previewBtn);
    await tick();
    expect(container.querySelector('input[id$="title"]')).toBeNull();

    // Change focusTrigger to reset preview mode
    result.rerender({ ...defaultProps(), title: 'Test', focusTrigger: 2 });
    await tick();

    // Should be back in edit mode
    expect(container.querySelector('input[id$="title"]')).toBeTruthy();
    expect(container.querySelector('textarea[id$="description"]')).toBeTruthy();

    // Markdown tab should be active again
    const buttons = container.querySelectorAll<HTMLButtonElement>('.mode-tab');
    expect(buttons[0].classList.contains('active')).toBe(true);
    expect(buttons[1].classList.contains('active')).toBe(false);
  });

  it('shows placeholder text for empty content in preview mode', async () => {
    render(TaskFormFields, {
      target: container,
      props: { ...defaultProps(), title: '', description: '' },
    });

    const previewBtn = container.querySelectorAll<HTMLButtonElement>('.mode-tab')[1];
    await fireEvent.click(previewBtn);
    await tick();

    const placeholders = container.querySelectorAll('.preview-placeholder');
    expect(placeholders.length).toBe(2);
    expect(placeholders[0].textContent).toBe('No title');
    expect(placeholders[1].textContent).toBe('No description');
  });
});
