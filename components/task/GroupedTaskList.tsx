"use client"

import * as React from "react"
import { fieldKeyDown } from "@/lib/keys/ime"
import { useDispatch, useSelector } from "react-redux"

import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { ToastAction } from "@/components/ui/toast"
import { CountTick } from "@/components/ui/CountTick"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { LabelChip } from "@/components/ui/chip"
import { DueLabel } from "@/components/task/DueLabel"
import { TaskCheck, TaskTitle } from "@/components/task/TaskCheck"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { BlockedBadge } from "@/components/task/BlockedBadge"
import { FieldValueView } from "@/components/task/fieldValue"
import { formatFieldValue, type TaskField } from "@/lib/tasks/fields"
import { PriorityMenu, StatusMenu, TaskAvatar } from "@/components/task/taskRowParts"
import { useBulkTaskUpdate } from "@/hooks/useBulkTaskUpdate"
import { useToast } from "@/hooks/use-toast"
import { ListSelectionContext, useRowState, useSelectedIds } from "@/hooks/useListSelection"
import { ChevronDown, GitBranch, MessageSquare, Plus, Sun } from "@/lib/icons"
import { measureFlip, playFlip, type FlipRects } from "@/lib/flip"
import { prefersReducedMotion } from "@/lib/celebrate"
import { CLOSED_SHOWN, OPEN_SHOWN, groupCount, groupTasks, type Grouping, type TaskGroup } from "@/lib/tasks/grouping"
import { isClosedStatus, statusOptionOf, statusValueOf, type StatusOption } from "@/lib/taskStatus"
import { splitTags } from "@/lib/tags"
import { cn } from "@/lib/utils/helpers/cn"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import type { RootState } from "@/store/store"
import type { TaskInfoInterface } from "@/types/task"

/** What a row shows besides its check and title (work.md W11, Display's properties). */
export type RowProp = "priority" | "labels" | "due" | "assignee" | "estimate" | "project" | "badges" | `field:${string}`
export const PROJECT_PROPS: RowProp[] = ["priority", "labels", "due", "assignee", "badges"]
export const MINE_PROPS: RowProp[] = ["project", "labels", "due", "estimate", "badges"]

/** The row's height, the group header's and the toolbar's (work.md §1.6.6). */
export const ROW_H = "h-10"
export const GROUP_H = "h-9"

const NO_FIELDS: TaskField[] = []
const SETTLE_HOLD = 600
const STATUS_HOLD = 300
const SETTLE_MS = 240

/**
 * The grouped task list (design v3, work.md W18, W19, W14): no box, no header
 * row of column names and no pagination. Tasks sit on the sheet in groups
 * (by status in a project, by when on My Tasks), with 36 px sticky headers on
 * the sunken step and 40 px hairline rows. Finished work shows its newest
 * five and "Show N more"; an open group shows its first sixty the same way,
 * so no group draws hundreds of rows at once.
 *
 * Completing a task from its check runs the finish sequence (TaskCheck), then
 * the row waits 600 ms (the undo window) and travels into Done by FLIP.
 */
