"use client"

import * as React from "react"

/**
 * How many of a row's give-way steps it needs to be drawn whole: each step draws one of its parts in a
 * shorter form, in the row's own order (the compact facilitation bar's: lib/board/facilitation's
 * giveWaySteps). The row (`row`) scrolls rather than cut a word: its parts never shrink below their
 * words, so a row short of room is wider inside than out, and takes the next step, up to `max`.
 *
 * Measured as it is drawn, before paint, as useFitCount is: when the parts change (`key`) they are drawn
 * whole first and stepped down from there. When the room changes width (`room`: a box as wide as the
 * row may be), or fonts arrive, it counts again from the whole forms. With no steps, the row is whole.
 */
export function useGiveWay(row: React.RefObject<HTMLElement | null>, room: HTMLElement | null, max: number, key: string): number {
  const [state, setState] = React.useState({ key, steps: 0, count: 0 })
  const steps = state.key === key ? Math.min(state.steps, max) : 0
  React.useLayoutEffect(() => {
    const el = row.current
    if (el && steps < max && el.scrollWidth > el.clientWidth + 0.5) setState({ key, steps: steps + 1, count: state.count })
    else if (state.key !== key) setState({ key, steps, count: state.count })
  }, [row, key, max, steps, state.key, state.count])
  React.useEffect(() => {
    const again = () => setState((s) => ({ key: s.key, steps: 0, count: s.count + 1 }))
    let width = room?.clientWidth
    const watch =
      room && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            // Its first report is the width it was found at.
            if (room.clientWidth === width) return
            width = room.clientWidth
            again()
          })
        : null
    watch?.observe(room!)
    const fonts = typeof document !== "undefined" && "fonts" in document ? document.fonts : null
    fonts?.addEventListener("loadingdone", again)
    return () => {
      watch?.disconnect()
      fonts?.removeEventListener("loadingdone", again)
    }
  }, [room])
  return steps
}
