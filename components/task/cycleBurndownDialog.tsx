"use client"

// A cycle's burndown and the project's velocity, opened from the Cycles
// button: how the cycle's work went down day by day against an even pace, and
// what recent cycles finished, so the next one can be sized to match.
//
// Design v3 (work.md W45, in W44's chart style): the counts on a sunken band
// at the top, numbers at title size; a quiet segmented "count in" switch; the
// chart's sentence above it; an empty cycle says what to do in words.

import * as React from "react"
import SvgChart from "@/components/charts/SvgChart"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useFetch } from "@/hooks/useFetch"
import { cn } from "@/lib/utils/helpers/cn"
import { browserTZ } from "@/lib/utils/timeZone"
import { ProjectsGet } from "@/services/endpoints/projects"
import { burndownChart, cycleDates, cycleLabel, loadNote, paceNote, velocityChart, type BurndownUnit, type BurndownView, type Cycle } from "@/lib/tasks/cycles"

export const burndownKey = (projectId: string, cycleId: string, tz: string = browserTZ()) =>
  `${ProjectsGet.ProjectCycles}/${projectId}/cycles/${cycleId}/burndown?tz=${encodeURIComponent(tz)}`

export function CycleBurndownDialog({
  projectId,
  cycle,
  onClose,
  returnFocus,
}: {
  projectId: string
  cycle: Cycle | null
  onClose: () => void
  /** Where focus goes when it closes: it has no trigger of its own. */
  returnFocus?: React.RefObject<HTMLElement | null>
}) {
  return (
    <Dialog open={!!cycle} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[85dvh] max-w-[95vw] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={(e) => {
          if (returnFocus?.current) {
            e.preventDefault()
            returnFocus.current.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{cycle ? `${cycleLabel(cycle)}: burndown` : "Burndown"}</DialogTitle>
          <DialogDescription>
            {cycle ? `${cycleDates(cycle)}. ` : ""}How the cycle&apos;s work went down each day, against an even pace to its last day.
          </DialogDescription>
        </DialogHeader>
        {cycle && <CycleBurndown projectId={projectId} cycleId={cycle.id} />}
      </DialogContent>
    </Dialog>
  )
}

export function CycleBurndown({ projectId, cycleId }: { projectId: string; cycleId: string }) {
  const { data, isError, mutate } = useFetch<{ data: BurndownView }>(burndownKey(projectId, cycleId))
  const [unit, setUnit] = React.useState<BurndownUnit>("tasks")
  const view = data?.data

  if (!view) {
    return isError ? (
      <ErrorState subject="the burndown" onRetry={() => void mutate()} />
    ) : (
      <div className="grid gap-3" aria-busy>
        <Skeleton className="h-12" />
        <Skeleton className="h-56" />
      </div>
    )
  }

  const { burndown: b, velocity: v, cycle } = view
  const canHours = b.estimated > 0
  const shown: BurndownUnit = canHours ? unit : "tasks"
  const pace = paceNote(b, shown, cycle.state)
  const load = cycle.state === "current" || cycle.state === "upcoming" ? loadNote(b, v, shown) : null

  return (
    <div className="grid gap-5" data-burndown="">
      <div data-kpi-band="" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
        <dl className="flex flex-wrap gap-x-7 gap-y-2">
          <Stat label="In the cycle" value={b.tasks} />
          <Stat label="Done" value={b.done} />
          <Stat label="Still to do" value={b.open} />
          {canHours && <Stat label="With an estimate" value={`${b.estimated} of ${b.tasks}`} />}
        </dl>
        {canHours && (
          <div className="flex rounded-md bg-press p-0.5" role="group" aria-label="Count in">
            {(["tasks", "hours"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={shown === u}
                onClick={() => setUnit(u)}
                className={cn(
                  "h-6 rounded-[6px] px-2.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  shown === u ? "bg-raised text-foreground shadow-sel" : "text-ink-2 hover:text-foreground",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        )}
      </div>

      {b.tasks === 0 ? (
        <p className="py-8 text-center text-sm text-ink-2">
          No tasks in this cycle yet. Add tasks to it from their Cycle field, and its burndown starts here.
        </p>
      ) : (
        <section aria-label="Burndown" className="grid gap-2">
          {pace ? (
            <p className="text-sm font-medium text-foreground">{pace}</p>
          ) : (
            <p className="text-sm text-ink-2">It hasn&apos;t started yet. The dashed line is the pace to finish everything in it by its last day.</p>
          )}
          <SvgChart chart={burndownChart(b, shown)} variant="card" className="my-0" />
        </section>
      )}

      <section aria-labelledby="velocity-title" className="grid gap-2">
        <h3 id="velocity-title" className="text-ui-sm font-semibold text-foreground">
          Velocity
        </h3>
        {v.cycles.length === 0 ? (
          <p className="text-sm text-ink-2">Once a cycle is completed, what each one finished shows here, to size the next.</p>
        ) : (
          <>
            {load && <p className="text-sm text-ink-2">{load}</p>}
            <SvgChart chart={velocityChart(v, shown)} variant="card" className="my-0" />
          </>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-title-3 font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
