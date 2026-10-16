/**
 * WHEN A PRESS BECOMES A DRAG (INTERACTION_SPEC.md §5.1, §2.5, D11), for
 * every drag: a mouse or pen lifts once it has travelled 5px; a finger lifts
 * once it has been held 250ms without straying more than 8px, and a finger
 * that strays further before then is scrolling, not dragging. A press that
 * never lifts is a click. lib/ui/dnd.ts sets its sensors from these numbers;
 * custom engines (the calendar's) read them here. No @dnd-kit import, so a
 * custom engine pulls nothing in with it.
 */
export const PRESS_LIFT = { travel: 5, hold: 250, slop: 8 } as const

export interface Press {
  /** Where the press went down. */
  x: number
  y: number
  /** A finger (pointerType "touch"). */
  touch: boolean
  /** A finger held for PRESS_LIFT.hold: the engine's timer says so. */
  held: boolean
}

/** What a press is once its pointer is at (x, y): still a press, a drag, or (a finger) a scroll. Pure. */
export function pressBecomes(press: Press, x: number, y: number): "press" | "drag" | "scroll" {
  const travelled = Math.hypot(x - press.x, y - press.y)
  if (!press.touch) return travelled >= PRESS_LIFT.travel ? "drag" : "press"
  if (press.held) return "drag"
  return travelled > PRESS_LIFT.slop ? "scroll" : "press"
}

/**
 * While a lifted drag holds the pointer: the page doesn't scroll under a
 * finger (its touchmoves are taken, so the browser doesn't take the pointer
 * back either), and no context menu opens (a held finger on Android, a
 * right-click). Returns the function that lets go.
 */
export function holdLifted(): () => void {
  const still = (e: Event) => {
    if (e.cancelable) e.preventDefault()
  }
  const noMenu = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener("touchmove", still, { passive: false, capture: true })
  window.addEventListener("contextmenu", noMenu, true)
  return () => {
    window.removeEventListener("touchmove", still, true)
    window.removeEventListener("contextmenu", noMenu, true)
  }
}
