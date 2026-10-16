"use client"

import * as React from "react"
import type { ColumnFiltersState, SortingState, Table } from "@tanstack/react-table"
import { useDispatch } from "react-redux"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PriorityGlyph, StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { CyclesButton } from "@/components/task/cyclesButton"
import { TaskTableFieldFilter } from "@/components/task/taskTableFieldFilter"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useTaskViews } from "@/hooks/useTaskViews"
import { useToast } from "@/hooks/use-toast"
import { ArrowDown, ArrowUp, Bookmark, Filter, Plus, Search, SlidersHorizontal, Users } from "@/lib/icons"
import { cycleFilter } from "@/lib/tasks/cycles"
import { GROUPINGS, type Grouping } from "@/lib/tasks/grouping"
import { DUE_WEEK } from "@/lib/tasks/listAddress"
import { sameView, taskViewScope, type TaskViewState } from "@/lib/tasks/views"
import { displayNameOf } from "@/lib/personName"
import { isBuiltInStatus } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import type { ProjectInfoRawInterface } from "@/types/project"
import type { UserProfileInterface } from "@/types/user"
import type { RowProp } from "@/components/task/GroupedTaskList"
import { WorkSegmented } from "@/components/task/WorkTabs"

/** The toolbar's height (work.md W10, §1.6.6). */
export const TOOLBAR_H = "h-11"

export type ShowCompleted = "all" | "week" | "none"
export type Layout = "list" | "kanban" | "timeline"

const PRIORITY_VALUES = [
  { value: "high", label: "High", level: 3 as const },
  { value: "medium", label: "Medium", level: 2 as const },
  { value: "low", label: "Low", level: 1 as const },
]

const PROP_LABELS: Record<Exclude<RowProp, `field:${string}`>, string> = {
  priority: "Priority",
  labels: "Labels",
  due: "Due",
  assignee: "Assignee",
  estimate: "Estimate",
  project: "Project",
  badges: "Badges",
}

const ORDERINGS = [
  { value: "", label: "Manual" },
  { value: "task_due_date", label: "Due date" },
  { value: "task_start_date", label: "Start date" },
  { value: "task_created_at", label: "Created" },
]

/** What a list's Display offers (DisplayMenu). */
interface ListDisplay {
  grouping: Grouping
  onGrouping: (g: Grouping) => void
  props: RowProp[]
  allProps: RowProp[]
  onProps: (p: RowProp[]) => void
  showCompleted: ShowCompleted
  onShowCompleted: (v: ShowCompleted) => void
  layout?: Layout
  onLayout?: (l: Layout) => void
  onReset: () => void
}

type WorkToolbarProps<TData> = {
  table: Table<TData>
  projectId?: string
  /** The screen's own controls after the filter chips: a board's tags, the columns it hides. */
  extra?: React.ReactNode
} & ({ display: React.ReactElement } | ({ display?: undefined } & ListDisplay))

/**
 * The work area's one toolbar (design v3, work.md W10): 44 px, ghost Filter
 * with the active filters as chips after it, then search as an icon that
 * opens in place, Display, and the one primary, New task. It replaced nine
 * bordered buttons of equal weight in one or two rows. A project's list and
 * its board share it (PTC-6: the board drew its own chips, with no Filter,
 * Search or Cycle); the board brings its own Display.
 */
