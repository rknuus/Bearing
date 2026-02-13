import type { LifeTheme } from '../wails-mock';

/** Find a theme by ID from the given themes array. */
export function getTheme(themes: LifeTheme[], themeId?: string): LifeTheme | undefined {
  return themeId ? themes.find((t) => t.id === themeId) : undefined;
}

/** Get a theme's color by ID, with a gray fallback for unknown themes. */
export function getThemeColor(themes: LifeTheme[], themeId?: string): string {
  return getTheme(themes, themeId)?.color ?? '#6b7280';
}
