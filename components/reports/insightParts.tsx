"use client"

// The pieces of How long work takes (ReportInsights) that a dashboard's
// widgets draw too (B9-b3): a spread's tile, time in each status, and the
// control chart of the tasks done. Each draws only what it is given.

import { ScatterChart, type ScatterPoint } from "@/components/charts/ScatterChart"
import { Stat } from "@/components/reports/stat"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { STATUS_LABEL, durationLabel, inSlice, type InsightFocus } from "@/lib/reportInsights"
import { dayLabel, weekLabel, type InsightPoint, type Insights, type Spread } from "@/lib/reports"
import { app_task_path } from "@/types/paths"

export type Measure = "cycle" | "lead"
const MEASURES = [
  { value: "cycle" as const, label: "Cycle time" },
  { value: "lead" as const, label: "Lead time" },
]

export const tasks = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`

/** One measure: its median, large, and its 85th percentile and count under it (the shared Stat, at either size). */
export function SpreadTile({ label, spread, none, size }: { label: string; spread: Spread; none: string; size?: "strip" | "tile" }) {
  return <Stat label={label} value={spread.n ? durationLabel(spread.p50) : "None"} note={spread.n ? `median · 85% within ${durationLabel(spread.p85)} · ${tasks(spread.n)}` : none} size={size} />
}

/** Time in each step: the median as a bar, reaching on, lighter, to the 85th percentile. */
export function InStatus({ rows, bare }: { rows: Insights["in_status"]; /** In a frame that names it already (a dashboard's widget). */ bare?: boolean }) {
  const max = Math.max(0, ...rows.map((r) => r.p85))
  return (
    <section className={bare ? undefined : "rounded-lg bg-raised px-5 py-4 shadow-e1"} aria-label="Time in status">
      {!bare && <h4 className="text-sm font-[590]">Time in status</h4>}
      <p className="mb-3 mt-0.5 text-xs text-ink-2">How long the tasks done spent at each step on their way.</p>
      {max === 0 ? (
        <p className="py-4 text-sm text-ink-2">No task done in these weeks spent time at a step.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const said = r.n ? `${durationLabel(r.p50)} median · 85% within ${durationLabel(r.p85)}` : "None"
            return (
              <li key={r.status} className="grid gap-1" data-in-status={r.status}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{STATUS_LABEL[r.status] ?? r.status}</span>
                  <span className="text-xs tabular-nums text-ink-2">{said}</span>
                </div>
                <div className="h-2 w-full" role="img" aria-label={`${STATUS_LABEL[r.status] ?? r.status}: ${said}`}>
                  {r.p85 > 0 && (
                    <div className="flex h-full gap-0.5" style={{ width: `${(100 * r.p85) / max}%` }}>
                      <span className="h-full rounded-[3px] bg-camp-sky" style={{ width: `${(100 * r.p50) / r.p85}%` }} />
                      <span className="h-full flex-1 rounded-[3px] bg-camp-sky/30" />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The x axis's labels: the weeks' Mondays, at most `most` of them, evenly spaced, the latest always among them. */
function weekTicks(weeks: string[], most: number) {
  const step = Math.max(1, Math.ceil(weeks.length / most))
  return weeks.filter((_, i) => (weeks.length - 1 - i) % step === 0).map((w) => ({ at: Date.parse(w), label: weekLabel(w) }))
}

/**
 * The control chart: each task done, by the day it was done, at its cycle or
 * lead time, with the median, the 85th percentile and the 25th to 95th band.
 * A focus mutes the tasks outside it; the measure is the reader's to switch.
 */
export function ControlChart({
  points,
  spreads,
  measure,
  onMeasure,
  weeks,
  compact,
  now,
  focus,
  title,
  note,
  className,
}: {
  points: InsightPoint[]
  spreads: Record<Measure, Spread>
  measure: Measure
  onMeasure: (m: Measure) => void
  weeks: string[]
  compact?: boolean
  now: number
  focus?: InsightFocus | null
  title?: string
  /** Said after the summary's numbers (the report: where every task is). */
  note?: string
  className?: string
}) {
  const spread = spreads[measure]
  const label = measure === "cycle" ? "Cycle" : "Lead"
  const shown: ScatterPoint[] = []
  for (const p of points) {
    const y = measure === "cycle" ? p.cycle : p.lead
    if (y === undefined) continue
    const done = new Date(p.done_at)
    shown.push({
      id: p.task_uuid,
      x: done.getTime(),
      y,
      label: p.task_name,
      detail: `${label} ${durationLabel(y)} · done ${dayLabel(done)}`,
      href: `${app_task_path}/${p.task_uuid}`,
      muted: focus ? !inSlice(p, focus) : false,
    })
  }
  const first = weeks.length ? Date.parse(weeks[0]) : now
  return (
    <ScatterChart
      title={title || `${label} time of each task done`}
      subtitle={measure === "cycle" ? "From first started to done, by the day it was done." : "From made to done, by the day it was done."}
      actions={<SegmentedControl value={measure} onValueChange={onMeasure} options={MEASURES} aria-label="Measure" />}
      points={shown}
      guides={spread.n ? [
        { y: spread.p50, label: `Median ${durationLabel(spread.p50)}` },
        { y: spread.p85, label: `85% within ${durationLabel(spread.p85)}`, dashed: true },
      ] : []}
      band={spread.n ? { from: spread.p25, to: spread.p95, label: "25th to 95th percentile" } : undefined}
      xDomain={[first, Math.max(now, first + 1)]}
      xTicks={weekTicks(weeks, compact ? 3 : 5)}
      yFormat={durationLabel}
      summary={
        spread.n
          ? `${label} time of ${tasks(spread.n)} done: median ${durationLabel(spread.p50)}, 85% within ${durationLabel(spread.p85)}.${note ? ` ${note}` : ""}`
          : `No ${label.toLowerCase()} time in these weeks.`
      }
      empty={measure === "cycle" ? "No task was started and done in these weeks." : "No task was done in these weeks."}
      linkLabel="Open task"
      className={className}
    />
  )
}
