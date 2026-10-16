"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useDispatch } from "react-redux"
import { GoalsView } from "@/components/goals/GoalsView"
import { HealthWord } from "@/components/projectUpdates/HealthPill"
import { ProjectsTimeline } from "@/components/project/ProjectsTimeline"
import { ProjectsWorkload } from "@/components/project/ProjectsWorkload"
import { ReportsView } from "@/components/reports/ReportsView"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { CountTick } from "@/components/ui/CountTick"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { SpotWelcome } from "@/components/ui/graphics/spots"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Bar } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { WorkSearch, WorkSegmented, WorkTabs, type WorkTab } from "@/components/task/WorkTabs"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { useMedia } from "@/context/MediaQueryContext"
import { useGrow } from "@/hooks/useGrow"
import { useLongPress } from "@/hooks/useLongPress"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { useStoredState } from "@/hooks/useStoredState"
import { measureFlip, playFlip, type FlipRects } from "@/lib/flip"
import { BarChart3, ChartGantt, ChevronDown, Filter, List, Plus, SlidersHorizontal, Target, Users } from "@/lib/icons"
import { HEALTHS } from "@/lib/projectUpdates"
import { OVERVIEW_SORTS, filterOverview, progressOf, sortOverview, type OverviewFilter, type OverviewSort, type ProjectOverview } from "@/lib/projectsOverview"
import { shortDate } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import { openUI } from "@/store/slice/uiSlice"
import { app_project_path } from "@/types/paths"
import { MenuCheck } from "@/components/ui/menuCheck"

const isSort = (v: unknown): v is OverviewSort => OVERVIEW_SORTS.some((s) => s.value === v)
const isFilter = (v: unknown): v is OverviewFilter => v === "all" || v === "attention"
type OverviewView = "table" | "timeline" | "workload" | "goals" | "reports"
const isView = (v: unknown): v is OverviewView => v === "table" || v === "timeline" || v === "workload" || v === "goals" || v === "reports"
type Grouping = "auto" | "team" | "health" | "none"
const isGrouping = (v: unknown): v is Grouping => v === "auto" || v === "team" || v === "health" || v === "none"
const href = (p: ProjectOverview) => `${app_project_path}/${p.project_uuid}`

/**
 * The overview's views as the project page's tabs (design v3, work.md W38):
 * Table is now "Projects", and the switcher stopped being a boxed toggle, so
 * the overview and a project share one tab language.
 */
const VIEWS: readonly WorkTab<OverviewView>[] = [
  { value: "table", label: "Projects", icon: List },
  { value: "timeline", label: "Timeline", icon: ChartGantt },
  { value: "workload", label: "Workload", icon: Users },
  { value: "goals", label: "Goals", icon: Target },
  { value: "reports", label: "Reports", icon: BarChart3 },
]

const DAY = 86_400_000
/** No update for this long counts as needing attention: a project gone quiet. */
const STALE_DAYS = 14

/**
 * Why a project needs attention, in words for its dot's tooltip, and how
 * urgent: danger for overdue work or off track, sun for at risk or a project
 * nobody has written about in two weeks. None when it is fine, so the dot
 * never shows without a reason.
 */
export function attentionOf(p: ProjectOverview, now = Date.now()): { tone: "danger" | "sun"; reason: string } | null {
  const reasons: string[] = []
  let tone: "danger" | "sun" = "sun"
  if (p.overdue > 0) {
    reasons.push(`${p.overdue} ${p.overdue === 1 ? "task" : "tasks"} overdue`)
    tone = "danger"
  }
  if (p.health === "off_track") {
    reasons.push("Off track")
    tone = "danger"
  } else if (p.health === "at_risk") reasons.push("At risk")
  const updated = p.updated_at ? Date.parse(p.updated_at) : NaN
  if (Number.isFinite(updated) && now - updated > STALE_DAYS * DAY) reasons.push(`No update for ${Math.floor((now - updated) / DAY)} days`)
  return reasons.length ? { tone, reason: reasons.join(" · ") } : null
}

/** "6 open · 1 late", the late part in danger ink; ink-3 for a project with no tasks. */
function Counts({ p }: { p: ProjectOverview }) {
  if (p.open + p.done === 0) return <span className="text-ink-3">No tasks yet</span>
  if (p.open === 0) return <span className="text-ink-2">All {p.done} done</span>
  return (
    <span className="text-ink-2">
      {p.open} open
      {p.overdue > 0 && (
        <>
          <span className="text-ink-4"> · </span>
          <span className="text-danger-ink">{p.overdue} late</span>
        </>
      )}
    </span>
  )
}

