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
  const gridWidth = range.days * dayWidth
  const todayShown = todayLeft >= 0 && todayLeft < gridWidth
  return (
    <div
      data-timeline-header=""
      className="sticky top-0 z-20 flex border-b border-line bg-sheet"
      style={{ height: HEADER_HEIGHT, width: nameWidth + gridWidth }}
    >
      <div
        data-name-column=""
        className="sticky left-0 z-30 flex shrink-0 items-end bg-sheet px-5 pb-2 text-xs font-[510] border-r border-line text-ink-3"
        style={{ width: nameWidth }}
      >
        {nameLabel}
      </div>
      <div className="relative" style={{ width: gridWidth }} aria-hidden>
        {top.map((t) => (
          <div key={t.key} className="absolute top-0 h-6" style={{ left: t.left, width: t.width }}>
            {t.width >= 36 && (
              <span className="sticky inline-block truncate px-2 text-xs font-[510] leading-6 text-ink-2" style={{ left: nameWidth, maxWidth: t.width }}>
                {t.label}
              </span>
            )}
          </div>
        ))}
        {bottom.map((t) => {
          const isToday = zoom === "day" && t.key === todayKey
          return (
            <div
              key={t.key}
              className={cn("absolute bottom-0 flex h-7 items-center overflow-hidden text-xs tabular-nums text-ink-3", zoom === "day" ? "justify-center" : "px-1.5")}
              style={{ left: t.left, width: t.width }}
            >
              {zoom === "day" ? (
                // Today is a brand ring round its number (design v3): one
                // "today" language with the line below it, never a filled disc.
                <span
                  data-today={isToday || undefined}
                  className={cn("flex size-5 items-center justify-center rounded-full leading-none", isToday && "font-[510] text-foreground")}
                  style={isToday ? { boxShadow: "inset 0 0 0 1.5px var(--brand)" } : undefined}
                >
                  {t.label}
                </span>
              ) : (
                t.width >= 30 && <span className="truncate">{t.label}</span>
              )}
            </div>
          )
        })}
        {todayShown && (
          <span
            data-today-pill=""
            className="absolute top-1 z-10 flex h-4 -translate-x-1/2 items-center rounded-md bg-brand px-1.5 text-3xs font-[590] leading-none text-brand-foreground shadow-e1"
            style={{ left: todayLeft + dayWidth / 2 }}
          >
            Today
          </span>
        )}
        {todayShown && <span className="absolute bottom-0 h-1.5 w-[1.5px] -translate-x-1/2 bg-brand" style={{ left: todayLeft + dayWidth / 2 }} />}
      </div>
    </div>
  )
})
