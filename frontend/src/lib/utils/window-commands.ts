/**
 * Window management keyboard shortcuts.
 *
 * Calls Wails v2 JS runtime APIs for window snapping, maximize, fullscreen, and centering.
 * Shortcut mappings are per-OS; currently only macOS is implemented.
 *
 * macOS shortcuts:
 *   Ctrl+Option+Left  — Snap window to left half
 *   Ctrl+Option+Right — Snap window to right half
 *   Ctrl+Option+Up    — Toggle maximize
 *   Ctrl+Cmd+F        — Toggle fullscreen
 *   Ctrl+Option+C     — Center window
 */

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

type Platform = 'macos' | 'windows' | 'linux';

interface WindowShortcut {
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
  action: () => void | Promise<void>;
}

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'macos';
  const p = navigator.platform?.toLowerCase() ?? '';
  if (p.includes('mac')) return 'macos';
  if (p.includes('win')) return 'windows';
  return 'linux';
}

function getRuntime(): typeof window.runtime | undefined {
  return typeof window !== 'undefined' ? window.runtime : undefined;
}

async function snapLeft() {
  const rt = getRuntime();
  if (!rt?.ScreenGetAll || !rt.WindowSetSize || !rt.WindowSetPosition) return;
  const screens = await rt.ScreenGetAll();
  const screen = screens.find(s => s.isCurrent) ?? screens[0];
  if (!screen) return;
  const w = Math.max(Math.floor(screen.width / 2), MIN_WIDTH);
  const h = Math.max(screen.height, MIN_HEIGHT);
  rt.WindowSetSize(w, h);
  rt.WindowSetPosition(0, 0);
}

async function snapRight() {
  const rt = getRuntime();
  if (!rt?.ScreenGetAll || !rt.WindowSetSize || !rt.WindowSetPosition) return;
  const screens = await rt.ScreenGetAll();
  const screen = screens.find(s => s.isCurrent) ?? screens[0];
  if (!screen) return;
  const w = Math.max(Math.floor(screen.width / 2), MIN_WIDTH);
  const h = Math.max(screen.height, MIN_HEIGHT);
  rt.WindowSetSize(w, h);
  rt.WindowSetPosition(screen.width - w, 0);
}

function toggleMaximize() {
  const rt = getRuntime();
  rt?.WindowToggleMaximise?.();
}

async function toggleFullscreen() {
  const rt = getRuntime();
  if (!rt?.WindowIsFullscreen) return;
  const isFs = await rt.WindowIsFullscreen();
  if (isFs) {
    rt.WindowUnfullscreen?.();
  } else {
    rt.WindowFullscreen?.();
  }
}

function center() {
  const rt = getRuntime();
  rt?.WindowCenter?.();
}

function getMacShortcuts(): WindowShortcut[] {
  return [
    { ctrl: true, alt: true, meta: false, key: 'ArrowLeft', action: snapLeft },
    { ctrl: true, alt: true, meta: false, key: 'ArrowRight', action: snapRight },
    { ctrl: true, alt: true, meta: false, key: 'ArrowUp', action: toggleMaximize },
    { ctrl: true, alt: false, meta: true, key: 'f', action: toggleFullscreen },
    { ctrl: true, alt: true, meta: false, key: 'c', action: center },
  ];
}

function getShortcuts(platform: Platform): WindowShortcut[] {
  switch (platform) {
    case 'macos':
      return getMacShortcuts();
    default:
      // Windows/Linux shortcuts not yet implemented
      return [];
  }
}

/**
 * Handle a keydown event for window management shortcuts.
 * Returns true if the event was handled (caller should skip further processing).
 */
export function handleWindowShortcut(event: KeyboardEvent): boolean {
  const platform = detectPlatform();
  const shortcuts = getShortcuts(platform);

  for (const s of shortcuts) {
    if (
      event.ctrlKey === s.ctrl &&
      event.altKey === s.alt &&
      event.metaKey === s.meta &&
      event.key === s.key
    ) {
      event.preventDefault();
      s.action();
      return true;
    }
  }

  return false;
}
