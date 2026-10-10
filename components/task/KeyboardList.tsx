"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { BulkTaskBar } from "@/components/task/BulkTaskBar"
import { useMedia } from "@/context/MediaQueryContext"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { ListSelectionContext, useRowState, useSelectedIds } from "@/hooks/useListSelection"
import { createSelectionStore } from "@/lib/listSelection"
import { cn } from "@/lib/utils/helpers/cn"
import type { ListField } from "@/lib/listKeys"
import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

/**
 * A list or board of tasks worked from the keyboard (lib/listKeys): J and K
 * move, X selects, Enter opens, S, A, T and P change what is selected, with
 * the selection's toolbar at the foot. Rows and cards inside mark themselves
 * with data-task-id and read their state with useRowState. On a phone the
 * list is as it was.
 */
export function KeyboardList({
  tasks,
  canEdit,
  listProjectId,
  statusOptions,
  placement = "sticky",
  className,
  children,
}: {
  /** The tasks shown, so a selection is only ever of tasks on screen. Memoise it. */
  tasks: TaskInfoInterface[]
  /** Whether this person may change the task (its project's admins). Memoise it. */
  canEdit: (task: TaskInfoInterface) => boolean
  listProjectId?: string
  statusOptions?: StatusOption[]
  placement?: "sticky" | "overlay"
  className?: string
  children: React.ReactNode
}) {
  const [store] = React.useState(createSelectionStore)
  const ref = React.useRef<HTMLDivElement>(null)
  const [picker, setPicker] = React.useState<ListField | null>(null)
  const { isMobile } = useMedia()
  useListKeyboard({ containerRef: ref, store, enabled: !isMobile, onEdit: setPicker })
  const hovered = useHoverIntent(ref)
  const highlighted = React.useSyncExternalStore(store.subscribe, () => store.get().highlighted, () => null)
  // Another page, a filter or a change that moved a task off the list: what
  // went is no longer selected, so nothing out of sight is changed.
  React.useEffect(() => store.keepOnly(new Set(tasks.map((t) => t.task_uuid))), [store, tasks])
  return (
    <ListSelectionContext.Provider value={store}>
      <div ref={ref} className={cn("relative", className)}>
        {children}
        {/* The task the pointer rests on, and the one the keys are on, load
            before they're opened: the panel opens on its data, not a wait. */}
        <TaskPrefetch id={hovered} />
        <TaskPrefetch id={highlighted} />
        {!isMobile && (
          <BulkTaskBar
            store={store}
            tasks={tasks}
            canEdit={canEdit}
            listProjectId={listProjectId}
            statusOptions={statusOptions}
            picker={picker}
            onPicker={setPicker}
            placement={placement}
          />
        )}
      </div>
    </ListSelectionContext.Provider>
  )
}

/** A task's row in a table: marked for the keys, tinted when selected, edged when highlighted, with its box first. */
/**
 * A task table's row: 36px, the list row of the task panel's bar, whatever its
 * cells hold. The cells' own 8px padding made a row as tall as its tallest
 * cell: 41px on a project (the assignee's 24px avatar), 37px on My Tasks
 * (text only), so the two lists of the same tasks kept two rhythms.
 */
export const taskRowClass = "h-9 [&>td]:py-1.5"

export function TaskTableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { highlighted, selected } = useRowState(id)
  return (
    <TableRow
      data-task-id={id}
      data-state={selected ? "selected" : undefined}
      data-highlighted={highlighted || undefined}
      aria-selected={selected}
      tabIndex={-1}
      className={cn(taskRowClass, "group/row outline-none", highlighted && "bg-muted/60 shadow-[inset_2px_0_0_var(--primary)]")}
    >
      <TableCell className="w-8 pr-0">
        <RowCheck id={id} selected={selected} />
      </TableCell>
      {children}
    </TableRow>
  )
}

function RowCheck({ id, selected }: { id: string; selected: boolean }) {
  const store = React.useContext(ListSelectionContext)
  return (
    <Checkbox
      checked={selected}
      onCheckedChange={() => store?.toggle(id)}
      aria-label="Select task"
      // Quiet until the row is pointed at or anything is picked; never hidden, so always reachable.
      className={cn("transition-opacity", !selected && "opacity-40 group-hover/row:opacity-100 focus-visible:opacity-100")}
    />
  )
}

/** The header's box: every task on this page, or none. */
const SKELETON_WIDTHS = ["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"]

/**
 * A task table's rows while its first page loads: a page of them, each a
 * row's height and with the row's checkbox, so nothing moves when the tasks
 * land. The shared skeleton drew five rows of 33px against a page of ten 37px
 * rows.
 */
export function TaskTableSkeletonRows({ columns, rows }: { columns: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <TableRow key={r} aria-hidden="true" data-skeleton-row="" className={cn(taskRowClass, "hover:bg-transparent")}>
          <TableCell className="w-8 pr-0">
            <Skeleton className="h-4 w-4 rounded-sm" />
          </TableCell>
          {Array.from({ length: columns }, (_, c) => (
            <TableCell key={c}>
              <Skeleton className={cn("h-4", SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length])} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export function SelectAllHead({ ids }: { ids: string[] }) {
  const store = React.useContext(ListSelectionContext)
  const selected = useSelectedIds(store)
  const picked = ids.filter((id) => selected.has(id)).length
  const all = ids.length > 0 && picked === ids.length
  return (
    <TableHead className="w-8 pr-0">
      <Checkbox
        checked={all ? true : picked > 0 ? "indeterminate" : false}
        disabled={ids.length === 0}
        onCheckedChange={() => (all ? store?.clear() : store?.addRun(ids))}
        aria-label={all ? "Clear the selection" : "Select every task on this page"}
      />
    </TableHead>
  )
}

/** How long the pointer rests on a task before it is fetched: a pass across the list fetches nothing. */
export const HOVER_INTENT_MS = 90

/** The task (data-task-id) the pointer has rested on inside the box. */
function useHoverIntent(ref: React.RefObject<HTMLElement | null>): string | null {
  const [id, setId] = React.useState<string | null>(null)
  React.useEffect(() => {
    const box = ref.current
    if (!box) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const over = (e: Event) => {
      const task = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-task-id]")?.dataset.taskId : undefined
      if (timer) clearTimeout(timer)
      if (task) timer = setTimeout(() => setId(task), HOVER_INTENT_MS)
    }
    box.addEventListener("pointerover", over)
    return () => {
      box.removeEventListener("pointerover", over)
      if (timer) clearTimeout(timer)
    }
  }, [ref])
  return id
}

/** Loads a task's details into the cache the panel reads (it renders nothing). */
function TaskPrefetch({ id }: { id: string | null }) {
  useFetch(id && !id.startsWith("temp-") ? `${GetEndpointUrl.GetTaskInfo}/${id}` : "", undefined, PREFETCH)
  return null
}
const PREFETCH = { revalidateOnFocus: false, dedupingInterval: 10_000 }
