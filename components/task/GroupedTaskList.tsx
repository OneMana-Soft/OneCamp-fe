"use client"

import * as React from "react"
import { fieldKeyDown } from "@/lib/keys/ime"
import { useDispatch, useSelector } from "react-redux"

import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { CountTick } from "@/components/ui/CountTick"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import TaskTypeGlyph from "@/components/task/TypeGlyphOnDemand"
import { LabelChip } from "@/components/ui/chip"
import { DueLabel, dueDateOf } from "@/components/task/DueLabel"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { TaskCheck, TaskTitle } from "@/components/task/TaskCheck"
import { TaskKeyCell, keyWidth } from "@/components/task/TaskKeyCell"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { BlockedBadge, RestrictedMark } from "@/components/task/BlockedBadge"
import { FieldValueView } from "@/components/task/fieldValue"
import { alignsRight, type TaskField } from "@/lib/tasks/fields"
import { PriorityMenu, StatusMenu, TaskAvatar } from "@/components/task/taskRowParts"
import { useBulkTaskUpdate } from "@/hooks/useBulkTaskUpdate"
import { useLatch } from "@/hooks/useLatch"
import { useStableCallback } from "@/hooks/useStableCallback"
import { isBusyPointer, useScrolling } from "@/lib/ui/scrollState"
import { isStillArrival } from "@/lib/ui/stillArrival"
import { ReorderGrip, ReorderHost, useReorderLayer, type ListReorder } from "@/components/task/reorderSlot"
import type { GroupPlan } from "@/lib/ui/windowedRows"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { useToast } from "@/hooks/use-toast"
import { ListSelectionContext, useRowSelected } from "@/hooks/useListSelection"
import { ChevronDown, GitBranch, MessageSquare, Plus, Sun } from "@/lib/icons"
import { measureFlip, playFlip, type FlipRects } from "@/lib/flip"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { CLOSED_SHOWN, OPEN_SHOWN, groupCount, groupTasks, type Grouping, type TaskGroup } from "@/lib/tasks/grouping"
import { isClosedStatus, statusOptionOf, statusValueOf, type StatusOption } from "@/lib/taskStatus"
import { splitTags } from "@/lib/tags"
import { cn } from "@/lib/utils/helpers/cn"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import type { RootState } from "@/store/store"
import type { TaskInfoInterface } from "@/types/task"

const SlaChip = lazyPiece(() => import("@/components/task/SlaChip"))

/** What a row shows besides its check and title (work.md W11, Display's properties). */
export type RowProp = "priority" | "labels" | "due" | "assignee" | "estimate" | "project" | "badges" | `field:${string}`
export const PROJECT_PROPS: RowProp[] = ["priority", "labels", "due", "assignee", "badges"]
export const MINE_PROPS: RowProp[] = ["project", "labels", "due", "estimate", "badges"]

/** The row's height, the group header's and the toolbar's (work.md §1.6.6). */
export const ROW_H = "h-10"
export const GROUP_H = "h-9"

const NO_FIELDS: TaskField[] = []
/** Above this many rows only those near the screen are drawn (components/task/listWindow); fewer, and find-in-page finds all. */
const WINDOW_ABOVE = 200
/** Till the window's part plans (its code still coming), a long list draws a screen of its rows (40 px each, ROW_H) and pads for the rest. */
const FIRST_ROWS = 30
/**
 * A list's first draw of more than a screen of rows but at most WINDOW_ABOVE: a screen (FIRST_ROWS, what the window
 * first draws) at once, padded for the rest, which then fill a screen at a time, each its own transition after the last
 * one's commit, so find-in-page still finds every row and no commit draws more than a screen. A project's first page
 * drawn whole (about 200 rows) in one commit was a 300 ms task, and a screen then the rest in one transition 170 ms (fluid-19).
 */
const FILL_STEP = FIRST_ROWS

/** A group's rows shown: an open group's first sixty, a finished one's newest five, all once "Show N more" is pressed. */
const shownOf = (g: TaskGroup, more: Set<string>) => (more.has(g.key) ? g.tasks : g.tasks.slice(0, g.closed ? CLOSED_SHOWN : OPEN_SHOWN))

