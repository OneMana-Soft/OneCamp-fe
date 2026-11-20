// A row drawn or moved under a resting pointer gets the browser's hover update: an arrival (pointerover,
// pointerenter) at the place the pointer already was, with no move. A row that lights on a pointer asks
// isStillArrival first. Its own module, apart from the app layout's scrollState, so its listener ships and runs only
// where a hover-lit row loads it. It is the rule lib/ui/stillPointer.ts keeps for the menus (an event at the place the
// pointer already was is no move), kept apart on purpose: importing that module from the task list re-split the app
// layout (27 -> 28 chunks, +1,432 B shipped on 68 routes, 14 Nov). stillArrival.test.ts runs the same events through both.

/** Where the pointer's last move (or press) left it, in the viewport; null till one is seen. */
let pointerAt: { x: number; y: number } | null = null
/** Where the pointer was before its latest move, and that move: for isStillMove, read in the move's own handlers. */
let movedFrom: { x: number; y: number } | null = null
let latestMove: unknown = null
let watching = false

/** Starts the pointer-place watch, once, in the capture phase: before any row's own handler sees the move. */
function watch(): void {
  if (watching || typeof window === "undefined") return
  watching = true
  const at = (e: PointerEvent) => {
    if (e.type === "pointermove") {
      movedFrom = pointerAt
      latestMove = e
    }
    pointerAt = { x: e.clientX, y: e.clientY }
  }
  window.addEventListener("pointermove", at, { capture: true, passive: true })
  window.addEventListener("pointerdown", at, { capture: true, passive: true })
}
watch()

/** A pointer event's kind and place, as a DOM event or React's carries them. */
export type PointerPlace = { type: string; clientX: number; clientY: number }

const ARRIVAL = /^(pointer|mouse)(over|enter)$/

/**
 * Whether a pointer's arrival comes where the pointer already was: the page drew or scrolled something under a
 * resting pointer (a scroll's update comes in its frame before the scroll event, so the scroll watch can miss it).
 * A real move's pointermove follows its arrival, so an arrival within a pixel of the last move's place, or before
 * any move is seen, is not pointing.
 */
export function isStillArrival(e: PointerPlace): boolean {
  watch()
  if (!ARRIVAL.test(e.type)) return false
  return pointerAt === null || within(pointerAt, e)
}

/**
 * Whether a pointermove comes where the pointer already was: the page scrolled or drew under a resting pointer and
 * the browser told it as a move. A hand's move lands a pixel or more away; so does the first move seen. It takes the
 * native event the window saw: a React event is never that one, and for it the answer would always be "still".
 */
export function isStillMove(e: PointerEvent): boolean {
  watch()
  if (e.type !== "pointermove") return false
  const from = e === latestMove ? movedFrom : pointerAt
  return from !== null && within(from, e)
}

const within = (at: { x: number; y: number }, e: PointerPlace) => Math.abs(at.x - e.clientX) < 1 && Math.abs(at.y - e.clientY) < 1
