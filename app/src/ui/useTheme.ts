import { useCallback, useState } from 'react'

export type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'dark')
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t
    try {
      localStorage.setItem('stb-theme', t)
    } catch {
      /* storage can be blocked */
    }
    setThemeState(t)
  }, [])
  const toggle = useCallback(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'), [setTheme])
  return { theme, setTheme, toggle }
}
