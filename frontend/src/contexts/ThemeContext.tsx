/**
 * Theme context — persists dark/light mode preference in localStorage.
 * Consumed by main.tsx to build the MUI theme and by TopBar for the toggle button.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ThemeMode = 'dark' | 'light'

interface ThemeContextValue {
  mode:        ThemeMode
  toggleTheme: () => void
}

const ThemeCtx = createContext<ThemeContextValue>({
  mode:        'dark',
  toggleTheme: () => {},
})

export function ThemeContextProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('tradingos-theme')
    return (saved === 'light' || saved === 'dark') ? saved : 'dark'
  })

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('tradingos-theme', next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ mode, toggleTheme }), [mode, toggleTheme])

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export const useThemeMode = () => useContext(ThemeCtx)
