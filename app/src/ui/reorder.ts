/** The small calculations behind dragging a row to a new place. Kept apart from the screen so they can be tested. */

export interface Slot {
  top: number
  height: number
}

/** Where a dragged row would land. Rows above its centre count; the dragged row is skipped. */
export function landingIndex(slots: Slot[], from: number, dy: number): number {
  const me = slots[from]
  const centre = me.top + me.height / 2 + dy
  let n = 0
  slots.forEach((s, i) => {
    if (i !== from && s.top + s.height / 2 < centre) n++
  })
  return n
}

/** How far a row that is not being dragged slides to make room (positive: down). */
export function shiftFor(i: number, from: number, to: number, step: number): number {
  if (i === from) return 0
  if (from < i && i <= to) return -step
  if (to <= i && i < from) return step
  return 0
}

/** The keys with one of them moved to a new position. */
export function moveKey(keys: string[], key: string, to: number): string[] {
  const out = keys.filter((k) => k !== key)
  out.splice(Math.max(0, Math.min(to, out.length)), 0, key)
  return out
}

/** A horizontal drag is a swipe, not a scroll, when it goes sideways clearly further than up or down. */
export const isSwipe = (dx: number, dy: number) => Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3

/**
 * Apply a new order for only some rows (a filtered list) to the full order: the rows keep the places the filtered rows
 * occupied, and everything not shown stays where it was.
 */
export function reorderSubset(full: string[], subsetNew: string[]): string[] {
  const shown = new Set(subsetNew)
  let next = 0
  return full.map((k) => (shown.has(k) ? subsetNew[next++] : k))
}
