"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { startOfDay } from "date-fns"
import { TimelineHeader } from "@/components/project/timeline/TimelineHeader"
import { ZoomSwitch } from "@/components/project/timeline/ZoomSwitch"
import { Button } from "@/components/ui/button"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { useGrow } from "@/hooks/useGrow"
import { useStoredState } from "@/hooks/useStoredState"
import { useTimelineView } from "@/hooks/useTimelineView"
import { healthOf } from "@/lib/projectUpdates"
import { progressOf, type ProjectOverview } from "@/lib/projectsOverview"
import { DAY_WIDTH, ZOOMS, barBox, offsetOf, spanLabel, spanOf, timelineRange, type Zoom } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { app_project_path } from "@/types/paths"
import { workToolbar } from "@/components/task/workFrame"
import type { ReactNode } from "react"
import { useProjectHues } from "@/lib/projectHue"
import dynamic from "next/dynamic"
import { shortDate } from "@/lib/utils/date/dateWords"
import { dayDate } from "@/lib/utils/timeZone"
import type { Milestone } from "@/lib/work/milestones"

// The diamonds come in a chunk of their own: the overview's first load carries only their days.
const MilestoneMarks = dynamic(() => import("@/components/work/milestones/MilestoneMarks").then((m) => m.MilestoneMarks), { ssr: false })

const ROW_HEIGHT = 44
const isZoom = (v: unknown): v is Zoom => ZOOMS.some((z) => z.value === v)
const timelineOf = (p: ProjectOverview) => `${app_project_path}/${p.project_uuid}?tab=timeline`

/**
 * Every project as one bar across the days its tasks run (design v3, work.md
 * W40): the one place bars are saturated, each in its project's gradient
 * (a2 to a1) with its name in white on the a2 end, and how much is done as a darker band
 * from the left. A bar opens the project's own timeline. The projects come
 * sorted and filtered as the overview's table has them. Each project's
 * milestones with a target day sit on its row as diamonds (linear-16), once
 * they're read after the list (milestones, by project id in lower case).
 */
