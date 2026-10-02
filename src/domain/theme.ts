export const THEME_STORAGE_KEY = 'repartidor-padel-theme-v1'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export function readThemePreference(value: string | null): ThemePreference {
  if (value === 'light' || value === 'dark') return value
  return 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

export function toggleTheme(currentlyDark: boolean): Exclude<ThemePreference, 'system'> {
  return currentlyDark ? 'light' : 'dark'
}
