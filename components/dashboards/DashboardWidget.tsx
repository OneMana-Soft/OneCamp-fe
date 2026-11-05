"use client"

// One widget on a dashboard (B9-b3): its frame, its name and, for its
// keepers, its menu; inside, what the server worked out for the reader,
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
import { ArrowDown, ArrowUp, Ellipsis, Pencil, Trash2 } from "@/lib/icons"
import { lastWeeks, metricText, MEASURES, widgetTitle, type MetricData, type Widget, type WidgetData } from "@/lib/dashboards"
import type { GoalSummary } from "@/lib/goals"
import { displayNameOf } from "@/lib/personName"
import { flowChart, openOf, PRIORITY_LABEL, throughputChart, type FlowWeek, type Insights, type ReportPersonRow, type ReportPriorityRow, type ReportProjectRow, type Spread } from "@/lib/reports"
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

function Menu({ title, actions }: { title: string; actions: WidgetActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="-mr-2 shrink-0 text-ink-2" aria-label={`${title}: more`}>
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const count = (n: number) => n.toLocaleString()

const onTimeNote = (data: MetricData) => (data.value === null ? "Nothing done had a due date" : "of the work done with a due date")

function Metric({ data, title }: { data: MetricData; title: string }) {
  const unit = MEASURES.find((m) => m.value === data.measure)?.unit
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
        <Stat label={title} value={metricText(data)} note={unit === "percent" ? onTimeNote(data) : undefined} size="tile" />
      )}
    </dl>
  )
}

type Row = { key: string; name: React.ReactNode; open: number; overdue: number; done?: number }

function rowsOf(by: string, rows: unknown[]): Row[] {
  if (by === "priority") {
    return (rows as ReportPriorityRow[]).map((r) => ({ key: r.priority || "none", name: PRIORITY_LABEL[r.priority] ?? r.priority, open: r.open, overdue: r.overdue }))
  }
  if (by === "person") {
    return (rows as ReportPersonRow[]).map((r) => ({
      key: r.user_uuid ?? "nobody",
      name: displayNameOf(r) || "Nobody",
      open: openOf(r),
      overdue: r.overdue,
      done: r.done,
    }))
  }
  return (rows as ReportProjectRow[]).map((r) => ({
    key: r.project_uuid,
    name: (
      <Link href={`${app_project_path}/${r.project_uuid}`} className="hover:underline">
        {r.project_name}
      </Link>
    ),
    open: openOf(r),
    overdue: r.overdue,
    done: r.done,
  }))
}

function Breakdown({ data }: { data: { by: string; rows: unknown[] | null } }) {
  const rows = rowsOf(data.by, data.rows ?? [])
  const done = data.by !== "priority"
  if (rows.length === 0) return <p className="py-4 text-sm text-ink-2">Nothing open or done to count.</p>
  return (
    <div className="min-h-0 overflow-y-auto">
      <table className="w-full table-fixed text-xs" data-breakdown={data.by}>
        <thead className="text-left text-ink-3">
          <tr>
            <th scope="col" className="pb-1.5 font-[510]">
              {data.by === "person" ? "Person" : data.by === "priority" ? "Priority" : "Project"}
            </th>
            <th scope="col" className="w-14 pb-1.5 text-right font-[510]">
              Open
            </th>
            <th scope="col" className="w-16 pb-1.5 text-right font-[510]">
              Overdue
            </th>
            {done && (
              <th scope="col" className="w-14 pb-1.5 text-right font-[510]">
                Done
              </th>
            )}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <th scope="row" className="truncate py-1.5 pr-2 text-left text-sm font-normal">
                {r.name}
              </th>
              <td className="text-right text-ink-2">{count(r.open)}</td>
              <td className={cn("text-right", r.overdue ? "font-[510] text-danger" : "text-ink-2")}>{count(r.overdue)}</td>
              {done && <td className="text-right text-ink-2">{count(r.done ?? 0)}</td>}
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
    body = <Metric data={result.data as MetricData} title={title} />
  } else {
    body = <Body widget={widget} result={result} now={now} compact={compact} />
  }
  // A number names itself (its tile's label); the rest are named above what they show.
  const metric = widget.kind === "metric" && !!result && !result.error
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
          <h3 className="min-w-0 truncate pt-1 text-sm font-[590]">{title}</h3>
          {actions && <Menu title={title} actions={actions} />}
        </div>
      )}
      <div className={cn("min-h-0 flex-1", metric && actions && "pr-8")}>{body}</div>
    </section>
  )
}
