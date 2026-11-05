"use client"

// How long work takes (B9-a: jira-08, asana-08, linear-32): the report's
// Insights section. Cycle, lead and triage time and the age of open work,
// each a median with its 85th percentile; a control chart of the tasks done;
// time in each status; and the same spreads sliced by project, person,
// priority or type, where picking a slice shows its numbers and its dots.
// A chunk of its own (ReportsView draws it through lazyView), so the report's
// first load carries none of it. It reads only the report the reader was
// given: the server counts the projects they belong to and the tasks they may
// see (business/Project/report.go), and each dot links to its task.

import * as React from "react"

import { ScatterChart, type ScatterPoint } from "@/components/charts/ScatterChart"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { STATUS_LABEL, durationLabel, inSlice, sliceChoices, sliceName, slicesBy, type InsightFocus } from "@/lib/reportInsights"
import { dayLabel, weekLabel, type InsightSlice, type Insights, type Spread } from "@/lib/reports"
import { cn } from "@/lib/utils/helpers/cn"
import { app_task_path } from "@/types/paths"

export { insightsCSV } from "@/lib/reportInsights"

type Measure = "cycle" | "lead"
const MEASURES = [
  { value: "cycle" as const, label: "Cycle time" },
  { value: "lead" as const, label: "Lead time" },
]

