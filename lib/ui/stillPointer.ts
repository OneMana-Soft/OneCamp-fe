import type { PointerEvent as Ev, PointerEventHandler as On } from "react"

// Chrome sends a resting mouse's element unmoved pointer events as the page shifts under it (menuStillPointer.test).
let last: { x: number; y: number } | null = null
let move: Event | null = null
let moved = true
if (typeof document !== "undefined")
  document.addEventListener("pointermove", (e) => {
    moved = last?.x !== e.clientX || last?.y !== e.clientY
    last = { x: e.clientX, y: e.clientY }
    move = e
  }, true)

const still = (e: PointerEvent) => (e.type === "pointermove" ? e === move && !moved : last?.x === e.clientX && last?.y === e.clientY)
const guard = <T>(own?: On<T>) => (e: Ev<T>) => {
  own?.(e)
  if (still(e.nativeEvent)) e.preventDefault()
}

/** A menu row's pointer handlers, the caller's first; Radix skips a still pointer's (defaultPrevented). */
export const movingPointerOnly = <T extends Element>(p: { onPointerLeave?: On<T>; onPointerMove?: On<T> }) => ({
  onPointerLeave: guard(p.onPointerLeave),
  onPointerMove: guard(p.onPointerMove),
})