/** The day a project's tasks run to, in danger ink once it has passed with work open. */
function Ends({ p, now }: { p: ProjectOverview; now: Date }) {
  const d = p.last_day ? new Date(p.last_day) : null
  if (!d || Number.isNaN(d.getTime())) return <span className="text-ink-4">–</span>
  const late = p.open > 0 && d.getTime() < now.getTime() - DAY
  return <span className={cn("tabular-nums", late ? "text-danger-ink" : "text-foreground")}>{shortDate(d, now)}</span>
}

function AttentionDot({ p }: { p: ProjectOverview }) {
  const a = attentionOf(p)
  if (!a) return null
  return (
    <span
      data-tip={a.reason}
      data-attention={a.tone}
      role="img"
      aria-label={`Needs attention: ${a.reason}`}
      className="work-tip inline-flex size-3 shrink-0 items-center justify-center"
    >
      <span className={cn("size-1.5 rounded-full", a.tone === "danger" ? "bg-destructive" : "bg-camp-sun")} />
    </span>
  )
}

/** The table's columns: tile, name and team, health, progress, end, tasks (work.md W39). */
const COLUMNS = "grid grid-cols-[20px_minmax(0,1fr)_128px_176px_72px_132px] items-center gap-x-3 px-6"

type GrowProps = ReturnType<ReturnType<typeof useGrow>["bar"]>

/** A project as the table lists it: a 52 px row that is a link. */
function Row({ p, grow, now }: { p: ProjectOverview; grow: GrowProps; now: Date }) {
  const total = p.open + p.done
  const pct = Math.round(progressOf(p) * 100)
  return (
    <Link
      href={href(p)}
      role="row"
      data-flip-id={p.project_uuid}
      data-project-row=""
      className={cn(COLUMNS, "h-[52px] border-b border-line outline-none transition-colors duration-[140ms] hover:bg-hover focus-visible:bg-hover")}
    >
      <ProjectTile id={p.project_uuid} size={20} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-[510] text-foreground" title={p.project_name}>
            {p.project_name}
          </span>
          <AttentionDot p={p} />
        </span>
        {p.project_team?.team_name && <span className="block truncate text-xs text-ink-3">{p.project_team.team_name}</span>}
      </span>
      <HealthWord health={p.health} />
      <span className="flex items-center gap-2.5">
        {total > 0 ? (
          <>
            <Bar value={pct} size={6} label={`${p.project_name}: ${pct}% of tasks done`} grow={grow} />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-2">{pct}%</span>
          </>
        ) : (
          <span className="text-xs text-ink-4">–</span>
        )}
      </span>
      <span className="text-xs">
        <Ends p={p} now={now} />
      </span>
      <span className="truncate text-xs">
        <Counts p={p} />
      </span>
    </Link>
  )
}

/** A project as a phone lists it (W39): 72 px, two lines. A long press offers its admins the project's options, as before. */
function MobileRow({ p }: { p: ProjectOverview }) {
  const dispatch = useDispatch()
  const longPress = useLongPress(
    () =>
      dispatch(
        openUI({
          key: "projectLongPress",
          data: {
            isAdmin: p.is_admin > 0,
            projectId: p.project_uuid,
            teamId: p.project_team?.team_uuid,
            isMember: true,
            isDeleted: false,
          },
        }),
      ),
    { threshold: 500 },
  )
  const pct = Math.round(progressOf(p) * 100)
  const any = p.open + p.done > 0
  return (
    <li>
      <Link href={href(p)} data-project-row="" className="block border-b border-line outline-none active:bg-press focus-visible:bg-hover">
        <div className="flex h-[72px] items-center gap-3" {...longPress}>
          <ProjectTile id={p.project_uuid} size={28} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-body font-[590] leading-5 text-foreground">{p.project_name}</span>
                <AttentionDot p={p} />
              </span>
              <HealthWord health={p.health} />
            </span>
            <span className="mt-1.5 flex items-center gap-2 text-xs text-ink-2">
              {any && <Bar value={pct} label={`${pct}% done`} className="!w-14" />}
              <span className="truncate">
                {any ? `${pct}% · ` : ""}
                <Counts p={p} />
              </span>
            </span>
          </span>
        </div>
      </Link>
    </li>
  )
}

