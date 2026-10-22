/** How wide the laptop sidebar is. Dragged by the person, kept on this device. */
export const SIDE_MIN = 190
export const SIDE_MAX = 440
const KEY = 'stb-side-width'

export const clampSide = (px: number): number => Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(px)))

/** Put a width on the page (the layout reads it as the --side variable). */
export const setSideWidth = (px: number | null) => {
  if (px === null) document.documentElement.style.removeProperty('--side')
  else document.documentElement.style.setProperty('--side', `${clampSide(px)}px`)
}

/** The width the person chose last time, or null for the default. */
export function savedSideWidth(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? clampSide(v) : null
  } catch {
    return null
  }
}

export function saveSideWidth(px: number | null) {
  try {
    if (px === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(clampSide(px)))
  } catch {
    /* the width just does not stick */
  }
}

/** Apply the saved width right away at start-up, so the page does not jump when the app appears. */
export function applySavedSideWidth() {
  const w = savedSideWidth()
  if (w !== null) setSideWidth(w)
}
