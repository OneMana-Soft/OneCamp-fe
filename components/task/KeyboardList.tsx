"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableRow } from "@/components/ui/table"
import { useMedia } from "@/context/MediaQueryContext"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { useFetch } from "@/hooks/useFetch"
import { PANEL_INCLUDE, seedPanelParts, type PanelParts } from "@/lib/work/panelIncludes"
import { GetEndpointUrl } from "@/services/endPoints"
import { useStore } from "react-redux"
import { ListSelectionContext, useRowSelected } from "@/hooks/useListSelection"
import { createSelectionStore, type SelectionStore } from "@/lib/listSelection"
import type { RootState } from "@/store/store"
import { cn } from "@/lib/utils/helpers/cn"
import { LIST_FIELDS, PROJECT_FIELDS, type ListField } from "@/lib/listKeys"
import type { CycleChoice } from "@/lib/work/backlog"
import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// The bar for a selection, with its pickers, is a chunk of its own: nothing
// shows it until a task is selected, and it was 13 KB of the project route's
// first screen (app/firstLoad.test.ts).
const BulkTaskBar = dynamic(() => import("@/components/task/BulkTaskBar").then((m) => m.BulkTaskBar), { loading: () => null })

/**
 * A list or board of tasks worked from the keyboard (lib/listKeys): J and K
 * move, X selects, Enter opens, S, A, T and P change what is selected, with
 * the selection's toolbar at the foot; on a project's backlog, Shift+C moves
 * it into a cycle. Rows and cards inside mark themselves with data-task-id
 * and read their selection with useRowSelected (the keys' place is painted).
 * On a phone the list is as it was.
 */
export function KeyboardList({
  tasks,
  canEdit,
  listProjectId,
  statusOptions,
  cycles,
  paused = false,
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
  /** The cycles a selection can move into (a project's backlog), with the backlog itself. Memoise it. */
  cycles?: CycleChoice[]
  /** While a drag is under way, the keys are the drag's. */
  paused?: boolean
  placement?: "sticky" | "overlay"
  className?: string
  children: React.ReactNode
}) {
  const [store] = React.useState(createSelectionStore)
  const ref = React.useRef<HTMLDivElement>(null)
  const [picker, setPicker] = React.useState<ListField | null>(null)
  const { isMobile } = useMedia()
  // A project's lists offer its milestones (Shift+M); its backlog, its cycles too (Shift+C).
  const fields = cycles ? (listProjectId ? PROJECT_WITH_CYCLE : WITH_CYCLE) : listProjectId ? PROJECT_FIELDS : LIST_FIELDS
  useListKeyboard({ containerRef: ref, store, enabled: !isMobile && !paused, onEdit: setPicker, fields })
  // Another page, a filter or a change that moved a task off the list: what
  // went is no longer selected, so nothing out of sight is changed.
  React.useEffect(() => store.keepOnly(new Set(tasks.map((t) => t.task_uuid))), [store, tasks])
  return (
    <ListSelectionContext.Provider value={store}>
      <div ref={ref} className={cn("relative", className)}>
        {children}
        <RestingPrefetch box={ref} store={store} />
        {!isMobile && (
          <BulkTaskBar
            store={store}
            tasks={tasks}
            canEdit={canEdit}
            listProjectId={listProjectId}
            statusOptions={statusOptions}
            cycles={cycles}
            picker={picker}
            onPicker={setPicker}
            placement={placement}
          />
        )}
      </div>
    </ListSelectionContext.Provider>
  )
}

const WITH_CYCLE: readonly ListField[] = [...LIST_FIELDS, "cycle"]
const PROJECT_WITH_CYCLE: readonly ListField[] = [...PROJECT_FIELDS, "cycle"]

/**
 * A task table's row: 36px, the list row of the task panel's bar, whatever its
 * cells hold. The cells' own 8px padding made a row as tall as its tallest
 * cell: 41px on a project (the assignee's 24px avatar), 37px on My Tasks
 * (text only), so the two lists of the same tasks kept two rhythms.
 */
export const taskRowClass = "h-9 [&>td]:py-1.5"

