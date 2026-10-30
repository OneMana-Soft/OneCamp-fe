"use client"

import * as React from "react"

/**
 * How many of a line's items fit whole, in order, in `room` px: each item's
 * width with a gap between them, and when some are left out, room for the
 * "+N" chip that counts them (`more`). At least one: a first item wider than
 * the room is shown anyway, and cuts itself. Pure.
 */
export function fitCount(widths: number[], room: number, { gap = 4, more = 32 }: { gap?: number; more?: number } = {}): number {
  let used = 0
  for (let i = 0; i < widths.length; i++) {
    const next = used + (i > 0 ? gap : 0) + widths[i]
    const after = i < widths.length - 1 ? gap + more : 0
    if (next + after > room) return Math.max(1, i)
    used = next
  }
  return widths.length
}

/**
 * fitCount for a line drawn in `ref`: its items are the children marked
 * data-fit-item, measured as they are drawn, and `reserve` px at the line's
 * end stay free (a button after them). When the items change (`key`) all are
 * drawn once, before paint, to be measured; a change of the line's width
 * counts again from those widths. A line not laid out (no width) shows all.
 */
export function useFitCount(
  ref: React.RefObject<HTMLElement | null>,
  count: number,
  key: string,
  { gap = 4, more = 32, reserve = 0 }: { gap?: number; more?: number; reserve?: number } = {},
): number {
  const [state, setState] = React.useState({ key, fit: count })
  const widths = React.useRef<number[]>([])
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const items = el.querySelectorAll<HTMLElement>("[data-fit-item]")
      if (items.length === count) widths.current = Array.from(items, (item) => item.offsetWidth)
      if (widths.current.length !== count || !el.clientWidth) return
      const fit = fitCount(widths.current, el.clientWidth - reserve, { gap, more })
      setState((s) => (s.key === key && s.fit === fit ? s : { key, fit }))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref, count, key, gap, more, reserve])
  // New items are all drawn first, so each can be measured.
  return state.key === key ? Math.min(state.fit, count) : count
}
