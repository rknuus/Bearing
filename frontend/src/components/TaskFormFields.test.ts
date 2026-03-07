import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
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

  it('does not render promotion date when not provided', () => {
    render(TaskFormFields, { target: container, props: defaultProps() });

    expect(container.querySelector('input[id$="promotion-date"]')).toBeNull();
  });

  it('renders promotion date when provided', () => {
    render(TaskFormFields, { target: container, props: { ...defaultProps(), promotionDate: '2026-03-01' } });

    const dateInput = container.querySelector<HTMLInputElement>('input[id$="promotion-date"]');
    expect(dateInput).toBeTruthy();
    expect(dateInput!.value).toBe('2026-03-01');
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
});
