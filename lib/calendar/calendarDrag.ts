/**
 * The calendar's direct manipulation, as arithmetic (content.md C13): every
 * drag snaps to 15 minutes. Creating draws from the press to the pointer,
 * floored at the top and rounded up at the bottom, so a drag from 10:00 to
 * 11:10 makes 10:00 to 11:15; moving shifts by whole snaps; resizing moves one
 * edge, never past the other. Pure.
 */
export const SNAP_MINUTES = 15
export const DAY_MINUTES = 24 * 60
/** A plain click on an empty slot makes this long a draft. */
export const DEFAULT_DRAFT_MINUTES = 30

export const floorSnap = (m: number) => Math.floor(m / SNAP_MINUTES) * SNAP_MINUTES
export const ceilSnap = (m: number) => Math.ceil(m / SNAP_MINUTES) * SNAP_MINUTES
export const roundSnap = (m: number) => Math.round(m / SNAP_MINUTES) * SNAP_MINUTES
const clamp = (m: number) => Math.max(0, Math.min(DAY_MINUTES, m))

/** Minutes from the grid's top for a y offset, at an hour height. */
export function minutesAt(y: number, hourHeight: number): number {
  return clamp((y / hourHeight) * 60)
}

/** The range a create drag covers, from the press to the pointer. */
export function createRange(pressMin: number, pointerMin: number): { startMin: number; endMin: number } {
  const lo = Math.min(pressMin, pointerMin)
  const hi = Math.max(pressMin, pointerMin)
  const startMin = clamp(floorSnap(lo))
  const endMin = clamp(Math.max(ceilSnap(hi), startMin + SNAP_MINUTES))
  return { startMin, endMin }
}

/** A click (no drag): a draft of the default length from the slot's snap. */
export function clickRange(pressMin: number, minutes = DEFAULT_DRAFT_MINUTES): { startMin: number; endMin: number } {
  const startMin = Math.min(floorSnap(pressMin), DAY_MINUTES - minutes)
  return { startMin, endMin: startMin + minutes }
}

/** A move by the pointer's travel, in whole snaps, kept inside the day. */
export function moveRange(startMin: number, endMin: number, deltaMin: number): { startMin: number; endMin: number } {
  const len = endMin - startMin
  const s = Math.max(0, Math.min(DAY_MINUTES - len, startMin + roundSnap(deltaMin)))
  return { startMin: s, endMin: s + len }
}

/** One edge moved to the pointer, snapped, keeping at least one snap. */
export function resizeRange(startMin: number, endMin: number, edge: "top" | "bottom", pointerMin: number): { startMin: number; endMin: number } {
  if (edge === "top") return { startMin: clamp(Math.min(roundSnap(pointerMin), endMin - SNAP_MINUTES)), endMin }
  return { startMin, endMin: clamp(Math.max(roundSnap(pointerMin), startMin + SNAP_MINUTES)) }
}

/** "45 min", "1 h", "1 h 30". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m}` : `${h} h`
}

/** A date for a day plus minutes from its midnight. */
export function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60)
}
