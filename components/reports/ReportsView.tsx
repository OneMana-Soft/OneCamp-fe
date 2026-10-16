"use client"

// Reports: how work is going across your projects, for the weeks up to this
// one. The questions a weekly review asks: what got done and what came in,
// what's open and overdue and whose it is, what's urgent, and the hours.
// Asana keeps this for its Advanced plan and monday for Pro; here it needs no
// dashboard built first. Only projects you're in are counted.

import { displayNameOf } from "@/lib/personName"
import Link from "next/link"
import { useEffect, useMemo } from "react"
import SvgChart from "@/components/charts/SvgChart"
import { TaskAssigneeCell } from "@/components/task/taskAssigneeCell"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorState } from "@/components/ui/error-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotWelcome } from "@/components/ui/graphics/spots"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { useFetch } from "@/hooks/useFetch"
import { useStoredState } from "@/hooks/useStoredState"
import { ChevronDown, Download } from "@/lib/icons"
import {
  PRIORITY_LABEL,
  REPORT_WEEKS,
  hoursChart,
  openOf,
  reportCSV,
  reportKey,
  flowChart,
  throughputChart,
  totalHours,
  weekLabel,
  type Report,
  type ReportCounts,
  type ReportPersonRow,
} from "@/lib/reports"
import { downloadTextFile } from "@/lib/utils/file/downloadTextFile"
import { cn } from "@/lib/utils/helpers/cn"
import { browserTZ } from "@/lib/utils/timeZone"
import { app_project_path } from "@/types/paths"
import { useProjectHues } from "@/lib/projectHue"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"

const isWeeks = (v: unknown): v is number => (REPORT_WEEKS as readonly unknown[]).includes(v)
const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string")

const personName = (p: ReportPersonRow) => displayNameOf(p) || "Nobody"

// Where open work stands, in the order it moves, each in its status's own
// token: the colours the dots in the task list and the flow chart use, so a
// stage reads the same everywhere. (They were three steps of one blue ramp.)
const STAGES: { key: "to_do" | "in_progress" | "in_review"; label: string; className: string }[] = [
  { key: "to_do", label: "To do", className: "bg-muted-foreground" },
  { key: "in_progress", label: "In progress", className: "bg-info" },
  { key: "in_review", label: "In review", className: "bg-warning" },
]

/**
 * One headline figure (design v3, work.md W44): a 12 ink-2 label, the figure
 * at title-2 in tabular numbers, a delta against the week before in words
 * and colour (never colour alone), and a 32 px sparkline of its weeks where
 * it has them. Tiles stand on one sunken band, not a bordered card each.
 */
function Stat({ label, value, note, alert, series, delta }: { label: string; value: string | number; note?: string; alert?: boolean; series?: number[]; delta?: { by: number; good: "up" | "down" } }) {
  return (
    <div className="min-w-0" data-kpi="">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-title-2 font-semibold tabular-nums text-foreground">{value}</span>
        {delta && delta.by !== 0 && (
          <span
            data-delta={delta.by > 0 ? "up" : "down"}
            className={cn("text-xs font-[510] tabular-nums", (delta.by > 0) === (delta.good === "up") ? "text-camp-moss-ink" : "text-danger-ink")}
          >
            {delta.by > 0 ? "↑" : "↓"} {Math.abs(delta.by)} on last week
          </span>
        )}
      </dd>
      {note && <dd className={cn("mt-0.5 text-xs", alert ? "font-[510] text-danger-ink" : "text-ink-3")}>{note}</dd>}
      {series && series.length > 1 && <Spark values={series} />}
    </div>
  )
}

/** A KPI's weeks as a 32 px line (W44): 1.5 px in ink-2 with a dot at its end; no axis. */
function Spark({ values }: { values: number[] }) {
  const hi = Math.max(1, ...values)
  const W = 120
  const H = 32
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / hi) * (H - 6)] as const)
  const [ex, ey] = pts[pts.length - 1]
  return (
    <svg data-spark="" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 block h-8 w-full max-w-[160px] overflow-visible" aria-hidden="true">
      <path d={pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ex} cy={ey} r={2} fill="var(--ink-2)" />
    </svg>
  )
}

/** The change from the week before to this one, for a weekly series; none with fewer than two weeks. */
const lastDelta = (xs: number[] | null | undefined) => (xs && xs.length > 1 ? Math.round((xs[xs.length - 1] - xs[xs.length - 2]) * 10) / 10 : 0)

