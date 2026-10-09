"use client"

import { memo, useMemo } from "react"
import { headerTicks, offsetOf, type Range, type Zoom } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"

export const HEADER_HEIGHT = 52

/**
 * The timeline's header: months over days, months over weeks, or years over
 * months, with today marked. It sticks to the top as the rows scroll, and a
 * month's name sticks to the left while any of the month is in view.
 */
export const TimelineHeader = memo(function TimelineHeader({
  range,
  zoom,
  dayWidth,
  today,
  nameWidth,
  nameLabel = "Task",
}: {
  range: Range
  zoom: Zoom
  dayWidth: number
  today: Date
  nameWidth: number
  /** What the rows are: tasks, or projects. */
  nameLabel?: string
}) {
  const { top, bottom } = useMemo(() => headerTicks(range, zoom, dayWidth), [range, zoom, dayWidth])
  const todayLeft = offsetOf(today, range, dayWidth)
  const todayKey = zoom === "day" ? today.toISOString() : ""
  return (
    <div className="sticky top-0 z-20 flex border-b bg-background" style={{ height: HEADER_HEIGHT, width: nameWidth + range.days * dayWidth }}>
      <div
        className="sticky left-0 z-30 flex shrink-0 items-end border-r bg-background px-3 pb-1.5 text-xs font-medium text-muted-foreground"
        style={{ width: nameWidth }}
      >
        {nameLabel}
      </div>
      <div className="relative" style={{ width: range.days * dayWidth }} aria-hidden>
        {top.map((t) => (
          <div key={t.key} className="absolute top-0 h-6 border-l border-border/70" style={{ left: t.left, width: t.width }}>
            {t.width >= 36 && (
              <span className="sticky inline-block truncate px-2 text-xs font-medium leading-6 text-foreground" style={{ left: nameWidth, maxWidth: t.width }}>
                {t.label}
              </span>
            )}
          </div>
        ))}
        {bottom.map((t) => (
          <div
            key={t.key}
            className={cn(
              "absolute bottom-0 flex h-7 items-center overflow-hidden text-2xs text-muted-foreground",
              zoom === "day" ? "justify-center" : "border-l border-border/50 px-1.5",
            )}
            style={{ left: t.left, width: t.width }}
          >
            {zoom === "day" ? (
              <span className={cn("flex h-6 min-w-6 flex-col items-center justify-center rounded-md leading-none tabular-nums", t.key === todayKey && "bg-primary font-semibold text-primary-foreground")}>
                <span className="text-2xs uppercase opacity-80">{t.sub}</span>
                <span>{t.label}</span>
              </span>
            ) : (
              t.width >= 30 && <span className="truncate tabular-nums">{t.label}</span>
            )}
          </div>
        ))}
        {zoom !== "day" && todayLeft >= 0 && todayLeft < range.days * dayWidth && (
          <span
            className="absolute bottom-0 h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary"
            style={{ left: todayLeft + dayWidth / 2 }}
          />
        )}
      </div>
    </div>
  )
})