export function GroupedTaskList({
  tasks,
  options,
  grouping,
  props,
  canEdit,
  projectId,
  loading = false,
  filtered = false,
  onClearFilters,
  onAdd,
  onManageStatuses,
  empty,
  sortedBy,
  fields = NO_FIELDS,
  nameOf,
  partial = false,
}: {
  /** The project's custom fields; the ones Display shows get a cell (work.md W35). */
  fields?: TaskField[]
  nameOf?: (id: string) => string | undefined
  tasks: TaskInfoInterface[]
  options: StatusOption[]
  grouping: Grouping
  props: RowProp[]
  canEdit: (task: TaskInfoInterface) => boolean
  /** The project the list is of; none on My Tasks. */
  projectId?: string
  loading?: boolean
  filtered?: boolean
  onClearFilters?: () => void
  /** Adds a task by name in a group (its status or due date preset); resolves when sent. */
  onAdd?: (group: TaskGroup, name: string) => Promise<void> | void
  onManageStatuses?: () => void
  /** What an empty list shows (no tasks at all, no filters). */
  empty?: React.ReactNode
  /** The property the list is sorted by: its values go ink. */
  sortedBy?: RowProp
  /** Only some of the list's tasks have loaded (more pages to come): a group's count is of those, and says so (lib/tasks/grouping groupCount). */
  partial?: boolean
}) {
  const box = React.useRef<HTMLDivElement>(null)
  const store = React.useContext(ListSelectionContext)
  const anySelected = useSelectedIds(store).size > 0
  const update = useBulkTaskUpdate(projectId)
  const { toast } = useToast()

  // A row that changed group waits in the old one for a beat (pinned), then
  // travels: its place is measured before it leaves and played after.
  const [pinned, setPinned] = React.useState<Map<string, string>>(() => new Map())
  const [justDone, setJustDone] = React.useState<Set<string>>(() => new Set())
  const flipFrom = React.useRef<FlipRects | null>(null)
  const timers = React.useRef(new Map<string, number>())
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const groups = React.useMemo(() => groupTasks(tasks, grouping, options, { pinned }), [tasks, grouping, options, pinned])

  // Done is collapsed on My Tasks (the last 7 days); open, capped, in a project.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set(grouping === "when" ? ["done"] : []))
  const [more, setMore] = React.useState<Set<string>>(() => new Set())
  const [adding, setAdding] = React.useState<string | null>(null)

  React.useLayoutEffect(() => {
    if (!flipFrom.current) return
    playFlip(box.current, flipFrom.current, { duration: SETTLE_MS })
    flipFrom.current = null
  })

  const settle = React.useCallback((id: string, hold: number) => {
    const old = timers.current.get(id)
    if (old) window.clearTimeout(old)
    timers.current.set(
      id,
      window.setTimeout(() => {
        timers.current.delete(id)
        flipFrom.current = measureFlip(box.current)
        setPinned((p) => {
          const next = new Map(p)
          next.delete(id)
          return next
        })
      }, prefersReducedMotion() ? 0 : hold),
    )
  }, [])

  const groupKeyOf = React.useCallback(
    (task: TaskInfoInterface) => groups.find((g) => g.tasks.some((t) => t.task_uuid === task.task_uuid))?.key,
    [groups],
  )

  const setStatus = React.useCallback(
    (task: TaskInfoInterface, value: string, hold: number) => {
      const key = groupKeyOf(task)
      if (key) setPinned((p) => new Map(p).set(task.task_uuid, key))
      void update([task], { field: "status", value, options }).then((r) => {
        if (r.failed) toast({ title: "Couldn't change the status", description: "It's back where it was.", tone: "error" })
      })
      settle(task.task_uuid, hold)
    },
    [groupKeyOf, options, settle, toast, update],
  )

  // Stable, so a row re-renders only when its own task or state changes.
  const onStatusPick = React.useCallback((task: TaskInfoInterface, v: string) => setStatus(task, v, STATUS_HOLD), [setStatus])
  const onPriorityPick = React.useCallback((task: TaskInfoInterface, v: string) => void update([task], { field: "priority", value: v }), [update])

  const onComplete = React.useCallback(
    (task: TaskInfoInterface, done: boolean) => {
      const before = statusValueOf(task)
      if (done) {
        setJustDone((s) => new Set(s).add(task.task_uuid))
        window.setTimeout(() => setJustDone((s) => {
          const next = new Set(s)
          next.delete(task.task_uuid)
          return next
        }), 900)
      }
      setStatus(task, done ? "done" : "todo", done ? SETTLE_HOLD : STATUS_HOLD)
      if (done) {
        toast({
          title: "Done",
          description: task.task_name,
          duration: 5000,
          action: (
            <ToastAction altText="Undo" onClick={() => setStatus({ ...task, task_status: "done", task_custom_status: "" }, before, STATUS_HOLD)}>
              Undo
            </ToastAction>
          ),
        })
      }
    },
    [setStatus, toast],
  )

  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (loading) return <GroupedListSkeleton />
  if (tasks.length === 0 && !filtered && empty) return <>{empty}</>
  if (tasks.length === 0 && filtered) {
    return (
      <div data-filtered-empty="" className="flex h-[120px] flex-col items-center justify-center gap-2">
        <p className="text-sm text-ink-2">No tasks match these filters</p>
        {onClearFilters && (
          <button type="button" onClick={onClearFilters} className="h-6 rounded-sm px-2 text-xs font-[510] text-ink-2 hover:bg-hover hover:text-foreground">
            Clear filters
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={box} data-grouped-list="" aria-label="Tasks" className="relative">
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key)
        const cap = g.closed ? CLOSED_SHOWN : OPEN_SHOWN
        const shown = more.has(g.key) ? g.tasks : g.tasks.slice(0, cap)
        const hidden = g.tasks.length - shown.length
        return (
          <section key={g.key} data-group={g.key} aria-label={g.label}>
            <GroupHeader
              group={g}
              partial={partial}
              collapsed={isCollapsed}
              onToggle={() => toggleGroup(g.key)}
              onAdd={onAdd && !g.closed && g.key !== "overdue" ? () => setAdding(g.key) : undefined}
            />
            {!isCollapsed && (
              <div role="list" aria-label={g.label}>
                {adding === g.key && onAdd && (
                  <InlineAdd
                    group={g}
                    onCancel={() => setAdding(null)}
                    onSubmit={async (name) => {
                      await onAdd(g, name)
                    }}
                  />
                )}
                {g.when === "today" && g.tasks.length === 0 && (
                  <div data-all-clear="" className="flex h-12 items-center gap-3 border-b border-line pl-5 text-sm text-ink-2 [animation:work-fade-in_220ms_var(--ease-out)_both]">
                    <span className="hue-moss inline-flex size-5 items-center justify-center rounded-md bg-hue-tint text-hue [animation:work-check-fill_220ms_var(--ease-spring)_both]">
                      <StatusGlyph status="done" size={12} />
                    </span>
                    Nothing due today
                  </div>
                )}
                {shown.map((t) => (
                  <TaskRow
                    key={t.task_uuid}
                    task={t}
                    options={options}
                    props={props}
                    editable={canEdit(t)}
                    anySelected={anySelected}
                    justDone={justDone.has(t.task_uuid)}
                    sortedBy={sortedBy}
                    fields={fields}
                    nameOf={nameOf}
                    onComplete={onComplete}
                    onStatus={onStatusPick}
                    onPriority={onPriorityPick}
                    onManageStatuses={onManageStatuses}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => setMore((m) => new Set(m).add(g.key))}
                    className="flex h-9 w-full items-center border-b border-line pl-[54px] text-left text-ui-sm text-ink-3 hover:bg-hover hover:text-ink-2"
                  >
                    Show {hidden} more
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** A group's 36 px header (work.md W18): chevron, glyph, name, count that ticks, and "+" on hover. */
function GroupHeader({ group, partial, collapsed, onToggle, onAdd }: { group: TaskGroup; partial: boolean; collapsed: boolean; onToggle: () => void; onAdd?: () => void }) {
  return (
    <div
      data-group-header=""
      className={cn(
        GROUP_H,
        "group/head sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-sunken pl-2 pr-3 dark:bg-[color-mix(in_oklab,var(--sheet),white_2%)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Show" : "Hide"} ${group.label}`}
        className="flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className={cn("size-3.5 text-ink-3 transition-transform duration-[180ms] ease-out", collapsed && "-rotate-90")} aria-hidden="true" />
        {group.status ? (
          <StatusGlyph status={statusKindOf(group.status)} hue={group.status.hue} />
        ) : group.projectId ? (
          <ProjectTile id={group.projectId} size={16} />
        ) : group.when === "today" ? (
          <span className="hue-sun inline-flex size-4 items-center justify-center rounded-[5px] bg-hue-tint text-hue">
            <Sun className="size-2.5" aria-hidden="true" />
          </span>
        ) : null}
        <span className={cn("truncate text-ui-sm font-[510]", group.danger ? "text-danger-ink" : "text-foreground")}>{group.label}</span>
        <span title={partial ? "Counts the tasks loaded so far" : undefined} data-group-count="">
          <CountTick value={groupCount(group.tasks.length, partial)} className="text-ui-sm text-ink-3" />
        </span>
      </button>
      <span className="flex-1" />
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`New task in ${group.label}`}
          className="inline-flex size-6 items-center justify-center rounded-sm text-ink-3 [@media(hover:hover)]:opacity-0 transition-opacity hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-hover/head:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** The 40 px editable row "+" puts at the top of a group: Enter creates, Esc cancels. */
function InlineAdd({ group, onSubmit, onCancel }: { group: TaskGroup; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  return (
    <form
      data-inline-add=""
      className={cn(ROW_H, "flex items-center gap-2.5 border-b border-line pl-[46px] pr-4")}
      onSubmit={async (e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n || busy) return
        setBusy(true)
        try {
          await onSubmit(n)
          setName("")
        } finally {
          setBusy(false)
        }
      }}
    >
      {group.status ? <StatusGlyph status={statusKindOf(group.status)} hue={group.status.hue} /> : <StatusGlyph status="todo" />}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={fieldKeyDown((e) => {
          if (e.key === "Escape") {
            e.stopPropagation()
            onCancel()
          }
        })}
        onBlur={() => !name.trim() && onCancel()}
        placeholder="Task title"
        aria-label={`New task in ${group.label}`}
        className="h-7 min-w-0 flex-1 rounded-md bg-raised px-2 text-sm shadow-e1 outline-none placeholder:text-ink-3 focus-halo"
      />
      <span className="kbd" aria-hidden="true">↵</span>
    </form>
  )
}

/** The desktop task row (work.md W19). Memoised: a key press re-renders the rows it changes and no other. */
const TaskRow = React.memo(function TaskRow({
  task,
  options,
  props,
  editable,
  anySelected,
  justDone,
  sortedBy,
  fields,
  nameOf,
  onComplete,
  onStatus,
  onPriority,
  onManageStatuses,
}: {
  fields: TaskField[]
  nameOf?: (id: string) => string | undefined
  task: TaskInfoInterface
  options: StatusOption[]
  props: RowProp[]
  editable: boolean
  anySelected: boolean
  justDone: boolean
  sortedBy?: RowProp
  onComplete: (task: TaskInfoInterface, done: boolean) => void
  onStatus: (task: TaskInfoInterface, value: string) => void
  onPriority: (task: TaskInfoInterface, value: string) => void
  onManageStatuses?: () => void
}) {
  const dispatch = useDispatch()
  const store = React.useContext(ListSelectionContext)
  const { highlighted, selected } = useRowState(task.task_uuid)
  const opened = useSelector((s: RootState) => s.rightPanel.rightPanelState.isOpen && s.rightPanel.rightPanelState.data.taskUUID === task.task_uuid)
  const [statusOpen, setStatusOpen] = React.useState(false)
  // The row's hover-only controls (the select box, the priority picker) join
  // the tree once the row is pointed at or focused, as chat's message toolbar
  // does: a list of 60 rows draws none of them until someone reaches a row.
  const [live, setLive] = React.useState(false)
  const status = statusOptionOf(task, options) ?? options[0]
  const done = isClosedStatus(task.task_status)
  const has = (p: RowProp) => props.includes(p)
  const tags = has("labels") ? splitTags(task.task_label) : []
  const open = () => dispatch(openRightPanel({ taskUUID: task.task_uuid }))

  return (
    <div
      role="listitem"
      data-task-id={task.task_uuid}
      data-flip-id={task.task_uuid}
      data-state={selected ? "selected" : undefined}
      data-highlighted={highlighted || undefined}
      data-opened={opened || undefined}
      aria-current={opened || undefined}
      tabIndex={-1}
      onPointerEnter={live ? undefined : () => setLive(true)}
      onFocus={live ? undefined : () => setLive(true)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,[role=menuitem],[role=checkbox]")) return
        open()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) open()
      }}
      className={cn(
        ROW_H,
        "group/row relative flex cursor-pointer items-center gap-2.5 border-b border-line pl-1.5 pr-4 outline-none transition-colors duration-[140ms]",
        "hover:bg-hover active:bg-press",
        selected && "bg-sel",
        opened && "bg-[color-mix(in_oklab,var(--brand-muted)_75%,transparent)] hover:bg-[color-mix(in_oklab,var(--brand-muted)_75%,transparent)]",
      )}
    >
      {/* The opened row's 2px brand edge, scaling in. */}
      {opened && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-brand [animation:work-grow-y_140ms_var(--ease-out)_both] [transform-origin:center]" />}
      {/* The keyboard's cursor: an inset ring, clear of the hairlines. */}
      {highlighted && !opened && <span aria-hidden="true" data-kbd-cursor="" className="pointer-events-none absolute inset-0.5 rounded-md ring-cursor" />}
      <span className={cn("flex w-4 shrink-0 justify-center transition-opacity duration-[140ms]", selected || anySelected ? "opacity-100" : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto")} data-row-select="">
        {live || selected || anySelected ? (
          <Checkbox checked={selected} onCheckedChange={() => store?.toggle(task.task_uuid)} aria-label={`Select ${task.task_name}`} />
        ) : (
          <span aria-hidden="true" className="size-4" />
        )}
      </span>
      {has("priority") && (
        editable && live ? (
          <PriorityMenu current={task.task_priority} onPick={(v) => onPriority(task, v)}>
            <button type="button" aria-label={`Priority of ${task.task_name}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-hover">
              <TaskPriorityCell priority={task.task_priority} label="tip" />
            </button>
          </PriorityMenu>
        ) : (
          <span className="inline-flex size-6 shrink-0 items-center justify-center"><TaskPriorityCell priority={task.task_priority} label="tip" /></span>
        )
      )}
      <span className="relative inline-flex shrink-0">
        <TaskCheck
          done={task.task_status === "done"}
          status={status}
          taskName={task.task_name}
          disabled={!editable}
          onToggle={(next) => onComplete(task, next)}
          onPicker={editable ? () => setStatusOpen(true) : undefined}
        />
        {/* The status picker opens from the check (Alt-click, long press, S). */}
        {editable && statusOpen && (
          <StatusMenu options={options} current={statusValueOf(task)} onPick={(v) => onStatus(task, v)} onManage={onManageStatuses} open={statusOpen} onOpenChange={setStatusOpen}>
            <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute bottom-0 left-0 size-0" />
          </StatusMenu>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <TaskTitle done={done} justDone={justDone} className="text-sm font-[450]">
          {task.task_name}
        </TaskTitle>
        {has("badges") && <RowBadges task={task} />}
      </span>
      {has("project") && task.task_project?.project_uuid && (
        <span className="hidden min-w-0 max-w-[160px] shrink items-center gap-1.5 text-meta text-ink-2 md:inline-flex">
          <ProjectTile id={task.task_project.project_uuid} size={16} />
          <span className="truncate">{task.task_project.project_name}</span>
        </span>
      )}
      {tags.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1 lg:flex">
          {tags.slice(0, 2).map((t) => (
            <LabelChip key={t} label={t} />
          ))}
          {tags.length > 2 && <span className="chip text-ink-3">+{tags.length - 2}</span>}
        </span>
      )}
      {fields
        .filter((f) => has(`field:${f.id}`))
        .map((f) => {
          const v = task.task_fields?.[f.id]
          // Money is tabular text in its own right-aligned 72px column, never a pill.
          if (f.type === "money" || f.type === "number") {
            return (
              <span key={f.id} data-field-cell={f.type} className="w-[72px] shrink-0 truncate text-right text-meta tabular-nums text-ink-2">
                {formatFieldValue(f, v, nameOf)}
              </span>
            )
          }
          return (
            <span key={f.id} data-field-cell={f.type} className="hidden max-w-[160px] shrink-0 lg:inline-flex">
              <FieldValueView field={f} value={v} nameOf={nameOf} />
            </span>
          )
        })}
      {has("due") && (
        <span className="flex w-16 shrink-0 justify-end">
          <DueLabel date={task.task_due_date} done={done} className={cn(sortedBy === "due" && !done && "text-foreground")} />
        </span>
      )}
      {has("estimate") && task.task_estimate_minutes ? (
        <span className="w-12 shrink-0 text-right text-meta tabular-nums text-ink-3">{formatMinutes(task.task_estimate_minutes)}</span>
      ) : null}
      {has("assignee") && <TaskAvatar user={task.task_assignee} />}
    </div>
  )
})

/** The badges after a title: blocked, subtasks, comments (work.md W19). */
function RowBadges({ task }: { task: TaskInfoInterface }) {
  const subs = task.task_sub_task_count || 0
  const comments = task.task_comment_count || 0
  if (!task.task_blocked_open && !subs && !comments) return null
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs text-ink-3">
      <BlockedBadge count={task.task_blocked_open} />
      {subs > 0 && (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <GitBranch className="size-3" aria-hidden="true" />
          {subs}
        </span>
      )}
      {comments > 0 && (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <MessageSquare className="size-3" aria-hidden="true" />
          {comments}
        </span>
      )}
    </span>
  )
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`
}

/** Loading (work.md W18): three skeleton groups of three 40 px rows. */
export function GroupedListSkeleton() {
  const widths = ["w-2/5", "w-3/5", "w-1/2"]
  return (
    <div aria-hidden="true" data-list-skeleton="">
      {[0, 1, 2].map((g) => (
        <div key={g}>
          <div className={cn(GROUP_H, "flex items-center gap-2 border-b border-line bg-sunken px-5")}>
            <Skeleton className="size-4 rounded-[5px]" />
            <Skeleton className="h-3 w-20" />
          </div>
          {[0, 1, 2].map((r) => (
            <div key={r} className={cn(ROW_H, "flex items-center gap-2.5 border-b border-line pl-[46px] pr-4")}>
              <Skeleton className="size-4 rounded-[5px]" />
              <Skeleton className={cn("h-3.5", widths[(g + r) % 3])} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
