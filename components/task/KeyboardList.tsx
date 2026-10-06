"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { BulkTaskBar } from "@/components/task/BulkTaskBar"
import { useMedia } from "@/context/MediaQueryContext"
import { useListKeyboard } from "@/hooks/useListKeyboard"
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
  // Another page, a filter or a change that moved a task off the list: what
  // went is no longer selected, so nothing out of sight is changed.
  React.useEffect(() => store.keepOnly(new Set(tasks.map((t) => t.task_uuid))), [store, tasks])
  return (
    <ListSelectionContext.Provider value={store}>
      <div ref={ref} className={cn("relative", className)}>
        {children}
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
export function TaskTableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { highlighted, selected } = useRowState(id)
  return (
    <TableRow
      data-task-id={id}
      data-state={selected ? "selected" : undefined}
      data-highlighted={highlighted || undefined}
      aria-selected={selected}
      tabIndex={-1}
      className={cn("group/row outline-none", highlighted && "bg-muted/60 shadow-[inset_2px_0_0_var(--primary)]")}
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
