const STORAGE_KEY = 'emerge-theme'
export type Theme = 'light' | 'dark'

/** Get current theme from localStorage, default to light */
export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'light'
}

/** Set theme and apply to document */
export function setTheme(theme: Theme) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, theme)
  document.documentElement.setAttribute('data-theme', theme)
  // Update meta theme-color for mobile browsers
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0D1A0B' : '#F5F2EC')
}

/** Toggle between light and dark */
export function toggleTheme(): Theme {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/** Apply saved theme on page load (call in layout) */
export function initTheme() {
  setTheme(getTheme())
}

/** Map tile URL for current theme */
export function getMapTileUrl(): string {
  return getTheme() === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
}
