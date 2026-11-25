import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ThemeContext, type ThemePreference } from './ThemeContext'

// Must match the inline script in index.html that applies the theme before first paint.
const STORAGE_KEY = 'stockpilot.theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function subscribeToSystem(callback: () => void) {
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const systemDark = useSyncExternalStore(subscribeToSystem, () => media.matches)
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference: (next: ThemePreference) => {
        setPreferenceState(next)
        try {
          if (next === 'system') localStorage.removeItem(STORAGE_KEY)
          else localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Ignore unavailable storage.
        }
      },
    }),
    [preference, resolved],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
