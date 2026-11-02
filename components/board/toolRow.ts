"use client"

import * as React from "react"

import { PHONE_TOOL_ROW } from "./excalidrawPart"

/**
 * Marks the canvas's phone tool row under ref as a strip that scrolls
 * sideways (data-edge-fade, app/interaction.css's one rule for every strip):
 * its edge fades while there is more past it, and a scrolled row rests on a
 * whole tool. At 44px a tool the row is wider than a phone's screen, so it
 * scrolls (excalidrawTheme.css), or Insert image, Eraser and More tools sit
 * past the edge out of a finger's reach. The row is the canvas's own and
 * drawn again as the canvas likes, so it is marked whenever it appears. Every
 * board draws through boardExcalidraw (the board page, a guest's viewer and
 * both call stages), which holds the one call.
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
