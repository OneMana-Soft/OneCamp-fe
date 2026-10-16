"use client"

import * as React from "react"

import { pickFitting, roomFor } from "@/lib/fitLabel"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A label that says as much as its row has room for. `options` are the same
 * thing said longest first ("12 – 18 Oct 2026", "12 – 18 Oct", "12–18 Oct"),
 * and it shows the first one that fits beside the rest of its row, so a
 * title drops its year before it ever ends in "…". Only the last option can
 * truncate. The row is the label's parent: its inner width, less its other
 * children and gaps, is the room. Hidden copies of every option measure
 * them in the label's own font.
 */
export function FitLabel({ options, className, ...props }: { options: readonly string[] } & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const probes = React.useRef<HTMLSpanElement>(null)
  const [index, setIndex] = React.useState(0)
  const key = options.join("\u0000")

  React.useLayoutEffect(() => {
    const label = ref.current
    const row = label?.parentElement
    if (!label || !row) return
    const measure = () => {
      const widths = Array.from(probes.current?.children ?? []).map((c) => c.getBoundingClientRect().width)
      const style = getComputedStyle(row)
      const others: number[] = []
      for (const child of Array.from(row.children)) {
        if (child === label) continue
        const s = getComputedStyle(child)
        if (s.position === "absolute" || s.position === "fixed" || s.display === "none") continue
        others.push(child.getBoundingClientRect().width + (parseFloat(s.marginLeft) || 0) + (parseFloat(s.marginRight) || 0))
      }
      const inner = row.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      setIndex(pickFitting(widths, roomFor({ inner, others, gap: parseFloat(style.columnGap) || 0 })))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    // The row resizing, or a neighbour growing (a loading dot, a wider
    // button), both change the room.
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    for (const child of Array.from(row.children)) if (child !== label) ro.observe(child)
    return () => ro.disconnect()
  }, [key])

  const shown = options[Math.min(index, options.length - 1)] ?? ""
  return (
    <span ref={ref} data-fit-label="" title={shown !== options[0] ? options[0] : undefined} className={cn("relative min-w-0 truncate", className)} {...props}>
      {shown === options[0] ? (
        shown
      ) : (
        // Read out whole whatever the width; the shortened copy is for eyes.
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="sr-only">{options[0]}</span>
        </>
      )}
      <span ref={probes} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex flex-col items-start whitespace-nowrap">
        {options.map((o, i) => (
          <span key={i}>{o}</span>
        ))}
      </span>
    </span>
  )
}
