import { describe, it, expect } from 'vitest';
import { priorityLabels } from './priorities';

describe('priorityLabels', () => {
  it('has exactly three priority keys', () => {
    expect(Object.keys(priorityLabels)).toHaveLength(3);
  });

  it('contains the expected priority keys', () => {
    expect(priorityLabels).toHaveProperty('important-urgent');
    expect(priorityLabels).toHaveProperty('not-important-urgent');
    expect(priorityLabels).toHaveProperty('important-not-urgent');
  });

  it('maps important-urgent to I&U', () => {
    expect(priorityLabels['important-urgent']).toBe('I&U');
  });

  it('maps not-important-urgent to nI&U', () => {
    expect(priorityLabels['not-important-urgent']).toBe('nI&U');
  });

  it('maps important-not-urgent to I&nU', () => {
    expect(priorityLabels['important-not-urgent']).toBe('I&nU');
  });

  it('has non-empty labels for all priorities', () => {
    for (const [key, label] of Object.entries(priorityLabels)) {
      expect(label, `label for "${key}" should be non-empty`).toBeTruthy();
    }
  });
});
