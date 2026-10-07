"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"
import { useDispatch } from "react-redux"
import { HealthPill } from "@/components/projectUpdates/HealthPill"
import { SearchField } from "@/components/search/searchField"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { PageHeader } from "@/components/ui/pageHeader"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatePlaceholder } from "@/components/ui/StatePlaceholder"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMedia } from "@/context/MediaQueryContext"
import { useLongPress } from "@/hooks/useLongPress"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { useStoredState } from "@/hooks/useStoredState"
import { CirclePlus } from "@/lib/icons"
import {
  OVERVIEW_SORTS,
  filterOverview,
  glanceOf,
  needsAttention,
  overviewSummary,
  progressOf,
  sortOverview,
  type OverviewFilter,
  type OverviewSort,
  type ProjectOverview,
} from "@/lib/projectsOverview"
import { cn } from "@/lib/utils/helpers/cn"
import { projectGlanceParts } from "@/lib/utils/projectGlance"
import { daysAgo } from "@/lib/utils/relativeTime"
import { openUI } from "@/store/slice/uiSlice"
import { app_project_path } from "@/types/paths"

const isSort = (v: unknown): v is OverviewSort => OVERVIEW_SORTS.some((s) => s.value === v)
const isFilter = (v: unknown): v is OverviewFilter => v === "all" || v === "attention"
const href = (p: ProjectOverview) => `${app_project_path}/${p.project_uuid}`

/** "6 open · 3 overdue · 2 done", the late part in red; nothing for a project with no tasks. */
function Glance({ p, className }: { p: ProjectOverview; className?: string }) {
  const parts = projectGlanceParts(glanceOf(p))
  if (!parts) return <span className={cn("text-muted-foreground", className)}>No tasks yet</span>
  return (
    <span className={cn("text-muted-foreground", className)}>
      {parts.map((part, i) => (
        <span key={part.text}>
          {i > 0 && " · "}
          <span className={cn(part.tone === "late" && "font-medium text-destructive")}>{part.text}</span>
        </span>
      ))}
    </span>
  )
}

