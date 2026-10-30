"use client"

import { memo, type ReactNode } from "react"

import { PartRetry } from "@/components/ui/part-retry"
import { MilestoneMark } from "@/components/work/milestones/MilestoneMark"
import { barBox, offsetOf, type Range } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
import { milestoneDays, progressWords, targetWords, type Milestone, type MilestoneDays } from "@/lib/work/milestones"
import { GROUP_HEIGHT, ROW_HEIGHT } from "./TimelineRows"

export interface DatedMilestone {
  milestone: Milestone
  days: MilestoneDays
}

/** The milestones a timeline draws: those with dated tasks or a target day, in the project's order. */
export function datedMilestones(list: Milestone[] | undefined): DatedMilestone[] {
  return (list ?? []).flatMap((milestone) => {
    const days = milestoneDays(milestone)
    return days ? [{ milestone, days }] : []
  })
}

/** The block's height: its heading row and a task-high row for each milestone; the heading alone when the read failed; else nothing. */
export function milestonesHeight(count: number, failed = false): number {
  return failed ? GROUP_HEIGHT : count > 0 ? GROUP_HEIGHT + count * ROW_HEIGHT : 0
}

/**
 * The project's milestones above its tasks on the timeline (linear-16): a row
 * for each one with a day, its diamond on the target day (MilestoneMark: the
 * project's hue, warm when it's next, green once done) and a thin bar over its
 * tasks' days. It sits between the dates and the tasks, outside the tasks' own
 * body, so their rows, arrows and drops keep their places; the grid's weekends,
 * week lines and today line run through it (backdrop). A read that failed says
 * so in the heading, with Try again (retry). Read-only: milestones change in the
 * project's Updates.
 */
export const TimelineMilestones = memo(function TimelineMilestones({
  shown,
  range,
  dayWidth,
  nameWidth,
  gridWidth,
  today,
  backdrop,
  retry,
}: {
  shown: DatedMilestone[]
  range: Range
  dayWidth: number
  nameWidth: number
  gridWidth: number
  today: Date
  backdrop: ReactNode
  retry?: () => void
}) {
  if (shown.length === 0 && !retry) return null
  const width = nameWidth + gridWidth
  return (
    <div data-timeline-milestones="" className="relative border-b border-line" style={{ height: milestonesHeight(shown.length, !!retry), width }}>
      {backdrop}
      <div className="relative flex bg-sunken" style={{ height: GROUP_HEIGHT, width }}>
        <div data-sticky-lead="" className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-sunken px-5" style={{ minWidth: nameWidth }}>
          <span className="whitespace-nowrap text-xs font-[510]">Milestones</span>
          {retry ? <PartRetry what="the milestones" retry={retry} /> : <span className="text-xs tabular-nums text-ink-3">{shown.length}</span>}
        </div>
      </div>
      <ul aria-label="Milestones" className="relative">
        {shown.map(({ milestone: m, days }) => {
          const target = targetWords(m, today)
          const bar = days.tasks ? barBox(days.tasks, range, dayWidth) : null
          return (
            <li key={m.id} data-milestone={m.id} className="group/mrow flex" style={{ height: ROW_HEIGHT, width }}>
              <div
                data-sticky-lead=""
                className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-line bg-sheet px-5 transition-colors group-hover/mrow:bg-[color-mix(in_oklab,var(--sheet),var(--ink)_4%)]"
                style={{ width: nameWidth }}
              >
                <MilestoneMark progress={m.progress} next={m.next} />
                <span className="min-w-0 flex-1 truncate text-sm leading-5 text-foreground" title={m.name}>
                  {m.name}
                  <span className="sr-only">{`, ${progressWords(m.progress)}`}</span>
                  {/* On a phone the name has the row: its day is said here, and the diamond marks it. */}
                  {target && <span className="sr-only md:hidden">{`, ${target.text}${target.late ? ", late" : ""}`}</span>}
                </span>
                {target && (
                  <span className={cn("hidden shrink-0 text-xs tabular-nums md:inline", target.late ? "text-danger-ink" : "text-ink-3")}>
                    {target.text}
                    {target.late && <span className="sr-only">, late</span>}
                  </span>
                )}
              </div>
              <div aria-hidden className="relative transition-colors group-hover/mrow:bg-hover" style={{ width: gridWidth }}>
                {bar && (
                  <div
                    data-milestone-bar=""
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-[var(--hue-a2)] dark:bg-[var(--hue)]"
                    style={{ left: bar.left, width: bar.width }}
                  />
                )}
                {days.target && (
                  <span
                    data-milestone-target=""
                    className="absolute top-1/2 z-[6] flex -translate-x-1/2 -translate-y-1/2"
                    style={{ left: offsetOf(days.target, range, dayWidth) + dayWidth / 2 }}
                  >
                    <MilestoneMark progress={m.progress} next={m.next} />
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
})
