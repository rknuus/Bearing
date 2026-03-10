import { describe, it, expect } from 'vitest';
import { getObjectiveStatus } from './okr-status';

describe('getObjectiveStatus', () => {
  it('returns no-status for negative progress (no tracked KRs)', () => {
    expect(getObjectiveStatus(-1)).toBe('no-status');
  });

  it('returns off-track for progress 0', () => {
    expect(getObjectiveStatus(0)).toBe('off-track');
  });

  it('returns off-track for progress 32', () => {
    expect(getObjectiveStatus(32)).toBe('off-track');
  });

  it('returns needs-attention for progress 33', () => {
    expect(getObjectiveStatus(33)).toBe('needs-attention');
  });

  it('returns needs-attention for progress 65', () => {
    expect(getObjectiveStatus(65)).toBe('needs-attention');
  });

  it('returns on-track for progress 66', () => {
    expect(getObjectiveStatus(66)).toBe('on-track');
  });

  it('returns on-track for progress 100', () => {
    expect(getObjectiveStatus(100)).toBe('on-track');
  });
});
