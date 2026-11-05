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

import { ControlChart, InStatus, SpreadTile, type Measure } from "@/components/reports/insightParts"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { durationLabel, sliceChoices, sliceName, slicesBy, type InsightFocus } from "@/lib/reportInsights"
import { type InsightSlice, type Insights, type Spread } from "@/lib/reports"
import { cn } from "@/lib/utils/helpers/cn"

export { insightsCSV } from "@/lib/reportInsights"

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
        <SpreadTile label="Cycle time" spread={spreads.cycle} none="No task started and done in these weeks" />
        <SpreadTile label="Lead time" spread={spreads.lead} none="No task done in these weeks" />
        {/* Triage isn't sliced: it is the whole report's, slice or not. */}
        <SpreadTile label="Triage time" spread={insights.triage} none="No task left the backlog in these weeks" />
        <SpreadTile label="Age of open work" spread={spreads.age} none="Nothing open with a start date" />
      </dl>
      <div className={cn("grid gap-4", !compact && "lg:grid-cols-2")}>
        <ControlChart
          points={insights.points}
          spreads={spreads}
          measure={measure}
          onMeasure={setMeasure}
          weeks={weeks}
          compact={compact}
          now={now}
          focus={shown}
          note="The CSV has every task."
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
