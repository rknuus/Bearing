import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWindowShortcut, detectPlatform } from './window-commands';

function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  const defaults = {
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    key: '',
    preventDefault: vi.fn(),
  };
  return { ...defaults, ...overrides } as unknown as KeyboardEvent;
}

describe('detectPlatform', () => {
  it('returns macos for Mac platform', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    expect(detectPlatform()).toBe('macos');
  });

  it('returns windows for Win platform', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    expect(detectPlatform()).toBe('windows');
  });

  it('returns linux for Linux platform', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64', configurable: true });
    expect(detectPlatform()).toBe('linux');
  });
});

describe('handleWindowShortcut', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    window.runtime = {
      WindowSetSize: vi.fn(),
      WindowSetPosition: vi.fn(),
      WindowCenter: vi.fn(),
      WindowToggleMaximise: vi.fn(),
      WindowFullscreen: vi.fn(),
      WindowUnfullscreen: vi.fn(),
      WindowIsFullscreen: vi.fn().mockResolvedValue(false),
      WindowIsMaximised: vi.fn().mockResolvedValue(false),
      ScreenGetAll: vi.fn().mockResolvedValue([
        { isCurrent: true, isPrimary: true, width: 1920, height: 1080 },
      ]),
      WindowSetTitle: vi.fn(),
      Quit: vi.fn(),
      WindowMaximise: vi.fn(),
      WindowUnmaximise: vi.fn(),
    } as unknown as typeof window.runtime;
  });

  it('handles Ctrl+Option+Left for snap left', () => {
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowLeft' });
    expect(handleWindowShortcut(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handles Ctrl+Option+Right for snap right', () => {
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowRight' });
    expect(handleWindowShortcut(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handles Ctrl+Option+Up for maximize toggle', () => {
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowUp' });
    expect(handleWindowShortcut(event)).toBe(true);
    expect(window.runtime!.WindowToggleMaximise).toHaveBeenCalled();
  });

  it('handles Ctrl+Cmd+F for fullscreen toggle', () => {
    const event = makeKeyEvent({ ctrlKey: true, metaKey: true, key: 'f' });
    expect(handleWindowShortcut(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handles Ctrl+Option+C for center', () => {
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'c' });
    expect(handleWindowShortcut(event)).toBe(true);
    expect(window.runtime!.WindowCenter).toHaveBeenCalled();
  });

  it('returns false for unrelated key events', () => {
    const event = makeKeyEvent({ key: 'a' });
    expect(handleWindowShortcut(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('returns false for partial modifier match', () => {
    const event = makeKeyEvent({ ctrlKey: true, key: 'ArrowLeft' });
    expect(handleWindowShortcut(event)).toBe(false);
  });

  it('snap left calculates half-screen dimensions', async () => {
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowLeft' });
    handleWindowShortcut(event);
    // Wait for async ScreenGetAll to resolve
    await vi.waitFor(() => {
      expect(window.runtime!.WindowSetSize).toHaveBeenCalledWith(960, 1080);
      expect(window.runtime!.WindowSetPosition).toHaveBeenCalledWith(0, 0);
    });
  });

  it('snap right positions at right edge', async () => {
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowRight' });
    handleWindowShortcut(event);
    await vi.waitFor(() => {
      expect(window.runtime!.WindowSetSize).toHaveBeenCalledWith(960, 1080);
      expect(window.runtime!.WindowSetPosition).toHaveBeenCalledWith(960, 0);
    });
  });

  it('snap enforces minimum width', async () => {
    (window.runtime!.ScreenGetAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      { isCurrent: true, isPrimary: true, width: 1200, height: 900 },
    ]);
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowLeft' });
    handleWindowShortcut(event);
    await vi.waitFor(() => {
      // 1200/2 = 600, but minimum is 800
      expect(window.runtime!.WindowSetSize).toHaveBeenCalledWith(800, 900);
    });
  });

  it('does not throw when window.runtime is undefined', () => {
    window.runtime = undefined;
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowLeft' });
    expect(() => handleWindowShortcut(event)).not.toThrow();
    expect(handleWindowShortcut(event)).toBe(true);
  });

  it('returns no shortcuts on non-macOS platforms', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const event = makeKeyEvent({ ctrlKey: true, altKey: true, key: 'ArrowLeft' });
    expect(handleWindowShortcut(event)).toBe(false);
  });
});