const tasks = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`

/** One measure: its median, large, and its 85th percentile and count under it. */
function Tile({ label, spread, none }: { label: string; spread: Spread; none: string }) {
  return (
    <div className="min-w-0" data-kpi="">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-1 text-title-2 font-semibold tabular-nums text-foreground">{spread.n ? durationLabel(spread.p50) : "None"}</dd>
      <dd className="mt-0.5 text-xs text-ink-3">{spread.n ? `median · 85% within ${durationLabel(spread.p85)} · ${tasks(spread.n)}` : none}</dd>
    </div>
  )
}

/** Time in each step: the median as a bar, reaching on, lighter, to the 85th percentile. */
function InStatus({ rows }: { rows: Insights["in_status"] }) {
  const max = Math.max(0, ...rows.map((r) => r.p85))
  return (
    <section className="rounded-lg bg-raised px-5 py-4 shadow-e1" aria-label="Time in status">
      <h4 className="text-sm font-[590]">Time in status</h4>
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

/** The spreads one way: a row a slice, the busiest first; a row's name shows that slice alone. */
function Slices({
  slices,
  choices,
  by,
  onBy,
  focus,
  onFocus,
}: {
  slices: InsightSlice[]
  choices: ReturnType<typeof sliceChoices>
  by: InsightSlice["by"]
  onBy: (by: InsightSlice["by"]) => void
  focus: InsightFocus | null
  onFocus: (f: InsightFocus | null) => void
}) {
  const rows = slicesBy(slices, by)
  const pair = (s: Spread) => (s.n ? `${durationLabel(s.p50)} · ${durationLabel(s.p85)}` : "None")
  return (
    <section className="rounded-lg bg-raised px-5 py-4 shadow-e1" aria-label="By slice">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-[590]">By {choices.find((b) => b.by === by)?.label.toLowerCase()}</h4>
          <p className="mt-0.5 text-xs text-ink-2">Medians and 85th percentiles. Pick one to see its numbers and dots.</p>
        </div>
        <Select value={by} onValueChange={(v) => onBy(v as InsightSlice["by"])}>
          <SelectTrigger dense className="h-7 w-auto gap-1.5 text-xs" aria-label="Slice by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((b) => (
              <SelectItem key={b.by} value={b.by} className="text-xs">
                By {b.label.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-ink-2">Nothing done or open to slice in these weeks.</p>
      ) : (
        <table className="w-full table-fixed text-xs" data-insight-slices="">
          <thead className="text-left text-ink-3">
            <tr>
              <th scope="col" className="pb-1.5 font-[510]">
                Name
              </th>
              <th scope="col" className="w-12 pb-1.5 text-right font-[510]">
                Done
              </th>
              <th scope="col" className="w-24 pb-1.5 text-right font-[510]">
                Cycle
              </th>
              <th scope="col" className="w-24 pb-1.5 text-right font-[510] max-sm:hidden">
                Lead
              </th>
              <th scope="col" className="w-20 pb-1.5 text-right font-[510]">
                Open age
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((s) => {
              const on = focus?.by === s.by && focus.key === s.key
              return (
                <tr key={s.key} className="border-t border-line" data-insight-slice={s.key}>
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onFocus(on ? null : { by: s.by, key: s.key })}
                      className={cn(
                        "-mx-1.5 max-w-full truncate rounded-sm px-1.5 py-1 text-left text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
                        on && "bg-camp-sky/15 font-[510] text-foreground",
                      )}
                    >
                      {sliceName(s)}
                    </button>
                  </th>
                  <td className="text-right text-ink-2">{s.lead.n}</td>
                  <td className="text-right text-ink-2">{pair(s.cycle)}</td>
                  <td className="text-right text-ink-2 max-sm:hidden">{pair(s.lead)}</td>
                  <td className="text-right text-ink-2">{s.age.n ? `${s.age.n} · ${durationLabel(s.age.p50)}` : "None"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** The x axis's labels: the weeks' Mondays, at most `most` of them, evenly spaced, the latest always among them. */
function weekTicks(weeks: string[], most: number) {
  const step = Math.max(1, Math.ceil(weeks.length / most))
  return weeks.filter((_, i) => (weeks.length - 1 - i) % step === 0).map((w) => ({ at: Date.parse(w), label: weekLabel(w) }))
}

export function ReportInsights({ insights, weeks, compact, now = Date.now() }: { insights: Insights; weeks: string[]; compact?: boolean; now?: number }) {
  const [measure, setMeasure] = React.useState<Measure>("cycle")
  const [picked, setBy] = React.useState<InsightSlice["by"]>("project")
  // A field's slices (B9-b1) go with a report that no longer has the field: back to by project.
  const choices = sliceChoices(insights)
  const by = choices.some((c) => c.by === picked) ? picked : "project"
  const [focus, setFocus] = React.useState<InsightFocus | null>(null)
  const slice = focus && insights.slices.find((s) => s.by === focus.by && s.key === focus.key)
  // A slice that's no longer in the report (another span, other projects) stops being looked at.
  const shown = slice ? focus : null
  const spreads = { cycle: slice ? slice.cycle : insights.cycle, lead: slice ? slice.lead : insights.lead, age: slice ? slice.age : insights.age }
  const spread = spreads[measure]
  const label = measure === "cycle" ? "Cycle" : "Lead"
  const points: ScatterPoint[] = []
  for (const p of insights.points) {
    const y = measure === "cycle" ? p.cycle : p.lead
    if (y === undefined) continue
    const done = new Date(p.done_at)
    points.push({
      id: p.task_uuid,
      x: done.getTime(),
      y,
      label: p.task_name,
      detail: `${label} ${durationLabel(y)} · done ${dayLabel(done)}`,
      href: `${app_task_path}/${p.task_uuid}`,
      muted: shown ? !inSlice(p, shown) : false,
    })
  }
  const first = weeks.length ? Date.parse(weeks[0]) : now
  return (
    <section aria-label="How long work takes" data-report-insights="" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-[590]">How long work takes</h3>
          <p className="mt-0.5 text-xs text-ink-2">
            The tasks done in these {weeks.length} weeks, and the work open now{slice ? `: ${sliceName(slice)} alone` : ""}.
          </p>
        </div>
        {slice && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFocus(null)}>
            Show all work
          </Button>
        )}
      </div>
      <dl data-kpi-strip="" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-sunken px-5 py-4 lg:grid-cols-4">
        <Tile label="Cycle time" spread={spreads.cycle} none="No task started and done in these weeks" />
        <Tile label="Lead time" spread={spreads.lead} none="No task done in these weeks" />
        {/* Triage isn't sliced: it is the whole report's, slice or not. */}
        <Tile label="Triage time" spread={insights.triage} none="No task left the backlog in these weeks" />
        <Tile label="Age of open work" spread={spreads.age} none="Nothing open with a start date" />
      </dl>
      <div className={cn("grid gap-4", !compact && "lg:grid-cols-2")}>
        <ScatterChart
          title={`${label} time of each task done`}
          subtitle={measure === "cycle" ? "From first started to done, by the day it was done." : "From made to done, by the day it was done."}
          actions={<SegmentedControl value={measure} onValueChange={setMeasure} options={MEASURES} aria-label="Measure" />}
          points={points}
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
              ? `${label} time of ${tasks(spread.n)} done: median ${durationLabel(spread.p50)}, 85% within ${durationLabel(spread.p85)}. The CSV has every task.`
              : `No ${label.toLowerCase()} time in these weeks.`
          }
          empty={measure === "cycle" ? "No task was started and done in these weeks." : "No task was done in these weeks."}
          linkLabel="Open task"
        />
        <InStatus rows={insights.in_status} />
      </div>
      {insights.points_capped && <p className="text-xs text-ink-3">The chart draws the latest {insights.points.length} tasks done; the numbers count them all.</p>}
      <Slices
        slices={insights.slices}
        choices={choices}
        by={by}
        onBy={(b) => {
          setBy(b)
          setFocus(null)
        }}
        focus={shown}
        onFocus={setFocus}
      />
    </section>
  )
}