/** The quiet column header (W39): 32 px, 12/510 ink-3, sticky, a hairline under it; a sortable one shows its chevron on hover. */
function Header({ sort, onSort }: { sort: OverviewSort; onSort: (s: OverviewSort) => void }) {
  const head = (label: string, s?: OverviewSort) =>
    s ? (
      <button
        type="button"
        onClick={() => onSort(s)}
        aria-pressed={sort === s}
        className={cn("group/h inline-flex items-center gap-1 justify-self-start outline-none hover:text-foreground focus-visible:text-foreground", sort === s && "text-ink-2")}
      >
        {label}
        <ChevronDown aria-hidden="true" className={cn("size-3 transition-opacity", sort === s ? "opacity-100" : "opacity-0 group-hover/h:opacity-100")} />
      </button>
    ) : (
      <span>{label}</span>
    )
  return (
    <div role="row" data-projects-head="" className={cn(COLUMNS, "sticky top-0 z-10 h-8 border-b border-line bg-sheet text-xs font-[510] text-ink-3")}>
      <span />
      {head("Project", "name")}
      {head("Health", "attention")}
      {head("Progress", "progress")}
      {head("Ends")}
      {head("Tasks", "updated")}
    </div>
  )
}

/** A group's header (W18's look): 36 px on --sunken, its name and a count. */
function GroupHeader({ name, count }: { name: string; count: number }) {
  return (
    <div data-group-header="" className="sticky top-8 z-[5] flex h-9 items-center gap-2 border-b border-line bg-sunken px-6 text-xs">
      <span className="font-[510] text-foreground">{name}</span>
      <span className="tabular-nums text-ink-3">{count}</span>
    </div>
  )
}

const HEALTH_FACETS = [
  ...HEALTHS.filter((h) => h.value !== "done").map((h) => ({
    value: h.value as string,
    label: h.label,
  })),
  { value: "", label: "No update" },
]

interface Facets {
  health: string[]
  teams: string[]
}

/** A checkable menu row: 30 px, r8, led by the shared menu check (several can be on). */
function CheckRow({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onClick}
      className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-press focus-visible:bg-press"
    >
      <MenuCheck checked={on} />
      {children}
    </button>
  )
}

/**
 * Filter (W10, W38): one ghost button; its menu lists the facets (Health,
 * Team, Needs attention) and their values with checks. What is chosen shows
 * as chips beside it.
 */