type WindowChunk = typeof import("@/components/task/listWindow")
/** The window (lib/lazy/lazyPart), fetched when first needed; till then, or offline, every row is drawn. */
const listWindow = lazyPart<React.ComponentProps<WindowChunk["ListWindow"]>>(() => import("@/components/task/listWindow").then((m) => m.ListWindow), { failed: DrawAll })
/** The window's code couldn't come: an empty plan, so every row is drawn. */
function DrawAll({ onPlans }: { onPlans: (plans: Map<string, GroupPlan>) => void }) {
  React.useLayoutEffect(() => onPlans(new Map()), [onPlans])
  return null
}
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
  tasks: given,
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
  reorder,
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
  /** Rows move in the project's manual order (L-1; the drag loads when the page is idle). */
  reorder?: ListReorder
}) {
  const box = React.useRef<HTMLDivElement>(null)
  const store = React.useContext(ListSelectionContext)
  // Whether it holds a selection: one attribute on the list that the rows' select slots read in CSS, so the first X draws no other row (H3-c).
  React.useLayoutEffect(() => {
    const el = box.current
    if (!store || !el) return
    const mark = () => el.toggleAttribute("data-any-selected", store.get().selected.size > 0)
    mark()
    return store.subscribe(mark)
  })
  const update = useBulkTaskUpdate(projectId)
  // The rows' hover reads whether a scroll is under way.
  useScrolling()
  const { toast } = useToast()

  // A row that changed group waits in the old one for a beat (pinned), then
  // travels: its place is measured before it leaves and played after.
  const [pinned, setPinned] = React.useState<Map<string, string>>(() => new Map())
  const [justDone, setJustDone] = React.useState<Set<string>>(() => new Set())
  const flipFrom = React.useRef<FlipRects | null>(null)
  const timers = React.useRef(new Map<string, number>())
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  // A moved row shows in its place at once, until the tasks come back in that order (L-1).
  const [placed, setPlaced] = React.useState<{ from: TaskInfoInterface[]; to: TaskInfoInterface[] } | null>(null)
  const tasks = placed?.from === given ? placed.to : given
  const onPlaced = useStableCallback((to: TaskInfoInterface[]) => setPlaced({ from: given, to }))

  const groups = React.useMemo(() => groupTasks(tasks, grouping, options, { pinned }), [tasks, grouping, options, pinned])
  const Layer = useReorderLayer(!!reorder)

  // Done is collapsed on My Tasks (the last 7 days); open, capped, in a project.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set(grouping === "when" ? ["done"] : []))
  const [more, setMore] = React.useState<Set<string>>(() => new Set())
  const [adding, setAdding] = React.useState<string | null>(null)
  // Each group's plan while windowed: what it draws and the space around it.
  const [plans, setPlans] = React.useState<Map<string, GroupPlan> | null>(null)
  // The opened task, kept drawn wherever the window is: read here for the window's part, which reads no store. A short list reads nothing.
  const openedId = useSelector((s: RootState) => (tasks.length > WINDOW_ABOVE && s.rightPanel.rightPanelState.isOpen ? (s.rightPanel.rightPanelState.data.taskUUID ?? null) : null))
  // The rows shown in open groups, as the window counts them.
  const shownRows = groups.reduce((n, g) => n + (collapsed.has(g.key) ? 0 : shownOf(g, more).length), 0)
  // The list's first draw with rows: past a screen (and up to WINDOW_ABOVE, past which the window draws), a screen now
  // and the rest FILL_STEP rows a transition, which a key or a tap goes before. Any other first draw is as ever (whole,
  // or the window's). Only the first: once the fill is done, or the shown rows change under it (page two, a task made,
  // a group opened), the list is whole for good, so a row drawn is never taken away again.
  const [fill, setFill] = React.useState<{ rows: number; of: number } | null>(null)
  const cuts = shownRows > FIRST_ROWS && shownRows <= WINDOW_ABOVE
  const whole = useLatch(shownRows > 0 && (!cuts || (fill !== null && (fill.rows >= shownRows || fill.of !== shownRows))))
  const filling = !whole && cuts
  React.useEffect(() => {
    if (!filling) return
    const next = { rows: (fill?.rows ?? FIRST_ROWS) + FILL_STEP, of: fill?.of ?? shownRows }
    React.startTransition(() => setFill(next))
  }, [filling, fill, shownRows])

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

  // The rows' handlers never change (F-1 #1), so a row re-renders only for its
  // own task or state; they read the groups when called.
  const setStatus = useStableCallback((task: TaskInfoInterface, value: string, hold: number) => {
    const key = groups.find((g) => g.tasks.some((t) => t.task_uuid === task.task_uuid))?.key
    if (key) setPinned((p) => new Map(p).set(task.task_uuid, key))
    void update([task], { field: "status", value, options }).then((r) => {
      if (r.failed) toast({ title: "Couldn't change the status", description: "It's back where it was.", tone: "error" })
    })
    settle(task.task_uuid, hold)
  })

  const onStatusPick = useStableCallback((task: TaskInfoInterface, v: string) => setStatus(task, v, STATUS_HOLD))
  const onPriorityPick = useStableCallback((task: TaskInfoInterface, v: string) => void update([task], { field: "priority", value: v }))

  const onComplete = useStableCallback(
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
      // The toast's parts come with the app's toaster, not this list's first screen.
      if (done)
        void import("@/components/ui/toast").then(({ ToastAction }) =>
          toast({
            title: "Done",
            description: task.task_name,
            duration: 5000,
            action: (
              <ToastAction altText="Undo" onClick={() => setStatus({ ...task, task_status: "done", task_custom_status: "" }, before, STATUS_HOLD)}>
                Undo
              </ToastAction>
            ),
          }),
        )
    },
  )

  const toggleGroup = useStableCallback((key: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    }),
  )

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

  const keyW = keyWidth(tasks)
  // Types without keys keep the slot (V-459).
  const typed = tasks.some((t) => t.task_work_type)
  // Rows left to draw: before the window plans, a screen's worth once more than WINDOW_ABOVE are shown, as the window
  // counts them; in a shorter list's first draw, the rows filled so far (filling, above).
  let room = shownRows > WINDOW_ABOVE ? (plans ? Infinity : FIRST_ROWS) : filling ? (fill?.rows ?? FIRST_ROWS) : Infinity
  const list = (
    <div ref={box} data-grouped-list="" data-task-sequence="" aria-label="Tasks" className="group/list relative" style={keyW ? ({ "--key-w": `${keyW}ch` } as React.CSSProperties) : undefined}>
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key)
        const shown = shownOf(g, more)
        const hidden = g.tasks.length - shown.length
        // Windowed: what this group draws, each item with the space above it, and its list padded for the rest.
        const plan = plans?.get(g.key)
        const gaps = plan && new Map(plan.drawn.map((d) => [d.key, d.gap]))
        const draws = (key: string) => !gaps || gaps.has(key)
        const cut = isCollapsed ? 0 : Math.min(shown.length, room)
        room -= cut
        return (
          <section key={g.key} data-group={g.key} aria-label={g.label}>
            <GroupHeader group={g} partial={partial} collapsed={isCollapsed} onToggle={toggleGroup} onAdd={onAdd && !g.closed && g.key !== "overdue" ? setAdding : undefined} />
            {!isCollapsed && (
              <div role="list" aria-label={g.label} data-rows={plan ? shown.length : undefined} style={plan ? { paddingTop: plan.before, paddingBottom: plan.after } : cut < shown.length ? { paddingBottom: (shown.length - cut) * 40 } : undefined}>
                {adding === g.key && onAdd && draws(`${g.key}#add`) && (
                  <InlineAdd
                    group={g}
                    onCancel={() => setAdding(null)}
                    onSubmit={async (name) => {
                      await onAdd(g, name)
                    }}
                  />
                )}
                {g.when === "today" && g.tasks.length === 0 && draws(`${g.key}#empty`) && (
                  <div data-all-clear="" className="flex h-12 items-center gap-3 border-b border-line pl-5 text-sm text-ink-2 [animation:work-fade-in_220ms_var(--ease-out)_both]">
                    <span className="hue-moss inline-flex size-5 items-center justify-center rounded-md bg-hue-tint text-hue [animation:work-check-fill_220ms_var(--ease-spring)_both]">
                      <StatusGlyph status="done" size={12} />
                    </span>
                    Nothing due today
                  </div>
                )}
                {shown.map((t, i) => i < cut && draws(t.task_uuid) && (
                  <TaskRow
                    key={t.task_uuid}
                    gap={gaps?.get(t.task_uuid)}
                    setsize={plan && shown.length}
                    posinset={plan && i + 1}
                    task={t}
                    keyed={keyW > 0 || typed}
                    options={options}
                    props={props}
                    editable={canEdit(t)}
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
                {hidden > 0 && cut === shown.length && draws(`${g.key}#more`) && (
                  <button
                    type="button"
                    onClick={() => setMore((m) => new Set(m).add(g.key))}
                    className="flex h-9 w-full items-center border-b border-line pl-[66px] text-left text-ui-sm text-ink-3 hover:bg-hover hover:text-ink-2"
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
  return (
    <ReorderHost>
      {list}
      {tasks.length > WINDOW_ABOVE && <listWindow.Part above={WINDOW_ABOVE} groups={groups} collapsed={collapsed} more={more} adding={onAdd ? adding : null} box={box} shownOf={shownOf} opened={openedId} onPlans={setPlans} />}
      {Layer && reorder && <Layer {...reorder} tasks={tasks} groups={groups} grouping={grouping} options={options} canEdit={canEdit} box={box} onPlaced={onPlaced} />}
    </ReorderHost>
  )
}

/** A group's 36 px header (work.md W18): chevron, glyph, name, count that ticks, and "+" on hover. Memoised: a window's step draws none. */
const GroupHeader = React.memo(function GroupHeader({ group, partial, collapsed, onToggle, onAdd }: { group: TaskGroup; partial: boolean; collapsed: boolean; onToggle: (key: string) => void; onAdd?: (key: string) => void }) {
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
        onClick={() => onToggle(group.key)}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Show" : "Hide"} ${group.label}`}
        className="flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className={cn("size-3.5 text-ink-3 transition-transform duration-[180ms] ease-out", collapsed && "-rotate-90")} aria-hidden="true" />
        {group.status ? (
          <StatusGlyph status={statusKindOf(group.status)} hue={group.status.hue} />
        ) : group.projectId ? (
          <ProjectTile id={group.projectId} size={16} />
        ) : group.workType ? (
          <TaskTypeGlyph type={group.workType} className="size-4 text-ink-2" decorative />
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
          onClick={() => onAdd(group.key)}
          aria-label={`New task in ${group.label}`}
          className="inline-flex size-6 items-center justify-center rounded-sm text-ink-3 [@media(hover:hover)]:opacity-0 transition-opacity hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-hover/head:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  )
})

/** The 40 px editable row "+" puts at the top of a group: Enter creates, Esc cancels. */
function InlineAdd({ group, onSubmit, onCancel }: { group: TaskGroup; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  return (
    <form
      data-inline-add=""
      className={cn(ROW_H, "flex items-center gap-2.5 border-b border-line pl-[58px] pr-4")}
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
        data-escape-own=""
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

type CellProps = {
  fields: TaskField[]
  nameOf?: (id: string) => string | undefined
  task: TaskInfoInterface
  keyed: boolean
  options: StatusOption[]
  props: RowProp[]
  editable: boolean
  justDone: boolean
  sortedBy?: RowProp
  onComplete: (task: TaskInfoInterface, done: boolean) => void
  onStatus: (task: TaskInfoInterface, value: string) => void
  onPriority: (task: TaskInfoInterface, value: string) => void
  onManageStatuses?: () => void
}

/** The Checkbox that takes the light box's place under the focus takes the focus too (a screen reader's cursor, a finger). */
const takeFocus = (el: HTMLElement | null) => el?.focus()

/** What the Tab key reaches inside a row. */
const TABBABLE = 'button:not([tabindex="-1"]):not(:disabled),a[href]:not([tabindex="-1"]),input:not([tabindex="-1"]):not(:disabled),[tabindex]:not([tabindex="-1"])'
/** Whether a row's select box comes first of what Tab reaches in it (a grip comes before). */
function boxFirst(row: HTMLElement): boolean {
  const slot = row.querySelector("[data-row-select]")
  const first = row.querySelector(TABBABLE)
  return !!slot && (!first || (slot.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
}

/** The desktop task row (work.md W19). Memoised: a key press re-renders the rows it changes and no other, and only their frame; J draws none (painted). */
const TaskRow = React.memo(function TaskRow({
  gap,
  setsize,
  posinset,
  ...cells
}: CellProps & {
  /** Windowed (components/task/listWindow): the space above a row drawn away from the rows before it, and its place among its group's shown rows. */
  gap?: number
  setsize?: number
  posinset?: number
}) {
  const { task, editable } = cells
  const dispatch = useDispatch()
  const store = React.useContext(ListSelectionContext)
  const selected = useRowSelected(task.task_uuid)
  const opened = useSelector((s: RootState) => s.rightPanel.rightPanelState.isOpen && s.rightPanel.rightPanelState.data.taskUUID === task.task_uuid)
  // The Checkbox is in the tree only while the row is pointed at or something in it has focus (F-1 #2);
  // "box" when the focus came to the light box, which hands it on to the Checkbox.
  const [pointed, setPointed] = React.useState(false)
  const [focused, setFocused] = React.useState<false | "row" | "box">(false)
  const live = pointed || !!focused
  // Not while a scroll or a drag carries rows under the pointer, nor on an arrival the pointer did not move to (rows
  // drawn or moved under a resting pointer: isStillArrival); a move wakes it.
  // Never a finger's: its enter comes with its tap, and the Checkbox would take
  // the place of the box the tap lands on (the slot's own click selects instead).
  // Nor while the list holds a selection: the empty box draws as the Checkbox then,
  // and a click that arrives with the pointer is the box's (the list's own click
  // writes the store, which draws a swap still waiting before the click is read).
  const point = (e: React.PointerEvent) => e.pointerType !== "touch" && !isBusyPointer() && !isStillArrival(e) && !store?.get().selected.size && setPointed(true)
  const open = () => dispatch(openRightPanel({ taskUUID: task.task_uuid }))
  const Grip = React.useContext(ReorderGrip)

  return (
    <div
      role="listitem"
      data-task-id={task.task_uuid}
      data-flip-id={task.task_uuid}
      aria-setsize={setsize}
      aria-posinset={posinset}
      style={gap ? { marginTop: gap } : undefined}
      data-state={selected ? "selected" : undefined}
      data-opened={opened || undefined}
      aria-current={opened || undefined}
      tabIndex={-1}
      onPointerEnter={point}
      onPointerMove={pointed ? undefined : point}
      onPointerLeave={() => setPointed(false)}
      // The row's own focus (the keys', a click) is no state; a control's in it is.
      onFocus={(e) => e.target !== e.currentTarget && setFocused((e.target as HTMLElement).hasAttribute("data-row-box") ? "box" : "row")}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,[role=menuitem],[role=checkbox]")) return
        open()
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter") open()
        // Tab from the row lands on its select box: the light box hands it on.
        else if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !live && !selected && boxFirst(e.currentTarget)) {
          e.preventDefault()
          setFocused("box")
        }
      }}
      className={cn(
        ROW_H,
        // Drawn only near the screen: a list of thousands costs its visible rows (globals.css).
        "row-lazy",
        "group/row relative flex cursor-pointer items-center gap-2.5 border-b border-line pl-[18px] pr-4 outline-none transition-colors duration-[140ms]",
        "row-hover:bg-hover active:bg-press",
        selected && "bg-sel",
        opened && "bg-[color-mix(in_oklab,var(--brand-muted)_75%,transparent)] row-hover:bg-[color-mix(in_oklab,var(--brand-muted)_75%,transparent)]",
      )}
    >
      {/* The opened row's 2px brand edge, scaling in. */}
      {opened && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-brand [animation:work-grow-y_140ms_var(--ease-out)_both] [transform-origin:center]" />}
      {/* The keyboard's cursor: an inset ring, clear of the hairlines, for the keys' focus only (a mouse's press highlights without it). Shown by visibility, so a key's focus moves no box in or out of layout. */}
      {!opened && <span aria-hidden="true" data-kbd-cursor="" className="pointer-events-none invisible absolute inset-0.5 rounded-md ring-cursor kbd-lit:visible" />}
      {Grip && <Grip task={task} editable={editable} />}
      <span
        className={cn("flex w-4 shrink-0 justify-center transition-opacity duration-[140ms]", selected ? "opacity-100" : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none row-hover-in:opacity-100 row-hover-in:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto group-data-[any-selected]/list:opacity-100 group-data-[any-selected]/list:pointer-events-auto")}
        data-row-select=""
        // While the list holds a selection, the empty box beside a row is a box to a finger too: a tap on it adds the row and opens nothing.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[role=checkbox]:not([data-row-box])") || !store?.get().selected.size) return
          e.stopPropagation()
          store.toggle(task.task_uuid)
        }}
      >
        {live || selected ? (
          <Checkbox ref={focused === "box" ? takeFocus : undefined} checked={selected} onCheckedChange={() => store?.toggle(task.task_uuid)} aria-label={`Select ${task.task_name}`} />
        ) : (
          // While the list holds a selection, an empty box as the Checkbox draws it, and a real
          // control with the row's name (a screen reader finds every row's), with the Checkbox's
          // hover ring, press and reach; the Checkbox comes under the focus, or under the pointer
          // with no selection. Hidden without a selection, but under the keys' focus (a screen reader finds it).
          <button
            type="button"
            role="checkbox"
            aria-checked={false}
            aria-label={`Select ${task.task_name}`}
            tabIndex={-1}
            data-row-box=""
            // A press (a finger's tap comes as one) leaves the focus where it is: a focus here hands on to the
            // Checkbox, which would take this box's place under the press and lose its click. Keys and a screen
            // reader's focus still hand on.
            onMouseDown={(e) => e.preventDefault()}
            className="invisible relative size-4 rounded-[5px] transition-spring kbd-box:visible kbd-box:ring-[1.5px] kbd-box:ring-inset kbd-box:ring-faint-foreground after:absolute after:-inset-1 hover:ring-muted-foreground motion-safe:active:scale-[0.88] active:duration-[90ms] group-data-[any-selected]/list:visible group-data-[any-selected]/list:ring-[1.5px] group-data-[any-selected]/list:ring-inset group-data-[any-selected]/list:ring-faint-foreground"
          />
        )}
      </span>
      <RowCells {...cells} />
    </div>
  )
})

/** A row's cells, memoised apart from its frame, which alone draws again for the row's highlight, focus, pointer or place in a window. */
const RowCells = React.memo(function RowCells({ task, keyed, options, props, editable, justDone, sortedBy, fields, nameOf, onComplete, onStatus, onPriority, onManageStatuses }: CellProps) {
  const [statusOpen, setStatusOpen] = React.useState(false)
  const status = statusOptionOf(task, options) ?? options[0]
  const done = isClosedStatus(task.task_status)
  const has = (p: RowProp) => props.includes(p)
  const tags = has("labels") ? splitTags(task.task_label) : []
  const due = has("due") ? dueDateOf(task.task_due_date) : null
  return (
    <>
      {has("priority") && (
        editable ? (
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
      {keyed && <TaskKeyCell task={task} />}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <TaskTitle done={done} justDone={justDone} className="text-sm font-[450]">
          {task.task_name}
        </TaskTitle>
        {/* A mark with nothing to draw is no component: a window move mounts every row's cells. */}
        {task.task_restricted && <RestrictedMark restricted />}
        {has("badges") && hasBadges(task) && <RowBadges task={task} />}
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
          // Money, a number and a formula giving one are tabular text in their own right-aligned 72px
          // column, never a pill; one the server hides from the reader (V-698) is its lock, the words
          // in its tip, and a formula's error its chip's icon, its why in its tip.
          if (alignsRight(f)) {
            return (
              <span key={f.id} data-field-cell={f.type} className="w-[72px] shrink-0 truncate text-right text-meta tabular-nums text-ink-2">
                <FieldValueView field={f} value={v} nameOf={nameOf} compact />
              </span>
            )
          }
          return (
            <span key={f.id} data-field-cell={f.type} className="hidden max-w-[160px] shrink-0 lg:inline-flex">
              <FieldValueView field={f} value={v} nameOf={nameOf} />
            </span>
          )
        })}
      {task.task_sla && (
        <React.Suspense fallback={null}>
          <SlaChip sla={task.task_sla} hidden={task.task_hidden} done={done} />
        </React.Suspense>
      )}
      {has("due") && (
        <span className="flex w-16 shrink-0 justify-end">
          {due && <DueLabel date={due} done={done} className={cn(sortedBy === "due" && !done && "text-foreground")} />}
        </span>
      )}
      {has("estimate") && task.task_estimate_minutes ? (
        <span className="w-12 shrink-0 text-right text-meta tabular-nums text-ink-3">{formatMinutes(task.task_estimate_minutes)}</span>
      ) : null}
      {has("assignee") && <TaskAvatar user={task.task_assignee} />}
    </>
  )
})

const hasBadges = (task: TaskInfoInterface) => !!(task.task_blocked_open || task.task_sub_task_count || task.task_comment_count)

/** The badges after a title: blocked, subtasks, comments (work.md W19). */
function RowBadges({ task }: { task: TaskInfoInterface }) {
  const subs = task.task_sub_task_count || 0
  const comments = task.task_comment_count || 0
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
            <div key={r} className={cn(ROW_H, "flex items-center gap-2.5 border-b border-line pl-[58px] pr-4")}>
              <Skeleton className="size-4 rounded-[5px]" />
              <Skeleton className={cn("h-3.5", widths[(g + r) % 3])} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
