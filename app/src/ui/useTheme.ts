import { useCallback, useState } from 'react'

export type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'dark')
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t
    // the browser bar and the installed app's top edge follow the page color
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#000000' : '#ffffff')
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