export function ProjectsTimeline({
  projects,
  compact = false,
  tools,
  milestones,
}: {
  projects: ProjectOverview[]
  compact?: boolean
  tools?: ReactNode
  milestones?: Map<string, Milestone[]>
}) {
  const [zoom, setZoom, zoomReady] = useStoredState<Zoom>("oc_projects_timeline_zoom", "week", isZoom)
  const projectHues = useProjectHues()
  const [today] = useState(() => startOfDay(new Date()))
  const nameWidth = compact ? 140 : 260
  const dayWidth = DAY_WIDTH[zoom]
  const rows = useMemo(() => projects.map((p) => ({ p, span: spanOf({ task_start_date: p.first_day, task_due_date: p.last_day }) })), [projects])
  const spans = useMemo(() => rows.flatMap((r) => (r.span ? [r.span] : [])), [rows])
  // Each row's milestones with a target day: a diamond each. The grid reaches them too.
  const targets = useMemo(() => {
    const out = new Map<string, { m: Milestone; day: Date }[]>()
    for (const { p } of rows) {
      const list = (milestones?.get(p.project_uuid.toLowerCase()) ?? []).flatMap((m) => {
        const day = dayDate(m.target_date)
        return day ? [{ m, day }] : []
      })
      if (list.length > 0) out.set(p.project_uuid, list)
    }
    return out
  }, [rows, milestones])
  const range = useMemo(() => {
    const days = [...targets.values()].flat().map(({ day }) => ({ start: day, end: day }))
    return timelineRange(days.length > 0 ? [...spans, ...days] : spans, today, zoom)
  }, [spans, targets, today, zoom])
  const gridWidth = range.days * dayWidth
  const scrollRef = useRef<HTMLDivElement>(null)
  const { onScroll, goToday, scrollerRef } = useTimelineView({ scrollRef, range, dayWidth, nameWidth, spans, today, ready: zoomReady })
  const todayLeft = offsetOf(today, range, dayWidth)
  const grow = useGrow("projects-timeline", zoomReady && rows.length > 0)

  return (
    // The overview's frame (components/task/workFrame): its search, filter and
    // sort start this row, and the chart sits under it on the sheet, unboxed.
    <div data-timeline="" className="flex min-h-0 flex-1 flex-col">
      <div data-work-toolbar="" className={cn(workToolbar, compact && "-mx-4")}>
        {tools}
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-ink-2 hover:text-foreground" onClick={goToday}>
          Today
        </Button>
        <ZoomSwitch value={zoom} onChange={setZoom} />
      </div>
      <div className="relative min-h-[16rem] flex-1 overflow-hidden bg-sheet">
        <div ref={scrollerRef} role="region" aria-label="Projects on a timeline" className="h-full overflow-auto overscroll-x-contain" onScroll={onScroll}>
          <TimelineHeader range={range} zoom={zoom} dayWidth={dayWidth} today={today} nameWidth={nameWidth} nameLabel="Project" />
          <div className="relative" style={{ width: nameWidth + gridWidth, height: rows.length * ROW_HEIGHT }}>
            <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: nameWidth, width: gridWidth }}>
              {todayLeft >= 0 && todayLeft < gridWidth && (
                <div className="absolute inset-y-0 z-[5] w-[1.5px] -translate-x-1/2 bg-brand" style={{ left: todayLeft + dayWidth / 2 }} />
              )}
            </div>
            {rows.map(({ p, span }, i) => {
              const health = p.health ? healthOf(p.health) : null
              const pct = Math.round(progressOf(p) * 100)
              const box = span ? barBox(span, range, dayWidth) : null
              const marks = targets.get(p.project_uuid) ?? []
              const next = marks.find(({ m }) => m.next)
              const nextWords = next ? `next milestone ${next.m.name} on ${shortDate(next.day, today)}` : null
              const label = [p.project_name, span ? spanLabel(span, today) : "no dated tasks yet", `${pct}% done`, health?.label, nextWords].filter(Boolean).join(", ")
              const g = grow.bar(i)
              return (
                <div
                  key={p.project_uuid}
                  className={cn(HUE_CLASS[projectHues(p.project_uuid)], "group/prow absolute left-0 flex")}
                  style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT, width: nameWidth + gridWidth }}
                >
                  <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-line bg-sheet px-5" style={{ width: nameWidth }}>
                    <ProjectTile id={p.project_uuid} size={20} />
                    <Link href={timelineOf(p)} tabIndex={-1} className="truncate text-sm font-[510] hover:underline" title={p.project_name}>
                      {p.project_name}
                    </Link>
                  </div>
                  <div className="relative transition-colors group-hover/prow:bg-hover" style={{ width: gridWidth }}>
                    {box ? (
                      <>
                        <Link
                          href={timelineOf(p)}
                          aria-label={label}
                          data-project-bar={p.project_uuid}
                          data-tip={label}
                          className="work-tip absolute top-2.5 flex h-6 items-center rounded-md outline-none hover:shadow-e1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          style={{ left: box.left, width: box.width }}
                        >
                          <span
                            aria-hidden
                            data-grown={g["data-grown"]}
                            className="absolute inset-0 overflow-hidden rounded-md"
                            style={{ ...g.style, backgroundImage: "linear-gradient(140deg, var(--hue-a2), var(--hue-a1))", boxShadow: "inset 0 1px 0 rgb(255 255 255 / .2)" }}
                          >
                            {/* How much is done: a darker band from the left, under the
                                white name (a white one took it under AA). */}
                            <span data-done-band="" className="absolute inset-y-0 left-0 origin-left bg-black/15" style={{ width: "100%", transform: `scaleX(${pct / 100})` }} />
                          </span>
                          {box.width > 64 && (
                            <span className="sticky z-[1] truncate px-2.5 text-2xs font-[590] text-white" style={{ left: nameWidth + 4 }}>
                              {p.project_name}
                            </span>
                          )}
                        </Link>
                        <span aria-hidden className="pointer-events-none absolute top-2.5 flex h-6 items-center text-2xs tabular-nums text-ink-2" style={{ left: box.left + box.width + 8 }}>
                          {pct}%
                        </span>
                      </>
                    ) : (
                      <span className="sticky inline-flex h-full items-center px-2 text-xs text-ink-3" style={{ left: nameWidth + 4 }}>
                        No dated tasks yet
                      </span>
                    )}
                    {marks.length > 0 && <MilestoneMarks marks={marks.map(({ m, day }) => ({ m, left: offsetOf(day, range, dayWidth) + dayWidth / 2 }))} today={today} />}
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
