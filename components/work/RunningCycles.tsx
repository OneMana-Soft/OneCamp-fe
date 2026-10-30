"use client"

import Link from "next/link"
import { Chip } from "@/components/ui/chip"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { SpotCalendar } from "@/components/ui/graphics/spots"
import { Bar } from "@/components/ui/progress"
import { WorkRowsLoading, WorkState } from "@/components/task/workFrame"
import { useFetch } from "@/hooks/useFetch"
import { useGrow, type Grow } from "@/hooks/useGrow"
import { useProjectHue } from "@/lib/projectHue"
import { cycleDates, cycleLabel, percentDone } from "@/lib/tasks/cycles"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { RUNNING_CYCLES_URL, behindFirst, daysLeftWords, doneWords, paceWords, type RunningCycle } from "@/lib/work/runningCycles"
import { app_project_path } from "@/types/paths"
import { listOnceRead } from "@/lib/utils/listOf"

const COLUMNS = "grid grid-cols-[20px_minmax(0,1fr)_148px_220px_96px_104px] items-center gap-x-3 px-6"
const href = (c: RunningCycle) => `${app_project_path}/${c.project_uuid}?tab=backlog`

/**
 * Cycles (linear-12, part 3): the cycle running now in each project the
 * person may see, in one list. Each row has the project, its cycle and
 * dates, how much is done against how much time has gone (the bar's mark),
 * the days left and whether it keeps pace; the ones behind come first. A
 * row opens the project's Backlog, where its cycles are planned.
 */
export function RunningCycles({ compact }: { compact?: boolean }) {
  const { data, isLoading, isError, mutate } = useFetch<{ data: { cycles: RunningCycle[] } }>(RUNNING_CYCLES_URL)
  const list = listOnceRead<NonNullable<typeof data>, RunningCycle>(data, (a) => a.data?.cycles)
  const grow = useGrow("overview:cycles", list !== undefined, 24)

  if (isError && list === undefined) {
    return (
      <WorkState>
        <ErrorState subject="the running cycles" onRetry={() => void mutate()} />
      </WorkState>
    )
  }
  // The same rows the overview shows while this view's chunk is on its way.
  if (isLoading && list === undefined) return <WorkRowsLoading kind="cycles" compact={compact} />
  if (!list || list.length === 0) {
    return (
      <WorkState>
        <EmptyState
          illustration={<SpotCalendar />}
          title="No cycles running"
          description="A project's cycle shows here while it runs. Start one, or set cycles to run themselves, in a project's Backlog."
        />
      </WorkState>
    )
  }
  const shown = behindFirst(list)
  const behind = shown.filter((c) => c.pace === "behind").length
  return (
    <div data-running-cycles="">
      <p data-cycles-meta="" className={cn("py-3 text-xs text-ink-2", !compact && "px-6")}>
        {shown.length} {shown.length === 1 ? "cycle" : "cycles"} running
        {behind > 0 && (
          <>
            <span aria-hidden="true" className="px-1.5 text-ink-3">·</span>
            <span className="text-camp-sun-ink">{behind} behind</span>
          </>
        )}
      </p>
      {compact ? (
        <ul aria-label="Running cycles">
          {shown.map((c) => (
            <PhoneRow key={c.id} c={c} />
          ))}
        </ul>
      ) : (
        <div role="table" aria-label="Running cycles">
          <div role="row" className={cn(COLUMNS, "h-8 border-y border-line text-xs text-ink-3")}>
            <span role="columnheader" aria-label="Project" />
            <span role="columnheader">Project and cycle</span>
            <span role="columnheader">Dates</span>
            <span role="columnheader">Done</span>
            <span role="columnheader">Left</span>
            <span role="columnheader">Pace</span>
          </div>
          {shown.map((c, i) => (
            <Row key={c.id} c={c} grow={grow.bar(i)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ c, grow }: { c: RunningCycle; grow: ReturnType<Grow["bar"]> }) {
  const hue = useProjectHue(c.project_uuid)
  const pct = percentDone(c.progress)
  const pace = paceWords(c.pace)
  return (
    <Link href={href(c)} role="row" data-cycle-row="" {...ix("row", { hue })} className={cn(COLUMNS, "h-[56px] border-b border-line")}>
      <ProjectTile id={c.project_uuid} size={20} />
      <span role="cell" className="min-w-0">
        <span className="block truncate text-sm font-[510] text-foreground" title={c.project_name}>
          {c.project_name}
        </span>
        <span className="block truncate text-xs text-ink-3">{cycleLabel(c)}</span>
      </span>
      <span role="cell" className="truncate text-xs text-ink-2">
        {cycleDates(c)}
      </span>
      <span role="cell" className="flex items-center gap-2.5">
        <Bar value={pct} size={6} pace={Math.round(c.elapsed * 100)} label={`${c.project_name}, ${cycleLabel(c)}: ${pct}% done, ${Math.round(c.elapsed * 100)}% of its time gone`} grow={grow} />
        <span className="w-[88px] shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-ink-2">{doneWords(c.progress)}</span>
      </span>
      <span role="cell" className="text-xs tabular-nums text-ink-2">
        {daysLeftWords(c.days_left)}
      </span>
      <span role="cell">
        {c.pace === "empty" ? <span className="text-xs text-ink-3">{pace.label}</span> : <Chip tone={pace.tone}>{pace.label}</Chip>}
      </span>
    </Link>
  )
}

/** A cycle as a phone lists it: 72 px, two lines and the bar. */
function PhoneRow({ c }: { c: RunningCycle }) {
  const hue = useProjectHue(c.project_uuid)
  const pct = percentDone(c.progress)
  const pace = paceWords(c.pace)
  return (
    <li>
      <Link href={href(c)} data-cycle-row="" {...ix("row", { hue })} className="flex min-h-[72px] items-center gap-3 border-b border-line py-2.5">
        <ProjectTile id={c.project_uuid} size={28} />
        <span className="min-w-0 flex-1">
          {/* One text line high, the chip centred in it: a row is 79px with a "Behind" chip or without. */}
          <span className="flex h-5 min-w-0 items-center gap-2">
            <span className="truncate text-sm font-[510] text-foreground">{c.project_name}</span>
            {c.pace === "behind" && <Chip tone={pace.tone}>{pace.label}</Chip>}
          </span>
          <span className="block truncate text-xs text-ink-3">
            {cycleLabel(c)} · {daysLeftWords(c.days_left)} · {doneWords(c.progress)}
          </span>
          <Bar value={pct} size={4} pace={Math.round(c.elapsed * 100)} label={`${c.project_name}, ${cycleLabel(c)}: ${pct}% done, ${Math.round(c.elapsed * 100)}% of its time gone`} className="mt-1.5" />
        </span>
      </Link>
    </li>
  )
}