function FilterMenu({
  facets,
  setFacets,
  attention,
  setAttention,
  teams,
  compact,
}: {
  facets: Facets
  setFacets: (f: Facets) => void
  attention: boolean
  setAttention: (on: boolean) => void
  teams: string[]
  compact?: boolean
}) {
  const count = facets.health.length + facets.teams.length + (attention ? 1 : 0)
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size={compact ? "icon-sm" : "sm"} aria-label={compact ? `Filter${count ? `, ${count} on` : ""}` : undefined} className="relative">
          <Filter className="!size-3.5" />
          {!compact && "Filter"}
          {compact && count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-brand text-3xs font-[590] text-brand-foreground">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-1" aria-label="Filter projects">
        <div role="menu" aria-label="Filter projects">
          <p className="px-2 pb-1 pt-1.5 text-xs font-[510] text-ink-3">Health</p>
          {HEALTH_FACETS.map((h) => (
            <CheckRow key={`h-${h.value}`} on={facets.health.includes(h.value)} onClick={() => setFacets({ ...facets, health: toggle(facets.health, h.value) })}>
              <HealthWord health={h.value || null} />
            </CheckRow>
          ))}
          {teams.length > 1 && (
            <>
              <div className="my-1 h-px bg-line" />
              <p className="px-2 pb-1 pt-1.5 text-xs font-[510] text-ink-3">Team</p>
              {teams.map((t) => (
                <CheckRow key={`t-${t}`} on={facets.teams.includes(t)} onClick={() => setFacets({ ...facets, teams: toggle(facets.teams, t) })}>
                  {t}
                </CheckRow>
              ))}
            </>
          )}
          <div className="my-1 h-px bg-line" />
          <CheckRow on={attention} onClick={() => setAttention(!attention)}>
            Needs attention
          </CheckRow>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Display (W11, W38): grouping and ordering, in one popover. */
function DisplayMenu({
  sort,
  setSort,
  grouping,
  setGrouping,
  compact,
}: {
  sort: OverviewSort
  setSort: (s: OverviewSort) => void
  grouping: Grouping
  setGrouping: (g: Grouping) => void
  compact?: boolean
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size={compact ? "icon-sm" : "sm"} aria-label={compact ? "Display" : undefined}>
          <SlidersHorizontal className="!size-3.5" />
          {!compact && "Display"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] space-y-3 p-3" aria-label="Display">
        <div className="space-y-1.5">
          <p className="text-xs font-[510] text-ink-3">Grouping</p>
          <WorkSegmented
            label="Group by"
            value={grouping}
            onChange={setGrouping}
            options={[
              {
                value: "auto",
                label: "Auto",
                title: "By team when there is more than one",
              },
              { value: "team", label: "Team" },
              { value: "health", label: "Health" },
              { value: "none", label: "None" },
            ]}
          />
        </div>
        <div role="menu" aria-label="Ordering" className="space-y-0.5">
          <p className="pb-1 text-xs font-[510] text-ink-3">Ordering</p>
          {OVERVIEW_SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="menuitemradio"
              aria-checked={sort === s.value}
              onClick={() => setSort(s.value)}
              className="flex h-[30px] w-full items-center justify-between rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-press focus-visible:bg-press"
            >
              {s.label}
              {/* One ordering at a time: its check ends the row. */}
              <MenuCheck checked={sort === s.value} className="text-ink-2" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Projects (design v3, work.md W38, W39): every project the person is in.
 * A header with the counts that matter, the views as tabs, one 44 px
 * toolbar, then the projects as 52 px rows with their tile, health, a bar
 * that grows on first reveal, the day they run to and their counts, grouped
 * by team when there is more than one. No box: rows on the sheet with
 * hairlines between them.
 */
export function ProjectsOverview() {
  const { isDesktop } = useMedia()
  const router = useRouter()
  const dispatch = useDispatch()
  const { projects, isLoading, isError, mutate } = useProjectsOverview()
  const [query, setQuery] = useState("")
  const [sort, setSortRaw] = useStoredState<OverviewSort>("oc_projects_sort", "name", isSort)
  const [filter, setFilter] = useStoredState<OverviewFilter>("oc_projects_filter", "all", isFilter)
  const [grouping, setGroupingRaw] = useStoredState<Grouping>("oc_projects_group", "auto", isGrouping)
  const [facets, setFacets] = useState<Facets>({ health: [], teams: [] })
  const [view, setView] = useStoredState<OverviewView>("oc_projects_view", "table", isView)
  // ?view= opens a view (a demo link, a doc, Go to Workload), and it's
  // remembered like a choice. Choosing one puts it in the address, so the
  // link can be shared and asking for a view again always lands on it.
  const params = useSearchParams()
  const asked = params.get("view")
  useEffect(() => {
    if (isView(asked)) setView(asked)
  }, [asked, setView])
  const choose = (v: OverviewView) => {
    setView(v)
    const next = new URLSearchParams(params.toString())
    next.set("view", v)
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  // Reordering rows by sort or grouping travels by FLIP (240 ms).
  const listRef = useRef<HTMLDivElement>(null)
  const pendingFlip = useRef<FlipRects | null>(null)
  const setSort = useCallback(
    (s: OverviewSort) => {
      pendingFlip.current = measureFlip(listRef.current)
      setSortRaw(s)
    },
    [setSortRaw],
  )
  const setGrouping = useCallback(
    (g: Grouping) => {
      pendingFlip.current = measureFlip(listRef.current)
      setGroupingRaw(g)
    },
    [setGroupingRaw],
  )
  useLayoutEffect(() => {
    if (!pendingFlip.current) return
    playFlip(listRef.current, pendingFlip.current, { duration: 240 })
    pendingFlip.current = null
  }, [sort, grouping])

  const all = useMemo(() => projects ?? [], [projects])
  const teams = useMemo(() => [...new Set(all.map((p) => p.project_team?.team_name).filter((t): t is string => !!t))].sort(), [all])
  const shown = useMemo(() => {
    const base = filterOverview(all, { query, filter })
    const picked = base.filter(
      (p) => (facets.health.length === 0 || facets.health.includes(p.health ?? "")) && (facets.teams.length === 0 || facets.teams.includes(p.project_team?.team_name ?? "")),
    )
    return sortOverview(picked, sort)
  }, [all, query, filter, facets, sort])
  const overdue = useMemo(() => all.reduce((n, p) => n + p.overdue, 0), [all])
  const grow = useGrow("overview:projects", !!projects, 24)
  const [now] = useState(() => new Date())
  const newProject = () => dispatch(openUI({ key: "createProject" }))
  const nothingYet = all.length === 0
  const clearAll = () => {
    setFacets({ health: [], teams: [] })
    setFilter("all")
    setQuery("")
  }

  const chips: { key: string; text: string; clear: () => void }[] = []
  if (facets.health.length)
    chips.push({
      key: "health",
      text: `Health is ${facets.health.map((h) => HEALTH_FACETS.find((x) => x.value === h)?.label ?? h).join(", ")}`,
      clear: () => setFacets({ ...facets, health: [] }),
    })
  if (facets.teams.length)
    chips.push({
      key: "team",
      text: `Team is ${facets.teams.join(", ")}`,
      clear: () => setFacets({ ...facets, teams: [] }),
    })
  if (filter === "attention")
    chips.push({
      key: "attention",
      text: "Needs attention",
      clear: () => setFilter("all"),
    })

  // The 44 px toolbar (W10): Filter and its chips on the left; search and
  // Display on the right. Timeline and Workload draw it at the start of
  // their own row, so the three line up.
  const viewTools = (
    <>
      <FilterMenu
        facets={facets}
        setFacets={setFacets}
        attention={filter === "attention"}
        setAttention={(on) => setFilter(on ? "attention" : "all")}
        teams={teams}
        compact={!isDesktop}
      />
      {chips.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Chip key={c.key} onRemove={c.clear} removeLabel={`Remove ${c.text}`} className="h-6 [animation:work-pop-in_180ms_var(--ease-out)_both]">
              {c.text}
            </Chip>
          ))}
          {chips.length > 1 && (
            <Button variant="ghost" size="xs" onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>
      )}
      <span className="flex-1" />
      {!nothingYet && <WorkSearch value={query} onChange={setQuery} placeholder="Search projects or teams…" label="Search projects" />}
      {view === "table" && <DisplayMenu sort={sort} setSort={setSort} grouping={grouping} setGrouping={setGrouping} compact={!isDesktop} />}
    </>
  )

  const groups = useMemo(() => {
    const by = grouping === "auto" ? (teams.length > 1 ? "team" : "none") : grouping
    if (by === "none") return [{ key: "all", name: "", items: shown }]
    const keyOf = (p: ProjectOverview) => (by === "team" ? p.project_team?.team_name || "No team" : (p.health ?? ""))
    const map = new Map<string, ProjectOverview[]>()
    for (const p of shown) map.set(keyOf(p), [...(map.get(keyOf(p)) ?? []), p])
    const order = by === "health" ? ["off_track", "at_risk", "", "on_hold", "on_track", "done"] : [...map.keys()].sort()
    return order
      .filter((k) => map.has(k))
      .map((k) => ({
        key: k,
        name: by === "health" ? (HEALTHS.find((h) => h.value === k)?.label ?? "No update yet") : k,
        items: map.get(k)!,
      }))
  }, [grouping, teams.length, shown])

  let body: ReactNode
  if (view === "goals") {
    // Goals stand on their own: a workspace may have goals before it has projects.
    body = <GoalsView compact={!isDesktop} />
  } else if (view === "reports") {
    // Reports read their own numbers, across every project (or the ones chosen).
    body = <ReportsView compact={!isDesktop} />
  } else if (isError && !projects) {
    body = (
      <WorkState>
        <ErrorState subject="your projects" onRetry={() => void mutate()} />
      </WorkState>
    )
  } else if (isLoading && !projects) {
    // The table's shape: its header, then five rows a project's row high.
    body = (
      <div role="status" aria-label="Loading projects">
        {isDesktop && <div className="h-8 border-b border-line" />}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} aria-hidden="true" className={cn("flex items-center gap-3 border-b border-line", isDesktop ? "h-[52px] px-6" : "h-[72px]")}>
            <Skeleton className={cn("shrink-0", isDesktop ? "size-5 rounded-[6px]" : "size-7 rounded-lg")} />
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="ml-auto h-1.5 w-1/6" />
          </div>
        ))}
      </div>
    )
  } else if (nothingYet) {
    body = (
      <WorkState>
        <EmptyState
          illustration={<SpotWelcome hue="sky" />}
          title="No projects yet"
          description="A project holds tasks, a board, a timeline and updates."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={newProject}>
                <Plus className="!size-3.5" />
                New project
              </Button>
              <Button size="sm" variant="secondary" onClick={newProject}>
                Start from a template
              </Button>
            </div>
          }
        />
      </WorkState>
    )
  } else if (shown.length === 0) {
    body = (
      <div data-filtered-empty="" className="flex h-[120px] flex-col items-center justify-center gap-2">
        <p className="text-sm text-ink-2">No projects match these filters</p>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Clear filters
        </Button>
      </div>
    )
  } else if (view === "timeline") {
    body = <ProjectsTimeline projects={shown} compact={!isDesktop} tools={viewTools} />
  } else if (view === "workload") {
    body = <ProjectsWorkload projects={shown} compact={!isDesktop} tools={viewTools} />
  } else if (!isDesktop) {
    body = (
      <ul data-projects-list="">
        {shown.map((p) => (
          <MobileRow key={p.project_uuid} p={p} />
        ))}
      </ul>
    )
  } else {
    let index = 0
    body = (
      <div ref={listRef} role="table" aria-label="Projects" data-projects-list="">
        <Header sort={sort} onSort={setSort} />
        {groups.map((g) => (
          <div key={g.key} role="rowgroup">
            {g.name && <GroupHeader name={g.name} count={g.items.length} />}
            {g.items.map((p) => (
              <Row key={p.project_uuid} p={p} grow={grow.bar(index++)} now={now} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  // Timeline and Workload draw the toolbar at the start of their own row, and
  // Goals and Reports draw their own controls in the same band. Projects takes
  // the shared one. Every view's band is flush under the tabs: Goals' and
  // Reports' sat inside a 12 px top and 24 px side inset, 12 px lower and
  // 24 px further in than the others' (PTC-7).
  const tableView = view === "table"
  const fills = view === "timeline" || view === "workload"
  const content = (
    // Each view crossfades in (120 ms) as its tab is chosen.
    <div key={view} data-overview-view={view} className={cn("flex min-h-0 flex-1 flex-col [animation:work-fade-in_120ms_var(--ease-out)_both]", !fills && "overflow-y-auto")}>
      {tableView && (
        <div data-work-toolbar="" className={cn(workToolbar, !isDesktop && "-mx-4")}>
          {viewTools}
        </div>
      )}
      <div className={cn("min-h-0", fills && "flex flex-1 flex-col")}>{body}</div>
    </div>
  )

  const meta = (
    <p data-overview-meta="" className="h-[18px] text-xs leading-[18px] text-ink-2">
      {projects && (
        <>
          <CountTick value={all.length} className="font-[510] text-foreground" /> {all.length === 1 ? "project" : "projects"}
          <span className="px-1.5 text-ink-4">·</span>
          <CountTick value={overdue} className={cn("font-[510]", overdue > 0 ? "text-danger-ink" : "text-foreground")} />{" "}
          <span className={cn(overdue > 0 && "text-danger-ink")}>{overdue === 1 ? "task" : "tasks"} overdue</span>
        </>
      )}
    </p>
  )

  if (!isDesktop) {
    // The phone's top bar names the page, so the page's own title is for
    // screen readers only: it read "Projects" twice, 48 px apart (PTC-42).
    // New project sits at the end of the views' row, which scrolls under it.
    return (
      <div className="flex h-full flex-col px-4">
        <h1 className="sr-only">Projects</h1>
        <div data-overview-tabs-row="" className="flex shrink-0 items-center gap-1 border-b border-line">
          <WorkTabs tabs={VIEWS} value={view} onChange={choose} label="Projects views" className="min-w-0 flex-1 border-b-0" />
          <Button variant="ghost" size="icon-sm" aria-label="New project" onClick={newProject} className="shrink-0">
            <Plus />
          </Button>
        </div>
        {content}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-7">
        <div className="min-w-0">
          <h1 className="text-title-1 font-[590] text-foreground">Projects</h1>
          <div className="mt-1">{meta}</div>
        </div>
        {/* One primary per view (DESIGN_V3 §3.4): Goals has its own (New goal),
            and an empty page's own spot offers New project. */}
        <Button size="sm" variant={view === "goals" || (tableView && !!projects && nothingYet) ? "secondary" : "default"} onClick={newProject} className="mt-1">
          <Plus className="!size-3.5" />
          New project
        </Button>
      </header>
      <WorkTabs tabs={VIEWS} value={view} onChange={choose} label="Projects views" className="mt-4 px-3.5" />
      {content}
    </div>
  )
}
