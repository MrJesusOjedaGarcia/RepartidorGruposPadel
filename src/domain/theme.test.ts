import { describe, expect, it } from 'vitest'
import { readThemePreference, resolveTheme, toggleTheme } from './theme'

describe('theme preference', () => {
  it('defaults to the system theme and follows its color scheme', () => {
    const preference = readThemePreference(null)
    expect(preference).toBe('system')
    expect(resolveTheme(preference, true)).toBe('dark')
    expect(resolveTheme(preference, false)).toBe('light')
  })

  it('uses a saved light or dark choice regardless of system preference', () => {
    expect(resolveTheme(readThemePreference('dark'), false)).toBe('dark')
    expect(resolveTheme(readThemePreference('light'), true)).toBe('light')
  })

  it('falls back to system for unknown stored values and toggles the resolved theme', () => {
    expect(readThemePreference('sepia')).toBe('system')
    expect(toggleTheme(false)).toBe('dark')
    expect(toggleTheme(true)).toBe('light')
  })
})
