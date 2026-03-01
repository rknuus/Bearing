import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockAppBindings } from './wails-mock';

describe('LogFrontend', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls console.error for error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAppBindings.LogFrontend('error', 'something broke', 'App.svelte');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[error] something broke (App.svelte)');
  });

  it('calls console.warn for warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockAppBindings.LogFrontend('warn', 'something suspicious', 'TaskView.svelte');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[warn] something suspicious (TaskView.svelte)');
  });

  it('calls console.log for info level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockAppBindings.LogFrontend('info', 'page loaded', 'main.ts');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[info] page loaded (main.ts)');
  });

  it('calls console.log for unknown level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockAppBindings.LogFrontend('debug', 'trace data', 'utils.ts');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[debug] trace data (utils.ts)');
  });
});
