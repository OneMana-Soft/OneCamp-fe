"use client"

import * as React from "react"

/** How far a cut-off edge fades, in px. */
const FADE = 24

/** The mask that fades the edges with more past them; undefined when neither has. Pure. */
export function edgeMask(start: boolean, end: boolean): string | undefined {
  if (!start && !end) return undefined
  const from = start ? `transparent, black ${FADE}px` : "black"
  const to = end ? `black calc(100% - ${FADE}px), transparent` : "black"
  return `linear-gradient(to right, ${from}, ${to})`
}

/**
 * Fades the edges of a row that scrolls sideways where there is more past
 * them, so a cut-off tab or chip reads as more to scroll to rather than a
 * clipped word ("Due d", "Reports" cut at the screen's edge). Spread the
 * props on the element that scrolls; `shape` is what its contents say, so the
 * edges are measured again when they change.
 */
export function useEdgeFade<T extends HTMLElement>(ref: React.RefObject<T | null>, shape?: unknown): { "data-fade"?: string; style?: React.CSSProperties } {
  const [edges, setEdges] = React.useState({ start: false, end: false })

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const start = el.scrollLeft > 1
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }))
    }
    measure()
    el.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", measure)
      ro?.disconnect()
    }
  }, [ref, shape])

  const mask = edgeMask(edges.start, edges.end)
  if (!mask) return {}
  return {
    "data-fade": [edges.start && "start", edges.end && "end"].filter(Boolean).join(" "),
    style: { maskImage: mask, WebkitMaskImage: mask },
  }
}
