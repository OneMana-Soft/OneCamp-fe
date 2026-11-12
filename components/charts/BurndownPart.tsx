"use client"

// A burndown, drawn: the cycle's (components/task/cycleBurndownDialog) and
// the release's (components/work/releases/ReleaseBurndown) alike, each
// reading its own and handing it here (jira-04: one part, no second copy).
//
// Design v3 (work.md W45, in W44's chart style): the counts on a sunken band
// at the top, numbers at title size; a quiet segmented "count in" switch; the
// chart's sentence above it; an empty one says what to do in words. Hours and
// points only, never money. It imports none of the shared core: the Releases
// tab's chunk draws it (app/releasesLazy.test).

import * as React from "react"
import SvgChart from "@/components/charts/SvgChart"
import { cn } from "@/lib/utils/helpers/cn"
import type { CycleState } from "@/lib/tasks/cycles"
import { burndownChart, burndownUnits, paceNote, type Burndown, type BurndownOf, type BurndownUnit } from "@/lib/tasks/cycleBurndown"

export function BurndownPart({
  burndown: b,
  of,
  state,
  empty,
  notStarted,
  after,
}: {
  burndown: Burndown
  /** Whose it is, for its words ("In the release"). */
  of: BurndownOf
  /** Where it stands: a release that's out is "completed", one past its target day "ended". */
  state?: CycleState
  /** What to do when it has no tasks, in words. */
  empty: string
  /** Said above the chart before it has started. */
  notStarted?: string
  /** What follows the chart in the unit it's counted in (the cycle's velocity). */
  after?: (shown: BurndownUnit) => React.ReactNode
}) {
  const [unit, setUnit] = React.useState<BurndownUnit | null>(null)
  const units = burndownUnits(b)
  // A project that estimates in points counts in them, until the reader picks another unit.
  const shown: BurndownUnit = unit && units.includes(unit) ? unit : units.includes("points") ? "points" : "tasks"
  const pace = paceNote(b, shown, state, of)
  const scope = of === "release" ? "In the release" : "In the cycle"

  return (
    <div className="grid gap-5" data-burndown="">
      <div data-kpi-band="" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
        <dl className="flex flex-wrap gap-x-7 gap-y-2">
          <Stat label={scope} value={b.tasks} />
          <Stat label="Done" value={b.done} />
          <Stat label="Still to do" value={b.open} />
          {units.includes("hours") && <Stat label="With an estimate" value={`${b.estimated} of ${b.tasks}`} />}
          {units.includes("points") && <Stat label="With points" value={`${b.pointed ?? 0} of ${b.tasks}`} />}
        </dl>
        {units.length > 1 && (
          <div className="flex rounded-md bg-press p-0.5" role="group" aria-label="Count in">
            {units.map((u) => (
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
        <p className="py-8 text-center text-sm text-ink-2">{empty}</p>
      ) : (
        <section aria-label="Burndown" className="grid gap-2">
          {pace ? <p className="text-sm font-medium text-foreground">{pace}</p> : notStarted && <p className="text-sm text-ink-2">{notStarted}</p>}
          <SvgChart chart={burndownChart(b, shown, of)} variant="card" className="my-0" />
        </section>
      )}

      {after?.(shown)}
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