/** A row's open work as one bar, its stages side by side with a hairline gap,
 * scaled to the widest row. No grey track behind it: the bar's length is the
 * measure, and a filled track only adds ink. */
function StackedBar({ counts, max }: { counts: ReportCounts; max: number }) {
  const open = openOf(counts)
  const spoken = STAGES.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(", ")
  return (
    <div className="h-2 w-full" role="img" data-thin-bar="" aria-label={open ? spoken : "Nothing open"}>
      <div className="flex h-full gap-0.5" style={{ width: `${max ? (100 * open) / max : 0}%` }}>
        {STAGES.map((s) =>
          counts[s.key] > 0 ? (
            <span
              key={s.key}
              title={`${counts[s.key]} ${s.label.toLowerCase()}`}
              className={cn("h-full rounded-[3px]", s.className)}
              style={{ width: `${(100 * counts[s.key]) / open}%` }}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}

/** The words beside a row's bar: open, overdue, done. */
function Counts({ counts, weeks }: { counts: ReportCounts; weeks: number }) {
  return (
    <span className="text-xs tabular-nums text-ink-2">
      {openOf(counts)} open
      {counts.overdue > 0 && <span className="font-medium text-danger-ink"> · {counts.overdue} overdue</span>} · {counts.done} done in {weeks} weeks
    </span>
  )
}

/** A report section (W44): a raised card with its 14/590 title and, for stacked bars, the stages' key top right. */
function Section({ title, children, legend }: { title: string; children: React.ReactNode; legend?: boolean }) {
  return (
    <section className="rounded-lg bg-raised px-5 py-4 shadow-e1" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-[590]">{title}</h3>
        {legend && (
          <ul className="flex flex-wrap gap-3 text-xs text-ink-2" aria-hidden>
            {STAGES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-[2px]", s.className)} />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * What each project got done in the weeks shown (W44): one thin bar a
 * project in its own hue (hueFor its uuid, as its tile everywhere else), so
 * a project reads as the same colour in a report as in the sidebar.
 */
function DoneByProject({ projects, weeks }: { projects: Report["projects"]; weeks: number }) {
  const projectHues = useProjectHues()
  const rows = projects.filter((p) => p.done > 0).sort((a, b) => b.done - a.done)
  const max = Math.max(1, ...rows.map((p) => p.done))
  return (
    <Section title="Done by project">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing done in these {weeks} weeks.</p>
      ) : (
        <ul className="grid gap-2.5">
          {rows.map((p) => (
            <li key={p.project_uuid} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate text-foreground">{p.project_name}</span>
              <span className="h-2" role="img" aria-label={`${p.done} done`}>
                <span
                  data-done-bar={p.project_uuid}
                  data-hue={projectHues(p.project_uuid)}
                  className="block h-full rounded-[3px]"
                  style={{ width: `${(100 * p.done) / max}%`, background: `var(--camp-${projectHues(p.project_uuid)})` }}
                />
              </span>
              <span className="text-right text-xs tabular-nums text-ink-2">{p.done}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function ReportsView({ compact }: { compact?: boolean }) {
  const [weeks, setWeeks, weeksLoaded] = useStoredState<number>("oc_report_weeks", 12, isWeeks)
  const [chosen, setChosen, chosenLoaded] = useStoredState<string[]>("oc_report_projects", [], isIdList)
  const tz = useMemo(() => browserTZ(), [])
  // Asked once both remembered choices are read, not once before and once after;
  // the last report stays up while a new span or set of projects loads.
  const key = weeksLoaded && chosenLoaded ? reportKey(tz, weeks, chosen) : ""
  const { data, isLoading, isError, mutate } = useFetch<{ data: Report }>(key, undefined, { keepPreviousData: true })
  const report = data?.data

  // A remembered project that's gone (left, archived, the demo's nightly copy)
  // stops narrowing the report, and is forgotten.
  const available = useMemo(() => report?.all_projects ?? [], [report])
  const picked = useMemo(() => chosen.filter((id) => available.some((p) => p.project_uuid === id)), [chosen, available])
  useEffect(() => {
    if (report && picked.length !== chosen.length) setChosen(picked)
  }, [report, picked, chosen.length, setChosen])
  const toggle = (id: string) => setChosen(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  // The overview's frame (components/task/workFrame): this row is where
  // Table's row is on every other view, flush under the tabs with its 28 px
  // controls (they were 32 px, in a 24 px inset: PTC-7), and the report sits
  // 16px under it, inset as the projects' rows are.
  const controls = (
    <div data-work-toolbar="" className={cn(workToolbar, compact && "-mx-4")}>
      <Select value={String(weeks)} onValueChange={(v) => isWeeks(Number(v)) && setWeeks(Number(v))}>
        <SelectTrigger dense className="h-7 w-auto gap-1.5 text-xs" aria-label="Weeks">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPORT_WEEKS.map((w) => (
            <SelectItem key={w} value={String(w)} className="text-xs">
              Last {w} weeks
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={!report}>
            <span className="sr-only">Projects: </span>
            {picked.length === 0
              ? "All projects"
              : picked.length === 1
                ? available.find((p) => p.project_uuid === picked[0])?.project_name
                : `${picked.length} projects`}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
          <DropdownMenuCheckboxItem checked={picked.length === 0} onCheckedChange={() => setChosen([])} onSelect={(e) => e.preventDefault()}>
            All projects
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Or only these</DropdownMenuLabel>
          {available.map((p) => (
            <DropdownMenuCheckboxItem
              key={p.project_uuid}
              checked={picked.includes(p.project_uuid)}
              onCheckedChange={() => toggle(p.project_uuid)}
              onSelect={(e) => e.preventDefault()}
            >
              <ProjectTile id={p.project_uuid} />
              <span className="truncate">{p.project_name}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-xs"
        disabled={!report}
        onClick={() => report && downloadTextFile(`onecamp-report-${report.weeks[report.weeks.length - 1]}.csv`, reportCSV(report, personName), "text/csv")}
      >
        <Download className="h-3.5 w-3.5" />
        Download CSV
      </Button>
    </div>
  )

  // The band flush under the tabs, and the report 16px under it, inset as
  // the projects' rows are (a phone's page is inset already).
  const frame = (children: React.ReactNode, busy?: boolean) => (
    <div className="pb-4" data-reports="" aria-busy={busy || undefined}>
      {controls}
      <div className={cn("mt-4 grid gap-4", !compact && "px-6")}>{children}</div>
    </div>
  )

  if (report && available.length === 0) {
    return frame(
      <WorkState>
        <EmptyState
          illustration={<SpotWelcome hue="sky" />}
          title="No report yet"
          description="Reports count the work in the projects you're in. Join or start a project and they fill in."
        />
      </WorkState>,
    )
  }

  if (!report) {
    return frame(
      <>
        {isError ? (
          <WorkState>
            <ErrorState subject="the report" onRetry={() => void mutate()} />
          </WorkState>
        ) : (
          <div className="grid gap-3" aria-busy>
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border/60 py-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="grid gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-14" />
                </div>
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        )}
      </>,
    )
  }

  const hours = hoursChart(report)
  const flow = flowChart(report)
  const projectMax = Math.max(1, ...report.projects.map(openOf))
  const personMax = Math.max(1, ...report.people.map(openOf))
  const priorityMax = Math.max(1, ...report.priorities.map((p) => p.open))
  const nothing = report.open === 0 && report.done_total === 0

  return frame(
    <>
      {isError && <p className="text-xs text-danger-ink">The report couldn&apos;t refresh just now. These are the last numbers it had.</p>}
      {/* The KPI strip (W44): four figures on one sunken band. */}
      <dl data-kpi-strip="" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-sunken px-5 py-4 lg:grid-cols-4">
        <Stat label="Open" value={report.open} note={report.overdue > 0 ? `${report.overdue} overdue` : "Nothing overdue"} alert={report.overdue > 0} series={report.flow?.map((w) => w.to_do + w.in_progress + w.in_review)} />
        <Stat
          label={`Done in ${weeks} weeks`}
          value={report.done_total}
          note={report.on_time_percent !== undefined ? `${report.on_time_percent}% by their due date` : undefined}
          series={report.done}
          delta={{ by: lastDelta(report.done), good: "up" }}
        />
        <Stat label="Due in the next 7 days" value={report.due_this_week} series={report.added} />
        <Stat
          label="Hours logged"
          value={report.hours ? totalHours(report) : "None"}
          note={report.hours ? `in ${weeks} weeks` : "Couldn't be read just now"}
          series={report.hours ?? undefined}
          delta={report.hours ? { by: lastDelta(report.hours), good: "up" } : undefined}
        />
      </dl>
      {nothing ? (
        <WorkState>
          <EmptyState illustration={<SpotWelcome hue="sky" />} title="Nothing open or done in these weeks" description="Pick more weeks, or more projects." />
        </WorkState>
      ) : (
        <>
          <div className={cn("grid gap-4", !compact && (hours || flow) && "lg:grid-cols-2")}>
            <SvgChart chart={throughputChart(report)} variant="card" className="my-0" subtitle="Tasks finished each week, beside the tasks added." empty={`Nothing done or added in these ${weeks} weeks.`} />
            {hours ? <SvgChart chart={hours} variant="card" className="my-0" /> : report.hours && <p className="self-center text-sm text-ink-2">No hours logged in these {weeks} weeks.</p>}
            {flow && (
              <div className="grid content-start gap-1">
                <SvgChart chart={flow} variant="card" className="my-0" />
                <p className="px-1 text-xs text-ink-3">
                  Where the tasks stood at the end of each week. A band that keeps widening is work piling up at that step; done rising steadily is work getting through.
                </p>
              </div>
            )}
          </div>
          {/* The charts' numbers, week by week, for a screen reader. */}
          <table className="sr-only">
            <caption>Each week: tasks done, tasks added{report.hours ? " and hours logged" : ""}</caption>
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">Done</th>
                <th scope="col">Added</th>
                {report.hours && <th scope="col">Hours</th>}
              </tr>
            </thead>
            <tbody>
              {report.weeks.map((w, i) => (
                <tr key={w}>
                  <th scope="row">{weekLabel(w)}</th>
                  <td>{report.done[i]}</td>
                  <td>{report.added[i]}</td>
                  {report.hours && <td>{report.hours[i]}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {flow && report.flow && (
            <>
              <table className="sr-only">
                <caption>The flow of work: at the end of each week, tasks to do, in progress, in review, and done since the report began</caption>
                <thead>
                  <tr>
                    <th scope="col">Week of</th>
                    <th scope="col">To do</th>
                    <th scope="col">In progress</th>
                    <th scope="col">In review</th>
                    <th scope="col">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {report.weeks.map((w, i) => (
                    <tr key={w}>
                      <th scope="row">{weekLabel(w)}</th>
                      <td>{report.flow![i].to_do}</td>
                      <td>{report.flow![i].in_progress}</td>
                      <td>{report.flow![i].in_review}</td>
                      <td>{report.flow![i].done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div className={cn("grid gap-x-8 gap-y-6", !compact && "lg:grid-cols-2")}>
            <Section title="Open work by project" legend>
              <ul className="grid gap-3">
                {report.projects.map((p) => (
                  <li key={p.project_uuid} className="grid gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <ProjectTile id={p.project_uuid} />
                        <Link href={`${app_project_path}/${p.project_uuid}`} className="truncate text-sm font-medium hover:underline">
                          {p.project_name}
                        </Link>
                      </span>
                      <Counts counts={p} weeks={weeks} />
                    </div>
                    <StackedBar counts={p} max={projectMax} />
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Open work by person" legend>
              <ul className="grid gap-3">
                {report.people.map((p) => (
                  <li key={p.user_uuid ?? "nobody"} className="grid gap-1">
                    <div className="flex items-center justify-between gap-2">
                      {p.user_uuid ? (
                        <span className="min-w-0 truncate">
                          <TaskAssigneeCell
                            userInfo={{ user_uuid: p.user_uuid, user_name: personName(p), user_profile_object_key: p.user_profile_object_key ?? "" }}
                          />
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Nobody</span>
                      )}
                      <Counts counts={p} weeks={weeks} />
                    </div>
                    <StackedBar counts={p} max={personMax} />
                  </li>
                ))}
              </ul>
            </Section>
          </div>
          <DoneByProject projects={report.projects} weeks={weeks} />
          {report.priorities.length > 0 && (
            <Section title="Open work by priority">
              <ul className="grid gap-2">
                {report.priorities.map((p) => (
                  <li key={p.priority} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
                    <span>{PRIORITY_LABEL[p.priority] ?? p.priority}</span>
                    <span className="h-2" role="img" aria-label={`${p.open} open`}>
                      <span className="block h-full rounded-[3px] bg-ink-3" style={{ width: `${(100 * p.open) / priorityMax}%` }} />
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {p.open} open{p.overdue > 0 && <span className="font-medium text-danger-ink"> · {p.overdue} overdue</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {report.truncated && <p className="text-xs text-muted-foreground">A very large project&apos;s tasks were counted up to 5,000 of each kind.</p>}
    </>,
    isLoading,
  )
}
