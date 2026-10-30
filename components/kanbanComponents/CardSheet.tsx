"use client"

import { ArrowUpRight } from "@/lib/icons"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { SheetCancel, SheetGroup } from "@/components/ui/sheet-menu"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { ColumnMark } from "@/components/kanbanComponents/Container/Container"
import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

/**
 * A card's menu on a phone (design v3, mobile C5): a sheet from the bottom,
 * the task's name on top, Open, then every column to move it to, each with
 * its header's mark (a status's glyph, a person's avatar) and a check on the
 * one it is in. Jira's and Trello's apps change a card's column from a list
 * like this; a dropdown's side menu ran off a 360px screen.
 *
 * One sheet per board (TaskBoard), never one per card: a closed sheet still
 * listens to the window's viewport, and a sheet inside a card handed a tap on
 * its scrim to the card, which opened the task as the sheet closed.
 */
export function CardSheet({
    task,
    open,
    onOpenChange,
    columns,
    current,
    canMove,
    onOpenTask,
    onMove,
}: {
    /** The card it is for, kept while the sheet goes. */
    task: TaskInfoInterface | null
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The board's columns, in order. */
    columns: StatusOption[]
    /** The column the card is in now. */
    current?: string
    canMove: boolean
    onOpenTask: (task: TaskInfoInterface) => void
    onMove: (task: TaskInfoInterface, column: string) => void
}) {
    return (
        <Drawer detent="menu" open={open && task !== null} onOpenChange={onOpenChange}>
            <DrawerContent data-card-sheet="">
                <DrawerHeader className="px-5 pb-1 pt-2">
                    <DrawerTitle className="line-clamp-2 text-sm font-[510] leading-5">{task?.task_name}</DrawerTitle>
                    <DrawerDescription className="sr-only">{canMove ? "Open the task, or move it to another column." : "Open the task."}</DrawerDescription>
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
                        {canMove && (
                            <>
                                <p aria-hidden="true" className="px-5 pb-1 pt-3 text-xs font-[510] text-ink-3">
                                    Move to
                                </p>
                                <SheetGroup label="Move to">
                                    {columns.map((c) => (
                                        <DrawerItem
                                            key={c.value}
                                            leading={<ColumnMark status={c} />}
                                            label={c.label}
                                            current={c.value === current}
                                            onClick={() => {
                                                onOpenChange(false)
                                                if (c.value !== current) onMove(task, c.value)
                                            }}
                                        />
                                    ))}
                                </SheetGroup>
                            </>
                        )}
                        <SheetCancel />
                    </div>
                )}
            </DrawerContent>
        </Drawer>
    )
}
