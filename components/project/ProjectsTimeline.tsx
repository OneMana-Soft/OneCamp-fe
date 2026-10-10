"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { startOfDay } from "date-fns"
import { TimelineHeader } from "@/components/project/timeline/TimelineHeader"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useStoredState } from "@/hooks/useStoredState"
import { useTimelineView } from "@/hooks/useTimelineView"
import { healthOf } from "@/lib/projectUpdates"
import { progressOf, type ProjectOverview } from "@/lib/projectsOverview"
import { DAY_WIDTH, ZOOMS, barBox, offsetOf, spanLabel, spanOf, timelineRange, type Zoom } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { app_project_path } from "@/types/paths"

const ROW_HEIGHT = 40
const isZoom = (v: unknown): v is Zoom => ZOOMS.some((z) => z.value === v)
const timelineOf = (p: ProjectOverview) => `${app_project_path}/${p.project_uuid}?tab=timeline`

/**
 * Every project as one bar across the days its tasks run, filled as far as
 * its tasks are done and coloured by how its people last said it was going
 * (Asana keeps this portfolio timeline for its top plans). A bar opens the
 * project's own timeline. The projects come sorted and filtered as the
 * overview's table has them.
 */
export function ProjectsTimeline({ projects, compact = false }: { projects: ProjectOverview[]; compact?: boolean }) {
  const [zoom, setZoom, zoomReady] = useStoredState<Zoom>("oc_projects_timeline_zoom", "week", isZoom)
  const [today] = useState(() => startOfDay(new Date()))
  const nameWidth = compact ? 136 : 240
  const dayWidth = DAY_WIDTH[zoom]
  const rows = useMemo(() => projects.map((p) => ({ p, span: spanOf({ task_start_date: p.first_day, task_due_date: p.last_day }) })), [projects])
  const spans = useMemo(() => rows.flatMap((r) => (r.span ? [r.span] : [])), [rows])
  const range = useMemo(() => timelineRange(spans, today, zoom), [spans, today, zoom])
  const gridWidth = range.days * dayWidth
  const scrollRef = useRef<HTMLDivElement>(null)
  const { onScroll, goToday } = useTimelineView({ scrollRef, range, dayWidth, nameWidth, spans, today, ready: zoomReady })
  const todayLeft = offsetOf(today, range, dayWidth)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
          Today
        </Button>
        <ToggleGroup type="single" size="sm" value={zoom} onValueChange={(v) => isZoom(v) && setZoom(v)} aria-label="Zoom" className="rounded-md border p-0.5">
          {ZOOMS.map((z) => (
            <ToggleGroupItem key={z.value} value={z.value} className="h-7 px-2.5 text-xs">
              {z.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="relative min-h-[16rem] flex-1 overflow-hidden rounded-lg border bg-background">
        <div ref={scrollRef} role="region" aria-label="Projects on a timeline" className="h-full overflow-auto overscroll-x-contain" onScroll={onScroll}>
          <TimelineHeader range={range} zoom={zoom} dayWidth={dayWidth} today={today} nameWidth={nameWidth} nameLabel="Project" />
          <div className="relative" style={{ width: nameWidth + gridWidth, height: rows.length * ROW_HEIGHT }}>
            <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: nameWidth, width: gridWidth }}>
              {todayLeft >= 0 && todayLeft < gridWidth && (
                <div className="absolute inset-y-0 w-px bg-primary" style={{ left: todayLeft + dayWidth / 2 }} />
              )}
            </div>
            {rows.map(({ p, span }, i) => {
              const health = p.health ? healthOf(p.health) : null
              const pct = Math.round(progressOf(p) * 100)
              const box = span ? barBox(span, range, dayWidth) : null
              const label = [p.project_name, span ? spanLabel(span, today) : "no dated tasks yet", `${pct}% done`, health?.label].filter(Boolean).join(", ")
              return (
                <div key={p.project_uuid} className={cn(HUE_CLASS[hueFor(p.project_uuid)], "group absolute left-0 flex border-b border-border/50")} style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT, width: nameWidth + gridWidth }}>
                  <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3 group-hover:bg-muted" style={{ width: nameWidth }}>
                    <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", health?.dot ?? "bg-muted-foreground/40")} />
                    <Link href={timelineOf(p)} tabIndex={-1} className="truncate text-sm hover:underline" title={p.project_name}>
                      {p.project_name}
                    </Link>
                  </div>
                  <div className="relative" style={{ width: gridWidth }}>
                    {box ? (
                      <>
                        <Link
                          href={timelineOf(p)}
                          aria-label={label}
                          title={label}
                          className="absolute top-3 h-4 overflow-hidden rounded-sm bg-hue-tint ring-1 ring-inset ring-hue/30 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          style={{ left: box.left, width: box.width }}
                        >
                          {/* The project's own colour, as on its board and its
                              timeline: its tint for the span, its strong cut for
                              how much is done. Progress is not the accent's job
                              (DESIGN.md), and health has the dot by the name.
                              Finished reads in the success token. */}
                          <span aria-hidden className={cn("block h-full", pct === 100 ? "bg-success" : "bg-hue")} style={{ width: `${pct}%` }} />
                        </Link>
                        <span aria-hidden className="pointer-events-none absolute top-3 flex h-4 items-center text-xs tabular-nums text-muted-foreground" style={{ left: box.left + box.width + 6 }}>
                          {pct}%
                        </span>
                      </>
                    ) : (
                      <span className="sticky inline-flex h-full items-center px-2 text-xs text-muted-foreground" style={{ left: nameWidth + 4 }}>
                        No dated tasks yet
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