export function WorkToolbar<TData>(toolbar: WorkToolbarProps<TData>) {
  const { table, projectId, extra } = toolbar
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const { options: statusOpts } = useProjectStatuses(projectId)
  const { fields } = useProjectFields(projectId)
  const { people } = usePeople(projectId, fields)
  const state = table.getState()
  const filters = state.columnFilters
  const valuesOf = (id: string) => ((filters.find((f) => f.id === id)?.value as string[] | undefined) ?? [])
  const setValues = (id: string, values: string[]) =>
    table.setColumnFilters((prev) => [...prev.filter((f) => f.id !== id), ...(values.length ? [{ id, value: values }] : [])])
  const toggle = (id: string, v: string) => {
    const cur = valuesOf(id)
    setValues(id, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
  }

  const members = useFetch<ProjectInfoRawInterface>(projectId ? `${GetEndpointUrl.GetProjectMemberInfo}/${projectId}` : "")
  const self = useFetchOnlyOnce<UserProfileInterface>(projectId ? "" : GetEndpointUrl.SelfProfile)
  const people2 = members.data?.data.project_members ?? []
  const projects = self.data?.data.user_projects ?? []

  const statusName = (v: string) => {
    const o = statusOpts.find((x) => x.value === v)
    return o ? (isBuiltInStatus(o.value) ? t(o.value, { defaultValue: o.label }) : o.label) : v
  }
  const chips: { id: string; facet: string; words: string; glyph?: React.ReactNode }[] = []
  const status = valuesOf("task_status")
  if (status.length) {
    const first = statusOpts.find((o) => o.value === status[0])
    chips.push({ id: "task_status", facet: "Status", words: status.map(statusName).join(", "), glyph: first ? <StatusGlyph status={statusKindOf(first)} hue={first.hue} size={14} /> : undefined })
  }
  const prio = valuesOf("task_priority")
  if (prio.length) chips.push({ id: "task_priority", facet: "Priority", words: prio.map((p) => PRIORITY_VALUES.find((x) => x.value === p)?.label ?? p).join(", "), glyph: <PriorityGlyph level={PRIORITY_VALUES.find((x) => x.value === prio[0])?.level ?? 0} size={14} /> })
  const who = valuesOf("task_assignee_name")
  if (who.length) chips.push({ id: "task_assignee_name", facet: "Assignee", words: who.map((u) => displayNameOf(people2.find((p) => p.uid === u)) || "someone").join(", ") })
  const proj = valuesOf("task_project_name")
  if (proj.length) chips.push({ id: "task_project_name", facet: "Project", words: proj.map((u) => projects.find((p) => p.uid === u)?.project_name || "a project").join(", ") })

  // The header's counts filter by these (lib/tasks/listAddress).
  if (filters.some((f) => f.id === "overdue")) chips.push({ id: "overdue", facet: "Due", words: "overdue" })
  if (filters.some((f) => f.id === DUE_WEEK)) chips.push({ id: DUE_WEEK, facet: "Due", words: "this week" })

  const activeCycleId = valuesOf("task_cycle")[0]
  const showCycle = React.useCallback(
    (id: string | null) => table.setColumnFilters((prev) => [...prev.filter((f) => f.id !== "task_cycle"), ...(id ? [cycleFilter(id)] : [])]),
    [table],
  )

  // "/" opens search; F opens Filter; C makes a task (when the list has the keys).
  const [searching, setSearching] = React.useState(!!state.globalFilter)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const newTask = React.useCallback(
    () => dispatch(openUI({ key: "createTask", data: projectId ? { projectId } : { assignToMe: true } })),
    [dispatch, projectId],
  )
  const bar = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    // "G then C" goes to Channels (lib/goKeys): a key just after G is not ours.
    let lastG = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "g" || e.key === "G") {
        lastG = Date.now()
        return
      }
      if (Date.now() - lastG < 1500) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest("[role=dialog],[role=menu],[data-right-panel]"))) return
      // Only the list that is on screen answers (a kept tab is hidden).
      if (!bar.current || !bar.current.checkVisibility?.()) return
      if (e.key === "/") {
        e.preventDefault()
        setSearching(true)
        requestAnimationFrame(() => searchRef.current?.focus())
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault()
        setFilterOpen(true)
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault()
        newTask()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [newTask])

  const clearAll = () => {
    table.setColumnFilters((prev) => prev.filter((f) => f.id === "task_cycle"))
    table.setGlobalFilter("")
  }

  return (
    // A container: with a side panel open the list can be 300 px wide, and the
    // band's words give way (Display and New task to their icons) before
    // New task is pushed out of sight.
    <div ref={bar} data-work-toolbar="" className={cn(TOOLBAR_H, "@container flex items-center gap-1.5 border-b border-line pl-4 pr-4")}>
      <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="shrink-0 text-ui-sm" title="Filter (F)">
            <Filter className="size-3.5" />
            Filter
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px] p-1">
          <FacetSub label="Status" glyph={<StatusGlyph status="progress" size={14} />}>
            {statusOpts.map((o) => (
              <DropdownMenuCheckboxItem key={o.value} checked={status.includes(o.value)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle("task_status", o.value)} className="h-[30px] gap-2 text-sm">
                <StatusGlyph status={statusKindOf(o)} hue={o.hue} />
                {statusName(o.value)}
              </DropdownMenuCheckboxItem>
            ))}
          </FacetSub>
          <FacetSub label="Priority" glyph={<PriorityGlyph level={3} size={14} />}>
            {PRIORITY_VALUES.map((p) => (
              <DropdownMenuCheckboxItem key={p.value} checked={prio.includes(p.value)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle("task_priority", p.value)} className="h-[30px] gap-2 text-sm">
                <PriorityGlyph level={p.level} />
                {p.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FacetSub>
          {projectId ? (
            <FacetSub label="Assignee" glyph={<Users className="size-3.5 text-ink-3" />}>
              {people2.map((p) => (
                <DropdownMenuCheckboxItem key={p.uid} checked={who.includes(p.uid || "")} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle("task_assignee_name", p.uid || "")} className="h-[30px] gap-2 text-sm">
                  <IdentityMark variant="avatar" id={avatarSeed(p)} label={displayNameOf(p)} size={18} />
                  <span className="truncate">{displayNameOf(p)}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </FacetSub>
          ) : (
            <FacetSub label="Project" glyph={<span className="inline-block size-3.5 rounded-[4px] border border-ink-3" />}>
              {projects.map((p) => (
                <DropdownMenuCheckboxItem key={p.uid} checked={proj.includes(p.uid || "")} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle("task_project_name", p.uid || "")} className="h-[30px] gap-2 text-sm">
                  <ProjectTile id={p.project_uuid} size={16} />
                  <span className="truncate">{p.project_name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </FacetSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {chips.map((c) => (
          <span key={c.id} className="[animation:work-pop-in_180ms_var(--ease-out)_both]">
            <Chip onRemove={() => setValues(c.id, [])} removeLabel={`Clear the ${c.facet.toLowerCase()} filter`} className="h-6 gap-1.5 text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                {c.glyph}
                <span>
                  {c.facet} is <span className="text-foreground">{c.words}</span>
                </span>
              </span>
            </Chip>
          </span>
        ))}
        {projectId && fields.length > 0 && <TaskTableFieldFilter table={table} fields={fields} people={people} variant="ghost" />}
        {projectId && <CyclesButton projectId={projectId} activeCycleId={activeCycleId} onShow={showCycle} />}
        {extra}
        {chips.length >= 2 && (
          <Button variant="ghost" size="xs" onClick={clearAll} className="shrink-0">
            Clear
          </Button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {searching ? (
          <span className="relative flex items-center [animation:work-pop-in_180ms_var(--ease-out)_both] [transform-origin:right_center]">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" aria-hidden="true" />
            <input
              ref={searchRef}
              autoFocus
              value={(state.globalFilter as string) || ""}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              onBlur={(e) => !e.target.value && setSearching(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  table.setGlobalFilter("")
                  setSearching(false)
                }
              }}
              placeholder={t("filterTasksPlaceholder", { defaultValue: "Search tasks…" })}
              aria-label="Search tasks"
              className="h-7 w-[220px] rounded-md bg-raised pl-8 pr-2 text-ui-sm shadow-e1 outline-none placeholder:text-ink-3 focus-halo"
            />
          </span>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Search tasks" title="Search (/)" onClick={() => setSearching(true)}>
            <Search className="size-3.5" />
          </Button>
        )}
        {toolbar.display !== undefined ? toolbar.display : <DisplayMenu {...toolbar} />}
        <Button size="sm" className="ml-1 text-ui-sm" onClick={newTask} aria-label="New task">
          <Plus className="size-3.5" />
          <span className="@max-[520px]:hidden">New task</span>
          <span className="kbd @max-[520px]:hidden" aria-hidden="true">C</span>
        </Button>
      </div>
    </div>
  )
}

function FacetSub({ label, glyph, children }: { label: string; glyph: React.ReactNode; children: React.ReactNode }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="h-[30px] gap-2 text-sm">
        <span className="inline-flex size-4 items-center justify-center">{glyph}</span>
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto p-1">{children}</DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

/** The work area's one segmented control (components/task/WorkTabs). */
export { WorkSegmented }

/** Display (work.md W11): saved views, layout, grouping, ordering, completed, properties. */
function DisplayMenu<TData>({
  projectId,
  table,
  grouping,
  onGrouping,
  props,
  allProps,
  onProps,
  showCompleted,
  onShowCompleted,
  layout,
  onLayout,
  onReset,
}: {
  projectId?: string
  table: Table<TData>
  grouping: Grouping
  onGrouping: (g: Grouping) => void
  props: RowProp[]
  allProps: RowProp[]
  onProps: (p: RowProp[]) => void
  showCompleted: ShowCompleted
  onShowCompleted: (v: ShowCompleted) => void
  layout?: Layout
  onLayout?: (l: Layout) => void
  onReset: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const scope = taskViewScope(projectId)
  const { views, save, busy } = useTaskViews(scope, open)
  const { toast } = useToast()
  const state = table.getState()
  const current: TaskViewState = { filters: state.columnFilters, sort: state.sorting, columns: state.columnVisibility }
  const active = views.find((v) => sameView(v.state, current))
  const [naming, setNaming] = React.useState<string | null>(null)
  const { fields } = useProjectFields(projectId)
  const fieldNames = Object.fromEntries(fields.map((f) => [f.id, f.name]))
  const shownProps = [...allProps, ...fields.map((f) => `field:${f.id}` as RowProp)]
  const sort = state.sorting[0]
  const apply = (v: TaskViewState) => {
    table.setColumnFilters((v.filters ?? []) as ColumnFiltersState)
    table.setSorting((v.sort ?? []) as SortingState)
    if (v.columns) table.setColumnVisibility(v.columns)
  }
  const groupings = GROUPINGS.filter((g) => (projectId ? g.value !== "project" : g.value !== "assignee"))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-ui-sm">
          <SlidersHorizontal className="size-3.5" />
          <span className="@max-[520px]:sr-only">Display</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3" data-display-menu="">
        {views.length > 0 && (
          <Section title="Views">
            <ul className="-mx-1 grid gap-px">
              {views.slice(0, 9).map((v, i) => (
                <li key={v.id}>
                  <button type="button" onClick={() => apply(v.state)} className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-press">
                    <Bookmark className="size-3.5 text-ink-3" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    {active?.id === v.id && <span aria-label="Showing" className="size-1.5 rounded-full bg-brand" />}
                    <span className="kbd">{i + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {onLayout && layout && (
          <Section title="Layout">
            <WorkSegmented
              label="Layout"
              value={layout}
              onChange={onLayout}
              className="flex w-full"
              options={[
                { value: "list", label: "List" },
                { value: "kanban", label: "Board" },
                ...(projectId ? [{ value: "timeline" as const, label: "Timeline" }] : []),
              ]}
            />
          </Section>
        )}
        <Section title="Arrange">
          <Row label="Grouping">
            <MenuSelect value={grouping} onChange={(v) => onGrouping(v as Grouping)} options={groupings} label="Grouping" />
          </Row>
          <Row label="Ordering">
            <span className="flex items-center gap-1">
              <MenuSelect value={sort?.id ?? ""} onChange={(v) => table.setSorting(v ? [{ id: v, desc: !!sort?.desc }] : [])} options={ORDERINGS} label="Ordering" />
              {sort && (
                <button type="button" aria-label={sort.desc ? "Descending" : "Ascending"} title={sort.desc ? "Descending" : "Ascending"} onClick={() => table.setSorting([{ id: sort.id, desc: !sort.desc }])} className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-raised text-ink-2 shadow-e1 hover:text-foreground">
                  {sort.desc ? <ArrowDown className="size-3.5" aria-hidden="true" /> : <ArrowUp className="size-3.5" aria-hidden="true" />}
                </button>
              )}
            </span>
          </Row>
          <Row label="Completed">
            <WorkSegmented
              label="Show completed"
              value={showCompleted}
              onChange={onShowCompleted}
              options={[
                { value: "all", label: "All" },
                { value: "week", label: "7 days" },
                { value: "none", label: "None" },
              ]}
            />
          </Row>
        </Section>
        <Section title="Properties">
          <div className="flex flex-wrap gap-1">
            {shownProps.map((p) => {
              const on = props.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onProps(on ? props.filter((x) => x !== p) : [...props, p])}
                  className={cn("h-7 rounded-md px-2 text-ui-sm font-[510] transition-colors", on ? "bg-raised text-foreground shadow-e1" : "text-ink-3 hover:text-ink-2")}
                >
                  {p.startsWith("field:") ? fieldNames[p.slice(6)] ?? "Field" : PROP_LABELS[p as keyof typeof PROP_LABELS]}
                </button>
              )
            })}
          </div>
        </Section>
        <div className="-mx-3 mt-3 flex items-center justify-between border-t border-line px-2 pt-2">
          {naming === null ? (
            <Button variant="ghost" size="sm" onClick={() => setNaming("")}>
              Save as view…
            </Button>
          ) : (
            <form
              className="flex flex-1 items-center gap-1"
              onSubmit={async (e) => {
                e.preventDefault()
                const name = naming.trim()
                if (!name) return
                const v = await save(name, current)
                if (v) toast({ title: `Saved “${v.name}”` })
                setNaming(null)
              }}
            >
              <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} maxLength={60} aria-label="View name" placeholder="Name this view" className="h-7 min-w-0 flex-1 rounded-md bg-raised px-2 text-ui-sm shadow-e1 outline-none" />
              <Button type="submit" size="sm" variant="secondary" disabled={busy || !naming.trim()}>
                Save
              </Button>
            </form>
          )}
          {naming === null && (
            <Button variant="ghost" size="sm" className="text-ink-3" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-xs font-[510] text-ink-3">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-[30px] items-center justify-between gap-2">
      <span className="text-ui-sm text-ink-2">{label}</span>
      {children}
    </div>
  )
}

/**
 * A choice inside the Display menu: the app's own select (a native one drew
 * the system's chevron and list), 28 px to match the rows' controls. Radix
 * takes no empty value, so "none" stands in for the option whose value is "".
 */
const NONE = "__none"
function MenuSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger dense aria-label={label} className="h-7 w-[128px] bg-raised text-ui-sm font-[510] text-foreground shadow-e1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value || NONE} value={o.value || NONE}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

