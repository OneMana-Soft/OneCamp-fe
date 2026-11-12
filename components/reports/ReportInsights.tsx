"use client"

// How long work takes (B9-a: jira-08, asana-08, linear-32): the report's
// Insights section. Cycle, lead and triage time and the age of open work,
// each a median with its 85th percentile; a control chart of the tasks done;
// time in each status; and the same spreads, with counts and effort, sliced
// any way (L32), where picking a slice shows its numbers and its dots.
// A chunk of its own (ReportsView draws it through lazyView), so the report's
// first load carries none of it. It reads only the report the reader was
// given: the server counts the projects they belong to and the tasks they may
// see (business/Project/report.go), and each dot links to its task.

import * as React from "react"

import { ControlChart, InStatus, SpreadTile, type Measure } from "@/components/reports/insightParts"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { durationLabel, effortLabel, effortUnit, sliceChoices, sliceName, slicesBy, type InsightFocus } from "@/lib/reportInsights"
import { type InsightSlice, type Insights, type SliceBy, type Spread } from "@/lib/reports"
import { cn } from "@/lib/utils/helpers/cn"

export { insightsCSV } from "@/lib/reportInsights"

/** The spreads one way: a row a slice, the busiest first; a row's name shows that slice alone. */
function Slices({
  slices,
  choices,
  unit,
  by,
  onBy,
  focus,
  onFocus,
}: {
  slices: InsightSlice[]
  choices: ReturnType<typeof sliceChoices>
  /** The report's one effort unit (lib/reportInsights effortUnit). */
  unit: "points" | "hours"
  by: SliceBy
  onBy: (by: SliceBy) => void
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
          <p className="mt-0.5 text-xs text-ink-2">Medians and 85th percentiles; effort done · open, in {unit}. Pick one to see its numbers and dots.</p>
        </div>
        <Select value={by} onValueChange={(v) => onBy(v as SliceBy)}>
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
        // Eight columns: on a phone the table scrolls sideways inside its card, never the page,
        // and the edge with more columns past it fades (data-edge-fade, every sideways strip's one rule).
        <div className="-mx-5 overflow-x-auto px-5" data-edge-fade="">
        <table className="w-full min-w-[600px] table-fixed text-xs" data-insight-slices="">
          <thead className="text-left text-ink-3">
            <tr>
              {/* Name is 96px on a phone, so at rest the edge falls inside Effort (half its header under the fade at 390,
                  its figures at 360, its end at 414): a column cut by the fade reads as more past it, where a cut between
                  columns read as the table's end (DESIGN-BUILD-119 F1b). A long name truncates; picking it names it in full. */}
              <th scope="col" className="w-24 pb-1.5 font-[510] sm:w-auto">
                Name
              </th>
              <th scope="col" className="w-12 pb-1.5 text-right font-[510]">
                Done
              </th>
              <th scope="col" className="w-12 pb-1.5 text-right font-[510]">
                Open
              </th>
              <th scope="col" className="w-16 pb-1.5 text-right font-[510]">
                Overdue
              </th>
              <th scope="col" className="w-24 pb-1.5 text-right font-[510]">
                Effort
              </th>
              <th scope="col" className="w-24 pb-1.5 text-right font-[510]">
                Cycle
              </th>
              <th scope="col" className="w-24 pb-1.5 text-right font-[510]">
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
                  <td className="text-right text-ink-2">{s.done ?? s.lead.n}</td>
                  <td className="text-right text-ink-2">{s.open ?? s.age.n}</td>
                  <td className={cn("text-right", s.overdue ? "font-[510] text-danger" : "text-ink-2")}>{s.overdue ?? 0}</td>
                  <td className="text-right text-ink-2">{s.effort ? `${effortLabel(s.effort.done, unit)} · ${effortLabel(s.effort.open, unit)}` : "None"}</td>
                  <td className="text-right text-ink-2">{pair(s.cycle)}</td>
                  <td className="text-right text-ink-2">{pair(s.lead)}</td>
                  <td className="text-right text-ink-2">{s.age.n ? durationLabel(s.age.p50) : "None"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  )
}

export function ReportInsights({ insights, weeks, compact, now = Date.now() }: { insights: Insights; weeks: string[]; compact?: boolean; now?: number }) {
  const [measure, setMeasure] = React.useState<Measure>("cycle")
  const [picked, setBy] = React.useState<SliceBy>("project")
  // A field's slices (B9-b1) go with a report that no longer has the field: back to by project.
  const choices = sliceChoices(insights)
  const by = choices.some((c) => c.by === picked) ? picked : "project"
  const [focus, setFocus] = React.useState<InsightFocus | null>(null)
  const slice = focus && insights.slices.find((s) => s.by === focus.by && s.key === focus.key)
  // A slice that's no longer in the report (another span, other projects) stops being looked at.
  const shown = slice ? focus : null
  const spreads = { cycle: slice ? slice.cycle : insights.cycle, lead: slice ? slice.lead : insights.lead, age: slice ? slice.age : insights.age }
  return (
    // One column, never wider than the report (minmax(0,1fr)): an implicit column grows to its widest
    // card's content, so the slices' 600px table took the card past a phone's screen, where the page
    // cut it off (DESIGN-BUILD-118 F1). Held to the column, the table scrolls inside its card.
    <section aria-label="How long work takes" data-report-insights="" className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
        unit={effortUnit(insights)}
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
