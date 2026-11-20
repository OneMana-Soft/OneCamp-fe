"use client"

// One widget on a dashboard (B9-b3): its frame, its name, the saved view it
// reads (B9-b4), and its menu: a chart's CSV for every reader (linear-32), and
// for its keepers, its changes; inside, what the server worked out for the reader,
// drawn by the report's own pieces (SvgChart, components/reports/insightParts)
// so a number reads the same here as on Reports.

import Link from "next/link"
import * as React from "react"
import SvgChart from "@/components/charts/SvgChart"
import { GoalProgress, PaceWords } from "@/components/goals/GoalProgress"
import { ControlChart, InStatus, SpreadTile, type Measure } from "@/components/reports/insightParts"
import { Stat } from "@/components/reports/stat"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/hooks/use-toast"
import { ArrowDown, ArrowUp, Download, Ellipsis, Pencil, Trash2 } from "@/lib/icons"
import { CSV_KINDS, lastWeeks, metricText, MEASURES, widgetTitle, type MetricData, type Widget, type WidgetData } from "@/lib/dashboards"
import type { GoalSummary } from "@/lib/goals"
import { displayNameOf } from "@/lib/personName"
import { effortLabel, effortUnit, sliceChoices, sliceName, slicesBy } from "@/lib/reportInsights"
import {
  flowChart,
  openOf,
  PRIORITY_LABEL,
  throughputChart,
  type FlowWeek,
  type InsightField,
  type InsightSlice,
  type Insights,
  type ReportPersonRow,
  type ReportPriorityRow,
  type ReportProjectRow,
  type SliceBy,
  type Spread,
} from "@/lib/reports"
import { cn } from "@/lib/utils/helpers/cn"
import { app_project_path } from "@/types/paths"

export interface WidgetActions {
  onEdit: () => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
  first: boolean
  last: boolean
}

const FRAME = "flex h-full min-w-0 flex-col rounded-lg bg-raised px-5 pb-4 pt-3.5 shadow-e1"

