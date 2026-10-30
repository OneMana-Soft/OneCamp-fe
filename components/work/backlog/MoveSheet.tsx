"use client"

import { DrawerItem } from "@/components/drawers/drawerItem"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { SheetCancel, SheetGroup } from "@/components/ui/sheet-menu"
import { ArrowUpRight } from "@/lib/icons"
import { cycleLabel } from "@/lib/tasks/cycles"
import { BACKLOG, type BacklogTask, type PlanCycle } from "@/lib/work/backlog"

/** A backlog row's sheet on a phone: open the task, or move it to a cycle or the backlog (drag's way on a touch screen). */
export function MoveSheet({
  task,
  cycles,
  current,
  onOpenChange,
  onOpenTask,
  onMove,
}: {
  task: BacklogTask | null
  cycles: PlanCycle[]
  current: string
  onOpenChange: (open: boolean) => void
  onOpenTask: (t: BacklogTask) => void
  onMove: (t: BacklogTask, to: string) => void
}) {
  const places = [...cycles.map((c) => ({ id: c.id, label: cycleLabel(c) })), { id: BACKLOG, label: "Backlog" }]
  return (
    <Drawer detent="menu" open={task !== null} onOpenChange={onOpenChange}>
      <DrawerContent data-move-sheet="">
        <DrawerHeader className="px-5 pb-1 pt-2">
          <DrawerTitle className="line-clamp-2 text-sm font-[510] leading-5">{task?.task_name}</DrawerTitle>
          <DrawerDescription className="sr-only">Open the task, or move it to a cycle or the backlog.</DrawerDescription>
        </DrawerHeader>
        {task && (
          <div className="pb-2">
            <SheetGroup label="Task">
              <DrawerItem
                icon={ArrowUpRight}
                label="Open task"
                onClick={() => {
                  onOpenChange(false)
                  onOpenTask(task)
                }}
              />
            </SheetGroup>
            <p aria-hidden="true" className="px-5 pb-1 pt-3 text-xs font-[510] text-ink-3">
              Move to
            </p>
            <SheetGroup label="Move to">
              {places.map((p) => (
                <DrawerItem
                  key={p.id}
                  label={p.label}
                  current={p.id === current}
                  onClick={() => {
                    onOpenChange(false)
                    if (p.id !== current) onMove(task, p.id)
                  }}
                />
              ))}
            </SheetGroup>
            <SheetCancel />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
