"use client"

// The installation's health as a ring (design v3, admin A21, mock M8): the
// owned ProgressRing at 6px, filled moss to the healthy share over a full
// ring of what needs attention (sun when only features are flagged, danger
// when a service this install needs is down). A new result crossfades in
// over the old one: two stacked rings, opacity 300ms. The ring's dash never
// animates here (app/motionCost.test.ts).

import { useEffect, useRef, useState } from "react"
import { ProgressRing } from "@/components/ui/graphics"
import { cn } from "@/lib/utils/helpers/cn"

/** The healthy share, 0 to 1. Pure. */
export function healthShare(healthy: number, total: number): number {
  if (!total || total < 0) return 0
  return Math.max(0, Math.min(1, healthy / total))
}

type Layer = { key: number; share: number; rest: "danger" | "sun" }

export function HealthRing({
  healthy,
  total,
  rest,
  size = 72,
}: {
  healthy: number
  total: number
  /** The remainder's colour. */
  rest: "danger" | "sun"
  size?: number
}) {
  const share = healthShare(healthy, total)
  const next = useRef(0)
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: 0, share, rest }])

  useEffect(() => {
    setLayers((cur) => {
      const top = cur[cur.length - 1]
      if (top && top.share === share && top.rest === rest) return cur
      next.current += 1
      return [...cur.slice(-1), { key: next.current, share, rest }]
    })
  }, [share, rest])

  return (
    <span
      data-health-ring=""
      data-share={share}
      className="cfg-ring"
      style={{ width: size, height: size }}
    >
      {layers.map((l, i) => {
        const gone = i < layers.length - 1
        return (
          <span
            key={l.key}
            data-ring-layer=""
            data-gone={gone ? "true" : undefined}
            data-fresh={!gone && l.key > 0 ? "true" : undefined}
            aria-hidden={gone || undefined}
            className="relative inline-grid"
            onTransitionEnd={() => gone && setLayers((cur) => cur.filter((x) => x.key !== l.key))}
          >
            {l.share < 1 && (
              <span aria-hidden="true" className={cn("col-start-1 row-start-1", l.rest === "danger" ? "cfg-ring-rest-danger" : "cfg-ring-rest-sun")}>
                <ProgressRing value={100} size={size} weight={6} label="Needs attention" />
              </span>
            )}
            <span className="cfg-ring-health col-start-1 row-start-1">
              <ProgressRing value={l.share * 100} size={size} weight={6} label={`${healthy} of ${total} healthy`} />
            </span>
          </span>
        )
      })}
      <span className="relative col-start-1 row-start-1 text-title-2 font-semibold tabular-nums text-foreground">
        {healthy}/{total}
      </span>
    </span>
  )
}