function Progress({ p, className }: { p: ProjectOverview; className?: string }) {
  if (p.open + p.done === 0) return null
  const pct = Math.round(progressOf(p) * 100)
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${p.project_name}: ${pct}% of tasks done`}
        className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", pct === 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

/** Where a project stands by its people's last word, or that there's none yet. */
function Health({ p }: { p: ProjectOverview }) {
  if (!p.health) return <span className="text-xs text-muted-foreground">No update yet</span>
  return <HealthPill health={p.health} />
}

/** A project as a phone lists it. A long press offers its admins the project's options, as before. */
function MobileRow({ p }: { p: ProjectOverview }) {
  const dispatch = useDispatch()
  const longPress = useLongPress(
    () =>
      dispatch(
        openUI({
          key: "projectLongPress",
          data: { isAdmin: p.is_admin > 0, projectId: p.project_uuid, teamId: p.project_team?.team_uuid, isMember: true, isDeleted: false },
        }),
      ),
    { threshold: 500 },
  )
  return (
    <li>
      <Link href={href(p)} className="block outline-none active:bg-muted focus-visible:bg-muted">
        <div className="px-4 py-3" {...longPress}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium">{p.project_name}</span>
            {p.health && <HealthPill health={p.health} className="h-5 px-2 text-2xs" />}
          </div>
          <p className="mt-0.5 truncate text-xs">
            {p.project_team?.team_name && <span className="text-muted-foreground">{p.project_team.team_name} · </span>}
            <Glance p={p} />
          </p>
          <Progress p={p} className="mt-2" />
        </div>
      </Link>
    </li>
  )
}

/**
 * Projects: every project the person is in, as one table on a computer (how
 * far along, what's late, how its people last said it was going, Asana's
 * portfolio and Linear's projects list in one) and as rows on a phone. Sort
 * and the "needs attention" filter are remembered.
 */
export function ProjectsOverview() {
  const { isDesktop } = useMedia()
  const router = useRouter()
  const dispatch = useDispatch()
  const { projects, isLoading, isError, mutate } = useProjectsOverview()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useStoredState<OverviewSort>("oc_projects_sort", "name", isSort)
  const [filter, setFilter] = useStoredState<OverviewFilter>("oc_projects_filter", "all", isFilter)

  const all = useMemo(() => projects ?? [], [projects])
  const shown = useMemo(() => sortOverview(filterOverview(all, { query, filter }), sort), [all, query, filter, sort])
  const summary = useMemo(() => overviewSummary(all), [all])
  const attention = useMemo(() => all.filter(needsAttention).length, [all])
  const newProject = () => dispatch(openUI({ key: "createProject" }))

  let body: ReactNode
  if (isError && !projects) {
    body = <ErrorState subject="your projects" onRetry={() => void mutate()} />
  } else if (isLoading && !projects) {
    body = (
      <div className="grid gap-3 py-2" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    )
  } else if (all.length === 0) {
    body = (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-10">
        <StatePlaceholder
          type="empty"
          title="No projects yet"
          description="Start one from a template (a client project, a launch, a new hire's first weeks) or from a blank page."
          action={
            <Button onClick={newProject} variant="outline" size="sm">
              Create a project
            </Button>
          }
        />
      </div>
    )
  } else if (shown.length === 0) {
    body = (
      <div className="flex min-h-[30vh] flex-col items-center justify-center px-4 py-10">
        <StatePlaceholder
          type="search"
          title={query ? "No projects found" : "Nothing needs attention"}
          description={query ? "No project's name or team has those words." : "No project is off track or at risk, and nothing is overdue."}
        />
      </div>
    )
  } else if (!isDesktop) {
    body = <ul className="divide-y divide-border/60">{shown.map((p) => <MobileRow key={p.project_uuid} p={p} />)}</ul>
  } else {
    body = (
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="w-[34%] py-2 pr-4 font-medium">Project</th>
            <th scope="col" className="w-[14%] py-2 pr-4 font-medium">Health</th>
            <th scope="col" className="w-[16%] py-2 pr-4 font-medium">Done</th>
            <th scope="col" className="w-[24%] py-2 pr-4 font-medium">Tasks</th>
            <th scope="col" className="w-[12%] py-2 font-medium">Last update</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr
              key={p.project_uuid}
              className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
              onClick={(e) => {
                // The name is the link; the rest of the row is a bigger target for a mouse.
                if (!(e.target as HTMLElement).closest("a")) router.push(href(p))
              }}
            >
              <td className="py-3 pr-4">
                <Link href={href(p)} className="block truncate font-medium outline-none hover:underline focus-visible:underline">
                  {p.project_name}
                </Link>
                {p.project_team?.team_name && <span className="block truncate text-xs text-muted-foreground">{p.project_team.team_name}</span>}
              </td>
              <td className="py-3 pr-4">
                <Health p={p} />
              </td>
              <td className="py-3 pr-4">
                <Progress p={p} />
              </td>
              <td className="truncate py-3 pr-4 text-xs">
                <Glance p={p} />
              </td>
              <td className="py-3 text-xs tabular-nums text-muted-foreground">{p.updated_at ? daysAgo(p.updated_at) : <span aria-label="No update yet">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const tools = all.length > 0 && (
    <div className={cn("flex flex-wrap items-center gap-2", isDesktop ? "px-4 pt-4" : "px-0 pb-1")}>
      <SearchField value={query} onChange={setQuery} placeholder="Search projects or teams…" className={isDesktop ? "w-80 shrink-0" : "w-full"} />
      <div className={cn("flex flex-wrap items-center gap-2", !isDesktop && "px-3")}>
        <ToggleGroup type="single" size="sm" value={filter} onValueChange={(v) => isFilter(v) && setFilter(v)} aria-label="Show" className="rounded-md border p-0.5">
          <ToggleGroupItem value="all" className="h-7 px-2.5 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="attention" className="h-7 gap-1.5 px-2.5 text-xs">
            Needs attention
            <span className="tabular-nums text-muted-foreground">{attention}</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <Select value={sort} onValueChange={(v) => isSort(v) && setSort(v)}>
          <SelectTrigger className="h-8 w-auto gap-1.5 text-xs" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OVERVIEW_SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  if (!isDesktop) {
    return (
      <div className="flex h-full flex-col">
        {tools}
        <div className="flex-1 overflow-y-auto">{body}</div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        className="px-8 pt-8"
        eyebrow="Every project you're in"
        title="Projects"
        actions={
          <Button size="sm" className="gap-1.5" onClick={newProject}>
            <CirclePlus className="h-4 w-4" />
            New project
          </Button>
        }
      >
        {summary.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {summary.map((s, i) => (
              <span key={s.text}>
                {i > 0 && " · "}
                <span className={cn(s.tone === "late" && "font-medium text-destructive")}>{s.text}</span>
              </span>
            ))}
          </p>
        )}
      </PageHeader>
      {tools}
      <div className="flex-1 overflow-y-auto px-8 pb-8 pt-2">{body}</div>
    </div>
  )
}
