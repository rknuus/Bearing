import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkEntity, checkFullState } from './state-check';

describe('checkEntity', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('emits nothing when fields match', () => {
    checkEntity('task', 'T-1', { title: 'A', priority: 'high' }, { title: 'A', priority: 'high' }, ['title', 'priority']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns per differing field with [state-check] prefix', () => {
    checkEntity('task', 'T-1', { title: 'A', priority: 'high' }, { title: 'B', priority: 'high' }, ['title', 'priority']);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('[state-check]');
    expect(warnSpy.mock.calls[0][0]).toContain('task T-1');
    expect(warnSpy.mock.calls[0][0]).toContain('title');
  });

  it('handles deep equality via JSON.stringify', () => {
    checkEntity('task', 'T-2', { tags: ['a', 'b'] }, { tags: ['a', 'b'] }, ['tags']);
    expect(warnSpy).not.toHaveBeenCalled();

    checkEntity('task', 'T-2', { tags: ['a', 'b'] }, { tags: ['a', 'c'] }, ['tags']);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe('checkFullState', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('emits nothing when lists match', async () => {
    const list = [{ id: '1', title: 'A' }, { id: '2', title: 'B' }];
    await checkFullState('task', list, async () => [...list], 'id', ['title']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns on differing field', async () => {
    const frontend = [{ id: '1', title: 'A' }];
    const backend = [{ id: '1', title: 'B' }];
    await checkFullState('task', frontend, async () => backend, 'id', ['title']);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('[state-check]');
  });

  it('warns on entity missing from backend', async () => {
    const frontend = [{ id: '1', title: 'A' }];
    await checkFullState('task', frontend, async () => [], 'id', ['title']);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('exists in frontend but not backend');
  });

  it('warns on entity missing from frontend', async () => {
    const backend = [{ id: '1', title: 'A' }];
    await checkFullState('task', [], async () => backend, 'id', ['title']);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('exists in backend but not frontend');
  });
});
