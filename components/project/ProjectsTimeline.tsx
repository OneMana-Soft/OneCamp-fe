"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { startOfDay } from "date-fns"
import { OffViewChips } from "@/components/project/timeline/OffViewChips"
import { TimelineHeader } from "@/components/project/timeline/TimelineHeader"
import { ZoomSwitch } from "@/components/project/timeline/ZoomSwitch"
import { PlanLabelDot } from "@/components/project/PlanLabelDot"
import { Button } from "@/components/ui/button"
import { PriorityGlyph } from "@/components/ui/graphics/glyphs"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { OverlayBody, OverlayFooter, OverlayHeader } from "@/components/ui/overlay"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useGrow } from "@/hooks/useGrow"
import { useStoredState } from "@/hooks/useStoredState"
import { useTimelineView } from "@/hooks/useTimelineView"
import { healthOf } from "@/lib/projectUpdates"
import { progressOf, type ProjectOverview } from "@/lib/projectsOverview"
import { DAY_WIDTH, ZOOMS, barBox, offsetOf, spanLabel, timelineRange, type Zoom } from "@/lib/timeline"
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
import { endOf, planSpanOf, planWords } from "@/lib/work/planOverview"
import { PRIORITY_NAMES, priorityLevel } from "@/lib/tasks/priority"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { avatarSeed } from "@/lib/utils/getAvatarColor"

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
 * Its lead's face sits at the bar's end (linear-15); its lead, priority and
 * labels are in the bar's tip under a pointer, and a tap on a touch screen,
 * where nothing hovers, opens them in a peek (a sheet on a phone) that leads
 * on to the project's timeline.
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
  // A project runs across its plan's dates, and its tasks' days where its plan has none (linear-15); it is late
  // as the overview says, once its end is over with work open.
  const rows = useMemo(() => projects.map((p) => ({ p, span: planSpanOf(p), late: !!endOf(p, today)?.late })), [projects, today])
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
  const { onScroll, goToday, goTo, scrollerRef } = useTimelineView({ scrollRef, range, dayWidth, nameWidth, spans, today, ready: zoomReady })
  const todayLeft = offsetOf(today, range, dayWidth)
  const grow = useGrow("projects-timeline", zoomReady && rows.length > 0)
  const [peek, setPeek] = useState<string | null>(null)

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
            {rows.map(({ p, span, late }, i) => {
              const health = p.health ? healthOf(p.health) : null
              const pct = Math.round(progressOf(p) * 100)
              const box = span ? barBox(span, range, dayWidth) : null
              const marks = targets.get(p.project_uuid) ?? []
              const next = marks.find(({ m }) => m.next)
              const nextWords = next ? `next milestone ${next.m.name} on ${shortDate(next.day, today)}` : null
              const label = [p.project_name, span ? spanLabel(span, today) : "no dates yet", ...planWords(p.plan), late && "late", `${pct}% done`, health?.label, nextWords].filter(Boolean).join(", ")
              const lead = p.plan?.lead?.name
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
                        <Popover open={peek === p.project_uuid} onOpenChange={(open) => setPeek(open ? p.project_uuid : null)}>
                          <PopoverAnchor asChild>
                            <Link
                              href={timelineOf(p)}
                              aria-label={label}
                              data-project-bar={p.project_uuid}
                              data-tip={label}
                              onClick={(e) => {
                                if (!isTouchScreen()) return
                                e.preventDefault()
                                setPeek(p.project_uuid)
                              }}
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
                          </PopoverAnchor>
                          {peek === p.project_uuid && <PlanPeek p={p} span={span} today={today} />}
                        </Popover>
                        <span aria-hidden className="pointer-events-none absolute top-2.5 flex h-6 items-center gap-1.5 text-2xs tabular-nums text-ink-2" style={{ left: box.left + box.width + 8 }}>
                          {lead && <LeadFace name={lead} />}
                          {pct}%
                        </span>
                        {span && <OffViewChips start={span.start} end={span.end} left={box.left} right={box.left + box.width} nameWidth={nameWidth} today={today} late={late} onGo={goTo} />}
                      </>
                    ) : (
                      <span className="sticky inline-flex h-full items-center px-2 text-xs text-ink-3" style={{ left: nameWidth + 4 }}>
                        No dates yet
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

/** A project's lead, by their face: the avatar every screen draws them with (avatarSeed of the name the server gives). */
function LeadFace({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span data-plan-lead="" className="inline-flex shrink-0">
      <IdentityMark variant="avatar" size={size} id={avatarSeed(name)} label={name} />
    </span>
  )
}

/**
 * A bar's plan on a touch screen, where nothing hovers (linear-15): who leads
 * the project, its dates, its priority and its labels, and the way on to its
 * timeline, pinned in the footer. A sheet on a phone (app/overlay.css).
 */
function PlanPeek({ p, span, today }: { p: ProjectOverview; span: { start: Date; end: Date } | null; today: Date }) {
  const lead = p.plan?.lead?.name
  const level = priorityLevel(p.plan?.priority)
  const labels = p.plan?.labels ?? []
  const term = "flex min-h-8 items-center text-ink-3"
  const value = "flex min-h-8 min-w-0 items-center gap-2 text-foreground"
  return (
    <PopoverContent data-plan-peek="" aria-label={p.project_name} align="start" className="w-72 p-0">
      <OverlayHeader className="flex items-center gap-2.5 px-4 pb-1 pt-4">
        <ProjectTile id={p.project_uuid} size={20} />
        <span className="truncate text-sm font-[590] text-foreground">{p.project_name}</span>
      </OverlayHeader>
      <OverlayBody>
        <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 px-4 py-2 text-sm">
          <dt className={term}>Lead</dt>
          <dd className={value}>
            {lead ? (
              <>
                <LeadFace name={lead} size={20} />
                <span className="truncate">{lead}</span>
              </>
            ) : (
              <span className="text-ink-3">No lead</span>
            )}
          </dd>
          <dt className={term}>Dates</dt>
          <dd className={value}>{span ? spanLabel(span, today) : <span className="text-ink-3">No dates yet</span>}</dd>
          <dt className={term}>Priority</dt>
          <dd className={value}>
            {level ? (
              <>
                <PriorityGlyph level={level} size={14} />
                {PRIORITY_NAMES[level]}
              </>
            ) : (
              <span className="text-ink-3">No priority</span>
            )}
          </dd>
          <dt className={term}>Labels</dt>
          <dd className={cn(value, "flex-wrap py-1.5")}>
            {labels.length > 0 ? (
              labels.map((l) => (
                <span key={l.id} data-plan-label="" className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line px-2 py-0.5 text-xs">
                  <PlanLabelDot color={l.color} />
                  <span className="truncate">{l.name}</span>
                </span>
              ))
            ) : (
              <span className="text-ink-3">No labels</span>
            )}
          </dd>
        </dl>
      </OverlayBody>
      <OverlayFooter className="px-4 pb-4 pt-2">
        <Button asChild className="w-full">
          <Link href={timelineOf(p)}>Open timeline</Link>
        </Button>
      </OverlayFooter>
    </PopoverContent>
  )
}