/** A task's row in a table: marked for the keys, tinted when selected, edged when highlighted (painted: lit), with its box first. */
export function TaskTableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const selected = useRowSelected(id)
  return (
    <TableRow
      data-task-id={id}
      data-state={selected ? "selected" : undefined}
      aria-selected={selected}
      tabIndex={-1}
      className={cn(taskRowClass, "group/row outline-none lit:bg-muted/60 lit:shadow-[inset_2px_0_0_var(--primary)]")}
    >
      <TableCell className="w-8 pr-0">
        <TaskRowCheck id={id} selected={selected} />
      </TableCell>
      {children}
    </TableRow>
  )
}

/** A task's box in a list's selection, for a row marked group/row. */
export function TaskRowCheck({ id, selected }: { id: string; selected: boolean }) {
  const store = React.useContext(ListSelectionContext)
  return (
    <Checkbox
      checked={selected}
      onCheckedChange={() => store?.toggle(id)}
      aria-label="Select task"
      // Quiet until the row is pointed at or anything is picked; never hidden, so always reachable.
      className={cn("transition-opacity", !selected && "opacity-40 row-hover-in:opacity-100 focus-visible:opacity-100")}
    />
  )
}

/** How long the pointer rests on a task before it is fetched: a pass across the list fetches nothing. */
export const HOVER_INTENT_MS = 90

/**
 * How long the keys rest on a task before it is fetched. Longer than the
 * pointer's: a quick hand's J lands every ~120 ms, and under 90 ms the keys
 * rested between nearly every two presses (38 requests in 20 J, FLUIDITY-24).
 * Enter loads the keys' task at once, so opening never waits for this.
 */
export const KEY_REST_MS = 250

/**
 * The tasks the pointer (HOVER_INTENT_MS) and the keys (KEY_REST_MS) rest on
 * load before they're opened; a pass or a J burst fetches nothing, an opened
 * one at once. A leaf: what rests draws only this.
 */
function RestingPrefetch({ box, store }: { box: React.RefObject<HTMLElement | null>; store: SelectionStore }) {
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [keyed, setKeyed] = React.useState<string | null>(null)
  const app = useStore<RootState>()
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    let pointer: ReturnType<typeof setTimeout> | null = null
    let keys: ReturnType<typeof setTimeout> | null = null
    const over = (e: Event) => {
      const task = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-task-id]")?.dataset.taskId : undefined
      if (pointer) clearTimeout(pointer)
      if (task) pointer = setTimeout(() => setHovered(task), HOVER_INTENT_MS)
    }
    let was = store.get().highlighted
    const moved = store.subscribe(() => {
      const id = store.get().highlighted
      if (id === was) return
      was = id
      if (keys) clearTimeout(keys)
      keys = setTimeout(() => setKeyed(id), KEY_REST_MS)
    })
    // Opened (Enter, a click): the panel's task, if it is the keys' place, loads now.
    const opened = app.subscribe(() => {
      const p = app.getState().rightPanel.rightPanelState
      const id = p.isOpen ? p.data.taskUUID : null
      if (!id || id !== store.get().highlighted) return
      if (keys) clearTimeout(keys)
      setKeyed(id)
    })
    el.addEventListener("pointerover", over)
    return () => {
      el.removeEventListener("pointerover", over)
      moved()
      opened()
      if (pointer) clearTimeout(pointer)
      if (keys) clearTimeout(keys)
    }
  }, [box, store, app])
  return (
    <>
      <TaskPrefetch id={hovered} />
      <TaskPrefetch id={keyed} />
    </>
  )
}

/** Loads a task's details, with the panel's other reads, into the cache the panel reads (it renders nothing). */
function TaskPrefetch({ id }: { id: string | null }) {
  useFetch<{ data?: { task_project?: { project_uuid?: string } }; included?: PanelParts }>(
    id && !id.startsWith("temp-") ? `${GetEndpointUrl.GetTaskInfo}/${id}` : "",
    undefined,
    { ...PREFETCH, onFetched: (d) => id && seedPanelParts(id, d?.data?.task_project?.project_uuid, d?.included) },
    WITH_PARTS,
  )
  return null
}
const PREFETCH = { revalidateOnFocus: false, dedupingInterval: 10_000 }
const WITH_PARTS = { params: { include: PANEL_INCLUDE } }
