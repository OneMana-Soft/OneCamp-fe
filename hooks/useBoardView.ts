"use client"

// useBoardView: where an Excalidraw board is looking, for overlays drawn over
// it (comment pins, vote dots) and for following a presenter.
//
// It follows the board's own scroll and change events, and reads them at
// most once a frame. It used to poll every frame for as long as the board was
// open, two loops of it (comments and facilitation each had one), and set
// state on every frame of a pan, which rendered both overlays again 60 times
// a second whether or not they had anything to draw. A consumer that has
// nothing to place (no comments, no vote running) passes enabled=false and
// does no work at all.

import { useEffect, useState } from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import type { BoardView } from "@/lib/board/viewport"

type ViewSource = Pick<ExcalidrawImperativeAPI, "getAppState" | "onScrollChange" | "onChange">

export function useBoardView(api: ViewSource | null, enabled = true): BoardView | null {
  const [view, setView] = useState<BoardView | null>(null)
  useEffect(() => {
    if (!api || !enabled) return
    let frame = 0
    let prev = ""
    const read = () => {
      frame = 0
      const s = api.getAppState()
      const key = `${s.scrollX},${s.scrollY},${s.zoom.value},${s.width},${s.height},${s.offsetLeft},${s.offsetTop}`
      if (key === prev) return
      prev = key
      setView({
        scrollX: s.scrollX,
        scrollY: s.scrollY,
        zoom: s.zoom.value,
        width: s.width,
        height: s.height,
        offsetLeft: s.offsetLeft,
        offsetTop: s.offsetTop,
      })
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    // Pans and zooms; and any other change, for a resize of the canvas.
    const offScroll = api.onScrollChange(soon)
    const offChange = api.onChange(soon)
    return () => {
      offScroll()
      offChange()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [api, enabled])
  return enabled ? view : null
}