function Menu({ title, actions, onCSV }: { title: string; actions?: WidgetActions; onCSV?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="-mr-2 shrink-0 text-ink-2" aria-label={`${title}: more`}>
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onCSV && (
          <DropdownMenuItem onSelect={onCSV}>
            <Download /> Download CSV
          </DropdownMenuItem>
        )}
        {onCSV && actions && <DropdownMenuSeparator />}
        {actions && (
          <>
            <DropdownMenuItem onSelect={actions.onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem disabled={actions.first} onSelect={() => actions.onMove(-1)}>
              <ArrowUp /> Move earlier
            </DropdownMenuItem>
            <DropdownMenuItem disabled={actions.last} onSelect={() => actions.onMove(1)}>
              <ArrowDown /> Move later
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={actions.onRemove}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Saves a chart's rows as CSV; its code comes when it is first asked for. */
function downloadCSV(widget: Widget, result: WidgetData) {
  import("@/lib/dashboardCSV").then(
    (m) => {
      if (!m.downloadWidgetCSV(widget, result)) toast({ tone: "error", title: "The CSV couldn't be saved", description: "Try again in a moment." })
    },
    () => toast({ tone: "error", title: "The CSV couldn't load", description: "Check the connection and try again." }),
  )
}

const count = (n: number) => n.toLocaleString()

const onTimeNote = (data: MetricData) => (data.value === null ? "Nothing done had a due date" : "of the work done with a due date")

function Metric({ data, title, view }: { data: MetricData; title: string; view?: string }) {
  const unit = MEASURES.find((m) => m.value === data.measure)?.unit
  // A tile over a saved view says which, on the Stat's note line (beside a percent's own note).
  const note = [unit === "percent" ? onTimeNote(data) : "", view ? `From ${view}` : ""].filter(Boolean).join(" · ") || undefined
  // Reports' own figure at its tile size: the number is the tile's hero, at its foot under the label.
  return (
    <dl className="h-full">
      {unit === "time" ? (
        <SpreadTile
          label={title}
          spread={data.spread ?? ({ n: 0, p25: 0, p50: 0, p85: 0, p95: 0 } as Spread)}
          none={data.measure === "age" ? "Nothing open with a start date" : "None in these weeks"}
          size="tile"
        />
      ) : (
        <Stat label={title} value={metricText(data)} note={note} size="tile" />
      )}
    </dl>
  )
}

type Row = { key: string; name: React.ReactNode; open: React.ReactNode; overdue?: number; done?: React.ReactNode }
type BreakdownData = { by: string; measure?: string; slices?: InsightSlice[]; rows?: unknown[] | null; field?: InsightField }

const projectLink = (id: string, name: string) => (
  <Link href={`${app_project_path}/${id}`} className="hover:underline">
    {name}
  </Link>
)

/** A breakdown's rows: its slices (L32: any way, counted or by effort), or a server's before them, by project, person or priority. */
function rowsOf(d: BreakdownData): Row[] {
  if (d.slices) {
    const unit = effortUnit({ slices: d.slices })
    return slicesBy(d.slices, d.by as SliceBy).map((s) => {
      const name = sliceName(s)
      const shown = s.by === "project" && s.key ? projectLink(s.key, name) : name
      if (d.measure === "effort") return { key: s.key, name: shown, open: effortLabel(s.effort?.open, unit), done: effortLabel(s.effort?.done, unit) }
      return { key: s.key, name: shown, open: count(s.open ?? s.age.n), overdue: s.overdue ?? 0, done: count(s.done ?? s.lead.n) }
    })
  }
  const rows = d.rows ?? []
  if (d.by === "priority") {
    return (rows as ReportPriorityRow[]).map((r) => ({ key: r.priority || "none", name: PRIORITY_LABEL[r.priority] ?? r.priority, open: count(r.open), overdue: r.overdue }))
  }
  if (d.by === "person") {
    return (rows as ReportPersonRow[]).map((r) => ({ key: r.user_uuid ?? "nobody", name: displayNameOf(r) || "Nobody", open: count(openOf(r)), overdue: r.overdue, done: count(r.done) }))
  }
  return (rows as ReportProjectRow[]).map((r) => ({ key: r.project_uuid, name: projectLink(r.project_uuid, r.project_name), open: count(openOf(r)), overdue: r.overdue, done: count(r.done) }))
}

function Breakdown({ data }: { data: BreakdownData }) {
  const rows = rowsOf(data)
  const effort = !!data.slices && data.measure === "effort"
  const done = rows.some((r) => r.done !== undefined)
  // By SLA, the server sends nothing for a project whose SLA state its viewer doesn't read (SLAs off, a guest).
  if (rows.length === 0)
    return <p className="py-4 text-sm text-ink-2">{data.by === "sla" ? "No SLA state to count: no project here has SLAs on." : "Nothing open or done to count."}</p>
  const head = (label: string, w: string) => (
    <th scope="col" className={cn(w, "pb-1.5 text-right font-[510]")}>
      {label}
    </th>
  )
  return (
    <div className="min-h-0 overflow-y-auto">
      <table className="w-full table-fixed text-xs" data-breakdown={data.by} data-measure={effort ? "effort" : "count"}>
        <thead className="text-left text-ink-3">
          <tr>
            <th scope="col" className="pb-1.5 font-[510]">
              {data.field?.name ?? sliceChoices(data).find((s) => s.by === data.by)?.label ?? "Name"}
            </th>
            {head(effort ? "Effort open" : "Open", effort ? "w-24" : "w-14")}
            {!effort && head("Overdue", "w-16")}
            {done && head(effort ? "Effort done" : "Done", effort ? "w-24" : "w-14")}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <th scope="row" className="truncate py-1.5 pr-2 text-left text-sm font-normal">
                {r.name}
              </th>
              <td className="text-right text-ink-2">{r.open}</td>
              {!effort && <td className={cn("text-right", r.overdue ? "font-[510] text-danger" : "text-ink-2")}>{count(r.overdue ?? 0)}</td>}
              {done && <td className="text-right text-ink-2">{r.done}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Goal({ goal }: { goal: GoalSummary }) {
  return (
    <div className="grid gap-2">
      <Link href={`/app/goals/${goal.id}`} className="truncate text-sm font-[510] text-foreground hover:underline">
        {goal.title}
      </Link>
      <GoalProgress goal={goal} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
        <PaceWords goal={goal} />
        {goal.due_date && <span>Due {new Date(`${goal.due_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
      </div>
    </div>
  )
}

function Control({ widget, data, now, compact }: { widget: Widget; data: Pick<Insights, "points" | "points_capped" | "cycle" | "lead">; now: number; compact?: boolean }) {
  const [measure, setMeasure] = React.useState<Measure>("cycle")
  return (
    <>
      <ControlChart
        points={data.points ?? []}
        spreads={{ cycle: data.cycle, lead: data.lead }}
        measure={measure}
        onMeasure={setMeasure}
        weeks={lastWeeks(widget.query.weeks || 12, new Date(now))}
        compact={compact}
        now={now}
        className="rounded-none bg-transparent px-0 pb-0 pt-0 shadow-none"
      />
      {data.points_capped && <p className="mt-1 text-xs text-ink-3">The chart draws the latest {data.points.length} tasks done; the numbers count them all.</p>}
    </>
  )
}

function Body({ widget, result, now, compact }: { widget: Widget; result: WidgetData; now: number; compact?: boolean }) {
  const d = result.data as never
  const weeks = widget.query.weeks || 12
  switch (widget.kind) {
    case "throughput": {
      const t = d as { weeks: string[]; done: number[]; added: number[] }
      return <SvgChart chart={{ ...throughputChart({ weeks: t.weeks ?? [], done: t.done ?? [], added: t.added ?? [] }), title: "" }} empty={`Nothing done or added in these ${weeks} weeks.`} className="my-0" />
    }
    case "flow": {
      const f = d as { weeks: string[]; flow?: FlowWeek[] }
      const chart = flowChart({ weeks: f.weeks ?? [], flow: f.flow })
      return chart ? <SvgChart chart={{ ...chart, title: "" }} className="my-0" /> : <p className="py-4 text-sm text-ink-2">No work stood open or got done in these {weeks} weeks.</p>
    }
    case "control_chart":
      return <Control widget={widget} data={d} now={now} compact={compact} />
    case "time_in_status":
      return <InStatus rows={(d as { in_status: Insights["in_status"] }).in_status ?? []} bare />
    case "breakdown":
      return <Breakdown data={d} />
    case "goal":
      return <Goal goal={d} />
  }
  return null
}

/**
 * A widget in its place. On a computer it spans its columns and rows of the
 * grid; on a phone (compact) it takes the one column at its own height.
 */
export function DashboardWidget({
  widget,
  result,
  loading,
  actions,
  compact,
  now,
}: {
  widget: Widget
  result?: WidgetData
  loading: boolean
  actions?: WidgetActions
  compact?: boolean
  now: number
}) {
  const title = widgetTitle(widget)
  const small = widget.kind === "metric" || widget.kind === "goal"
  const style = compact ? undefined : { gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }
  let body: React.ReactNode
  if (!result) {
    body = loading ? <Skeleton className={small ? "h-12 w-2/3" : "h-40 w-full"} /> : <p className="text-sm text-ink-2">This widget couldn&apos;t load just now.</p>
  } else if (result.error) {
    body = (
      <p role="status" className="text-sm text-ink-2">
        {result.error}
      </p>
    )
  } else if (widget.kind === "metric") {
    body = <Metric data={result.data as MetricData} title={title} view={result.view} />
  } else {
    body = <Body widget={widget} result={result} now={now} compact={compact} />
  }
  // A number names itself (its tile's label); the rest are named above what they show.
  const metric = widget.kind === "metric" && !!result && !result.error
  const onCSV = result && !result.error && result.data && CSV_KINDS.has(widget.kind) ? () => downloadCSV(widget, result) : undefined
  return (
    <section className={cn(FRAME, "relative")} style={style} aria-label={title} data-widget={widget.kind} data-widget-id={widget.id}>
      {metric ? (
        actions && (
          <div className="absolute right-3 top-2.5">
            <Menu title={title} actions={actions} />
          </div>
        )
      ) : (
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 pt-1">
            <h3 className="truncate text-sm font-[590]">{title}</h3>
            {result?.view && (
              <p className="truncate text-xs text-ink-3" data-widget-view="">
                From {result.view}
              </p>
            )}
          </div>
          {(actions || onCSV) && <Menu title={title} actions={actions} onCSV={onCSV} />}
        </div>
      )}
      <div className={cn("min-h-0 flex-1", metric && actions && "pr-8")}>{body}</div>
    </section>
  )
}
