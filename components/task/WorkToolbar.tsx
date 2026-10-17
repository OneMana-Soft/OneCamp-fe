"use client"

import * as React from "react"
import { fieldKeyDown } from "@/lib/keys/ime"
import type { Table } from "@tanstack/react-table"
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
import { PriorityGlyph, StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { CyclesButton, warmSwitcher } from "@/components/task/cyclesButton"
import { TaskTableFieldFilter, warmFieldFilter } from "@/components/task/taskTableFieldFilter"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { Filter, Plus, Search, SlidersHorizontal, Users } from "@/lib/icons"
import { cycleFilter } from "@/lib/tasks/cycles"
import type { Grouping } from "@/lib/tasks/grouping"
import { DUE_WEEK } from "@/lib/tasks/listAddress"
import { displayNameOf } from "@/lib/personName"
import { isBuiltInStatus } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import type { ProjectInfoRawInterface } from "@/types/project"
import type { UserProfileInterface } from "@/types/user"
import type { RowProp } from "@/components/task/GroupedTaskList"
import { WorkSegmented } from "@/components/task/WorkTabs"
import { lazyView } from "@/components/task/LazyView"

/** The toolbar's height (work.md W10, §1.6.6). */
export const TOOLBAR_H = "h-11"

export type ShowCompleted = "all" | "week" | "none"
export type Layout = "list" | "kanban" | "timeline"

const PRIORITY_VALUES = [
  { value: "high", label: "High", level: 3 as const },
  { value: "medium", label: "Medium", level: 2 as const },
  { value: "low", label: "Low", level: 1 as const },
]

/** What a list's Display offers (DisplayMenu). */
export interface ListDisplay {
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

  // The menus' bodies are chunks of their own. They load once the list has
  // painted and the page is idle, so the first screen stays small and a
  // first open still finds them in: a finger's tap has no hover to start them.
  const ownDisplay = toolbar.display === undefined
  const hasFields = fields.length > 0
  React.useEffect(() => {
    const warm = () => {
      if (ownDisplay) void warmDisplay()
      if (projectId) void warmSwitcher()
      if (projectId && hasFields) void warmFieldFilter()
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(warm, 1500)
    return () => window.clearTimeout(t)
  }, [ownDisplay, projectId, hasFields])

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
              onKeyDown={fieldKeyDown((e) => {
                if (e.key === "Escape") {
                  table.setGlobalFilter("")
                  setSearching(false)
                }
              })}
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

// Display's body (views, layout, grouping, ordering, completed, properties)
// is a chunk of its own, with the app's select: a list's first screen draws
// only the button (app/firstLoad.test.ts).
const Display = lazyView(() => import("@/components/task/displayMenu"))
/** Starts loading Display's body, as its button does on pointer or focus. */
export const warmDisplay = () => Display.warm()

/** Display (work.md W11): saved views, layout, grouping, ordering, completed, properties. */
function DisplayMenu<TData>(display: { projectId?: string; table: Table<TData> } & ListDisplay) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-ui-sm" onPointerEnter={() => void warmDisplay()} onFocus={() => void warmDisplay()}>
          <SlidersHorizontal className="size-3.5" />
          <span className="@max-[520px]:sr-only">Display</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3" data-display-menu="">
        <Display.View fallback={<p className="text-sm text-ink-2">Loading…</p>} render={(m) => <m.DisplayMenuBody {...display} />} />
      </PopoverContent>
    </Popover>
  )
}

