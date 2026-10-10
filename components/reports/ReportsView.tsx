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
import { StatePlaceholder } from "@/components/ui/StatePlaceholder"
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
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { browserTZ } from "@/lib/utils/timeZone"
import { app_project_path } from "@/types/paths"

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
 * One headline number: a label, the figure, and a line under it. Plain type in
 * a row, not a bordered card each: four identical boxes are the dashboard
 * template, and the figures read as a set without them.
 */
function Stat({ label, value, note, alert }: { label: string; value: string | number; note?: string; alert?: boolean }) {
  return (
    <div className="min-w-0 lg:px-5 lg:first:pl-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      {note && <dd className={cn("mt-0.5 text-xs", alert ? "font-medium text-danger-ink" : "text-muted-foreground")}>{note}</dd>}
    </div>
  )
}

/** A row's open work as one bar, its stages side by side with a hairline gap,
 * scaled to the widest row. No grey track behind it: the bar's length is the
 * measure, and a filled track only adds ink. */
function StackedBar({ counts, max }: { counts: ReportCounts; max: number }) {
  const open = openOf(counts)
  const spoken = STAGES.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(", ")
  return (
    <div className="h-2 w-full" role="img" aria-label={open ? spoken : "Nothing open"}>
      <div className="flex h-full gap-0.5" style={{ width: `${max ? (100 * open) / max : 0}%` }}>
        {STAGES.map((s) =>
          counts[s.key] > 0 ? (
            <span
              key={s.key}
              title={`${counts[s.key]} ${s.label.toLowerCase()}`}
              className={cn("h-full rounded-sm", s.className)}
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
    <span className="text-xs tabular-nums text-muted-foreground">
      {openOf(counts)} open
      {counts.overdue > 0 && <span className="font-medium text-danger-ink"> · {counts.overdue} overdue</span>} · {counts.done} done in {weeks} weeks
    </span>
  )
}

function Section({ title, children, legend }: { title: string; children: React.ReactNode; legend?: boolean }) {
  return (
    <section className="border-t border-border/60 pt-4" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {legend && (
          <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden>
            {STAGES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-sm", s.className)} />
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

  if (report && available.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-10">
        <StatePlaceholder
          type="empty"
          title="No report yet"
          description="Reports count the work in the projects you're in. Join or start a project and they fill in."
        />
      </div>
    )
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(weeks)} onValueChange={(v) => isWeeks(Number(v)) && setWeeks(Number(v))}>
        <SelectTrigger className="h-8 w-auto gap-1.5 text-xs" aria-label="Weeks">
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
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!report}>
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
              <IdentityMark id={p.project_uuid} variant="square" />
              <span className="truncate">{p.project_name}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={!report}
        onClick={() => report && downloadTextFile(`onecamp-report-${report.weeks[report.weeks.length - 1]}.csv`, reportCSV(report, personName), "text/csv")}
      >
        <Download className="h-3.5 w-3.5" />
        Download CSV
      </Button>
    </div>
  )

  if (!report) {
    return (
      <div className="grid gap-4 pb-4" data-reports="">
        {controls}
        {isError ? (
          <ErrorState subject="the report" onRetry={() => void mutate()} />
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
      </div>
    )
  }

  const hours = hoursChart(report)
  const flow = flowChart(report)
  const projectMax = Math.max(1, ...report.projects.map(openOf))
  const personMax = Math.max(1, ...report.people.map(openOf))
  const priorityMax = Math.max(1, ...report.priorities.map((p) => p.open))
  const nothing = report.open === 0 && report.done_total === 0

  return (
    <div className="grid gap-4 pb-4" data-reports="" aria-busy={isLoading || undefined}>
      {controls}
      {isError && <p className="text-xs text-danger-ink">The report couldn&apos;t refresh just now. These are the last numbers it had.</p>}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border/60 py-4 lg:grid-cols-4 lg:gap-x-0 lg:divide-x lg:divide-border/60">
        <Stat label="Open" value={report.open} note={report.overdue > 0 ? `${report.overdue} overdue` : "Nothing overdue"} alert={report.overdue > 0} />
        <Stat
          label={`Done in ${weeks} weeks`}
          value={report.done_total}
          note={report.on_time_percent !== undefined ? `${report.on_time_percent}% by their due date` : undefined}
        />
        <Stat label="Due in the next 7 days" value={report.due_this_week} />
        <Stat label="Hours logged" value={report.hours ? totalHours(report) : "None"} note={report.hours ? `in ${weeks} weeks` : "Couldn't be read just now"} />
      </dl>
      {nothing ? (
        <StatePlaceholder type="empty" title="Nothing open or done in these weeks" description="Pick more weeks, or more projects." />
      ) : (
        <>
          <div className={cn("grid gap-4", !compact && (hours || flow) && "lg:grid-cols-2")}>
            <SvgChart chart={throughputChart(report)} className="my-0" />
            {hours && <SvgChart chart={hours} className="my-0" />}
            {flow && (
              <div className="grid content-start gap-1">
                <SvgChart chart={flow} className="my-0" />
                <p className="px-1 text-xs text-muted-foreground">
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
                        <IdentityMark id={p.project_uuid} variant="square" />
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
          {report.priorities.length > 0 && (
            <Section title="Open work by priority">
              <ul className="grid gap-2">
                {report.priorities.map((p) => (
                  <li key={p.priority} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
                    <span>{PRIORITY_LABEL[p.priority] ?? p.priority}</span>
                    <span className="h-2" role="img" aria-label={`${p.open} open`}>
                      <span className="block h-full rounded-sm bg-muted-foreground" style={{ width: `${(100 * p.open) / priorityMax}%` }} />
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
    </div>
  )
}
