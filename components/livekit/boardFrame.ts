"use client"

// A board's frame on the call's stage. It loads with the board stages, never
// with a call page's first screen (app/firstLoad's route ceilings).

import * as React from "react"
import { PHONE_TOOL_ROW } from "@/components/board/excalidrawPart"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A board on the call's stage: a column (on a phone, its pills' row, then the
 * canvas), with an edge on the call's dark. The edge is drawn over the canvas,
 * not under it: an inset ring on the frame itself was painted over by the
 * canvas, so the board had no edge in dark (DESIGN-BUILD-23).
 */
export const STAGE_BOARD_FRAME =
  "relative flex h-full w-full flex-col overflow-hidden rounded-[14px] bg-sheet after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/[0.14] after:content-['']"

/**
 * Where a board's pills sit on the stage: over its top corners, or, while
 * its own tools take that row (useBoardCompact, as on a phone), in a row of
 * their own above it.
 */
export function boardBarClass(compact: boolean, extra = ""): string {
  return compact
    ? cn("relative z-10 flex shrink-0 flex-wrap items-center gap-1.5 p-2 pb-0", extra)
    : cn("pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start gap-2", extra)
}

/**
 * Whether the board in a frame this size is laid out as on a phone: the
 * canvas's own rule (Excalidraw's isMobileBreakpoint), under which its tools
 * take the board's top row, so the call's pills can't float there. An
 * unmeasured frame is not. Pure.
 */
export function boardIsCompact(width: number, height: number): boolean {
  return width > 0 && (width < 730 || (height < 500 && width < 1000))
}

/** boardIsCompact for the frame at ref, kept current as it resizes. */
export function useBoardCompact(ref: React.RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = React.useState(false)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      setCompact(boardIsCompact(r.width, r.height))
    }
    read()
    if (typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return compact
}


/**
 * Marks the canvas's phone tool row in the frame at ref as a strip that
 * scrolls sideways (data-edge-fade, app/interaction.css's one rule for every
 * strip): its edge fades while there is more past it, and a scrolled row
 * rests on a whole tool. The row is the canvas's own and drawn again as the
 * canvas likes, so it is marked whenever it appears.
 */
export function useToolRowEdgeFade(ref: React.RefObject<HTMLElement | null>): void {
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const mark = () => {
      for (const row of el.querySelectorAll(`${PHONE_TOOL_ROW}:not([data-edge-fade])`)) row.setAttribute("data-edge-fade", "")
    }
    mark()
    if (typeof MutationObserver === "undefined") return
    const watch = new MutationObserver(mark)
    watch.observe(el, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [ref])
}

