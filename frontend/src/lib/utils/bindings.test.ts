import { describe, it, expect, afterEach } from 'vitest';
import { getBindings, extractError } from './bindings';
import { mockAppBindings } from '../wails-mock';

describe('getBindings', () => {
  afterEach(() => {
    // Clean up any window.go modifications
    delete window.go;
  });

  it('returns mockAppBindings when window.go is not set', () => {
    delete window.go;
    const bindings = getBindings();
    expect(bindings).toBe(mockAppBindings);
  });

  it('returns mockAppBindings when window.go.main is not set', () => {
    window.go = {};
    const bindings = getBindings();
    expect(bindings).toBe(mockAppBindings);
  });

  it('returns mockAppBindings when window.go.main.App is not set', () => {
    window.go = { main: {} };
    const bindings = getBindings();
    expect(bindings).toBe(mockAppBindings);
  });

  it('returns window.go.main.App when set', () => {
    window.go = { main: { App: mockAppBindings } };
    const bindings = getBindings();
    expect(bindings).toBe(mockAppBindings);
  });

  it('returns an object with expected binding methods', () => {
    const bindings = getBindings();
    expect(typeof bindings.GetHierarchy).toBe('function');
    expect(typeof bindings.GetTasks).toBe('function');
    expect(typeof bindings.CreateTask).toBe('function');
    expect(typeof bindings.Greet).toBe('function');
    expect(typeof bindings.GetLocale).toBe('function');
    expect(typeof bindings.GetBoardConfiguration).toBe('function');
    expect(typeof bindings.LoadNavigationContext).toBe('function');
    expect(typeof bindings.SaveNavigationContext).toBe('function');
  });
});

describe('extractError', () => {
  it('extracts message from Error object', () => {
    expect(extractError(new Error('something failed'))).toBe('something failed');
  });

  it('returns string errors directly', () => {
    expect(extractError('plain string error')).toBe('plain string error');
  });

  it('converts non-string, non-Error values via String()', () => {
    expect(extractError(42)).toBe('42');
    expect(extractError(null)).toBe('null');
    expect(extractError(undefined)).toBe('undefined');
    expect(extractError(true)).toBe('true');
  });

  it('handles objects by converting to string', () => {
    expect(extractError({ key: 'value' })).toBe('[object Object]');
  });
});
