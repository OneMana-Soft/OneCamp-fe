"use client"

// useBoardView: where an Excalidraw board is looking, kept current through
// pans and zooms. Read once a frame and only re-rendered when it moved, so
// overlays (comment pins, vote dots) stay anchored without flooding React.

import { useEffect, useState } from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import type { BoardView } from "@/lib/board/viewport"

export function useBoardView(api: ExcalidrawImperativeAPI | null): BoardView | null {
  const [view, setView] = useState<BoardView | null>(null)
  useEffect(() => {
    if (!api) return
    let raf = 0
    let prev = ""
    const tick = () => {
      const s = api.getAppState()
      const key = `${s.scrollX},${s.scrollY},${s.zoom.value},${s.width},${s.height},${s.offsetLeft},${s.offsetTop}`
      if (key !== prev) {
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
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [api])
  return view
}
