"use client"

/**
 * TaskBoard: the drag-and-drop board behind both the project board and My
 * Tasks. The two used to carry their own copies of about four hundred lines,
 * and each fix had to be made twice.
 *
 * How a drag works here: the card lifts and follows the pointer, and a line
 * shows where it will land. Nothing else on the board moves until it is
 * dropped. This is the pattern Atlassian settled on for Jira's boards, and it
 * is what makes a drag cost almost nothing per frame.
 *
 * The board it replaces moved the card between columns in React state while
 * dragging (dnd-kit's multi-container recipe). That had two faults:
 *
 * - It could crash. With the pointer in the gap between two columns, the
 *   collision check could name one column, then the other once the card had
 *   moved, and each flip moved the card again until React stopped the loop
 *   ("Maximum update depth exceeded", shown as "Something went wrong";
 *   dnd-kit issues #1678 and #1421).
 * - It stuttered. Every crossing re-rendered and re-measured every card in
 *   both columns, and every measurement forced a layout: on a 40-card board
 *   with a throttled CPU, frames of 300 to 470ms at each crossing.
 *
 * Now a move only works out which column is under the pointer and where in it
 * the card would go (a few rectangle reads, no writes), and re-renders only
 * when that answer changes: the column the line left and the one it entered.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
    DndContext,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    defaultDropAnimationSideEffects,
    type DropAnimation,
    type CollisionDetection,
} from "@dnd-kit/core"
import { Container, Item } from "@/components/kanbanComponents"
import { coordinateGetter } from "@/components/task/multipleContainersKeyboardCoordinates"
import type { TaskInfoInterface } from "@/types/task"
import { dropMovedCard, insertionIndex, placeCard, type SettledDrop } from "@/lib/utils/kanbanDrop"
import { cn } from "@/lib/utils/helpers/cn"
import { colorDot, type StatusOption } from "@/lib/taskStatus"
import { Plus } from "@/lib/icons"
import { useCollapsedColumns } from "@/hooks/useCollapsedColumns"

/** Cards a column renders at first, and adds each time it is scrolled near its end. */
export const CARDS_PER_PAGE = 30

type Columns = Record<string, TaskInfoInterface[]>
type Target = { column: string; index: number }

const dropAnimation: DropAnimation = {
    duration: 180,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
}

// The board decides where a card lands itself (see onDragMove); dnd-kit's
// collision pass would only repeat that work, over every card, on every move.
const noCollisions: CollisionDetection = () => []

// Auto-scroll only the board (sideways) and its columns (down), never the page
// around them: dnd-kit otherwise checks every scrollable ancestor on every move.
const boardScrollsOnly = (element: Element) => element instanceof HTMLElement && element.dataset.boardScroll !== undefined

function pointerOf(event: Event | null): { x: number; y: number } | null {
    if (!event) return null
    if ("touches" in event) {
        const t = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0]
        return t ? { x: t.clientX, y: t.clientY } : null
    }
    if ("clientX" in event) return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }
    return null
}

export function TaskBoard({
    columns,
    visible,
    canDrag,
    onMove,
    boardKey,
    onQuickAdd,
    totals,
}: {
    /** The board as the server last described it, by status. */
    columns: Columns
    /** The status columns to show, in order: built-in and the project's own. */
    visible: StatusOption[]
    /** Whether this person may move this task. */
    canDrag: (task: TaskInfoInterface) => boolean
    /** Save a drop. The board already shows it. */
    onMove: (task: TaskInfoInterface, drop: SettledDrop<TaskInfoInterface>) => void
    /** Which board this is, so the columns folded on it are remembered. */
    boardKey?: string
    /** Make a task in a column from its name; resolves whether it worked. */
    onQuickAdd?: (column: string, name: string) => Promise<boolean>
    /** A column's real total when the server sent only part of it (done, cancelled). */
    totals?: Record<string, number | undefined>
}) {
    const [collapsed, toggleCollapsed] = useCollapsedColumns(boardKey)
    const [items, setItems] = useState<Columns>(columns)
    const [activeTask, setActiveTask] = useState<TaskInfoInterface | null>(null)
    const [target, setTarget] = useState<Target | null>(null)
    const itemsRef = useRef(items)
    itemsRef.current = items
    const columnsRef = useRef(columns)
    columnsRef.current = columns
    const targetRef = useRef<Target | null>(null)
    const origin = useRef<{ x: number; y: number } | null>(null)
    const boardRef = useRef<HTMLDivElement>(null)
    const dragging = activeTask !== null

    const canDragRef = useRef(canDrag)
    canDragRef.current = canDrag
    const canDragTask = useCallback((task: TaskInfoInterface) => canDragRef.current(task), [])

    // Follow the server between drags, never during one. After a drop, keep
    // showing it until the data changes (the optimistic update or the server's
    // answer), or the card would jump back to where it started and forward again.
    const heldFrom = useRef<Columns | null>(null)
    useEffect(() => {
        if (dragging) return
        if (heldFrom.current === columns) return
        heldFrom.current = null
        setItems(columns)
    }, [columns, dragging])

    const sensors = useSensors(
        // A few pixels before a drag starts, so a click still opens the task.
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        // A short hold on touch, so a tap opens and a swipe scrolls.
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter }),
    )

    const aim = (next: Target | null) => {
        const cur = targetRef.current
        if (cur?.column === next?.column && cur?.index === next?.index) return
        targetRef.current = next
        setTarget(next)
    }

    const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
        const task = active.data.current?.task as TaskInfoInterface | undefined
        if (!task || !canDragTask(task)) return
        origin.current = pointerOf(activatorEvent)
        setActiveTask(task)
        // Until the pointer moves, it lands where it is.
        const cols = itemsRef.current
        const column = Object.keys(cols).find((k) => cols[k].some((t) => t.task_uuid === task.task_uuid))
        if (column) aim({ column, index: cols[column].findIndex((t) => t.task_uuid === task.task_uuid) })
    }

    const onDragMove = ({ active, delta }: DragMoveEvent) => {
        const board = boardRef.current
        if (!activeTask || !board) return
        // The pointer for a mouse or finger; the lifted card's centre for keys.
        let x: number, y: number
        if (origin.current) {
            x = origin.current.x + delta.x
            y = origin.current.y + delta.y
        } else {
            const r = active.rect.current.translated
            if (!r) return
            x = r.left + r.width / 2
            y = r.top + r.height / 2
        }
        let columnEl: HTMLElement | null = null
        for (const el of board.querySelectorAll<HTMLElement>("[data-column]")) {
            const r = el.getBoundingClientRect()
            if (x >= r.left && x <= r.right) {
                columnEl = el
                break
            }
        }
        // In the gap between columns: keep the line where it is.
        if (!columnEl) return
        const mids: number[] = []
        for (const card of columnEl.querySelectorAll<HTMLElement>("[data-task-id]")) {
            if (card.dataset.taskId === String(active.id)) continue
            const r = card.getBoundingClientRect()
            mids.push(r.top + r.height / 2)
        }
        aim({ column: columnEl.dataset.column!, index: insertionIndex(mids, y) })
    }

    const finish = () => {
        origin.current = null
        targetRef.current = null
        setTarget(null)
        setActiveTask(null)
    }

    const onDragEnd = ({ active }: DragEndEvent) => {
        const task = activeTask
        const t = targetRef.current
        if (task && t) {
            const drop = placeCard(itemsRef.current, String(active.id), t.column, t.index)
            if (drop && dropMovedCard(itemsRef.current, drop, task.task_uuid)) {
                heldFrom.current = columnsRef.current
                setItems(drop.items)
                // Save on the next frame, so the drop animation starts first: the
                // optimistic update copies every cached task list it touches.
                requestAnimationFrame(() => onMove(task, drop))
            }
        }
        finish()
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={noCollisions}
            autoScroll={{
                canScroll: boardScrollsOnly,
                // dnd-kit starts scrolling within 20% of the scroller's edge by
                // default: about 250px on a board, so a column near the edge of
                // the window slid away while the card was held over it and the
                // card landed several columns on. Scroll only at the very edge.
                threshold: { x: 0.06, y: 0.1 },
                acceleration: 8,
            }}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={finish}
        >
            <div ref={boardRef} className="flex h-full gap-4 pb-4 overflow-x-auto snap-x snap-mandatory sm:snap-none" data-board-scroll="">
                {visible.map((status) => (
                    <BoardColumn
                        key={status.value}
                        status={status}
                        tasks={items[status.value] ?? NO_TASKS}
                        canDrag={canDragTask}
                        activeId={activeTask?.task_uuid ?? null}
                        lineAt={target?.column === status.value ? target.index : null}
                        collapsed={collapsed.has(status.value)}
                        onToggleCollapse={toggleCollapsed}
                        onQuickAdd={onQuickAdd}
                        total={totals?.[status.value]}
                    />
                ))}
            </div>
            {typeof document !== "undefined" &&
                createPortal(
                    <DragOverlay dropAnimation={dropAnimation}>
                        {activeTask ? <Item task={activeTask} value={activeTask.task_uuid} dragOverlay /> : null}
                    </DragOverlay>,
                    document.body,
                )}
        </DndContext>
    )
}

const NO_TASKS: TaskInfoInterface[] = []

/**
 * One column. Memoised: while a card is dragged, only the column the line is
 * in, and the one it just left, render again.
 */
const BoardColumn = memo(function BoardColumn({
    status,
    tasks,
    canDrag,
    activeId,
    lineAt,
    collapsed,
    onToggleCollapse,
    onQuickAdd,
    total,
}: {
    status: StatusOption
    tasks: TaskInfoInterface[]
    canDrag: (task: TaskInfoInterface) => boolean
    activeId: string | null
    /** Where the drop line is, counted among the cards other than the one lifted. */
    lineAt: number | null
    collapsed: boolean
    onToggleCollapse: (column: string) => void
    onQuickAdd?: (column: string, name: string) => Promise<boolean>
    total?: number
}) {
    // A drop target only for the keyboard, whose sensor steps between columns.
    const id = status.value
    const { setNodeRef } = useDroppable({ id, data: { type: "container", children: tasks } })
    // A column of hundreds renders a page of cards and adds more as it is
    // scrolled, so a big board opens and drags as fast as a small one.
    const [limit, setLimit] = useState(CARDS_PER_PAGE)
    const shown = tasks.length > limit ? tasks.slice(0, limit) : tasks
    const sentinel = useRef<HTMLDivElement>(null)
    const more = tasks.length > limit
    useEffect(() => {
        const el = sentinel.current
        if (!more || !el || typeof IntersectionObserver === "undefined") return
        const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((n) => n + CARDS_PER_PAGE), { rootMargin: "400px" })
        io.observe(el)
        return () => io.disconnect()
    }, [more, limit])
    const others = shown.filter((t) => t.task_uuid !== activeId).length
    let k = 0
    return (
        <Container
            collapsed={collapsed}
            onToggleCollapse={() => onToggleCollapse(id)}
            footer={onQuickAdd && !collapsed ? <QuickAdd onAdd={(name) => onQuickAdd(id, name)} /> : undefined}
            ref={setNodeRef}
            label={id}
            title={status.label}
            icon={status.icon}
            swatchClass={status.swatch ? colorDot(status.swatch) : undefined}
            count={Math.max(total ?? 0, tasks.length)}
            scrollable
            hover={lineAt !== null}
            data-column={id}
        >
            <div className="flex flex-col gap-2 w-full pb-4">
                {shown.map((task) => {
                    const position = task.task_uuid === activeId ? -1 : k++
                    return (
                        <BoardCard
                            key={task.task_uuid}
                            task={task}
                            column={id}
                            disabled={!canDrag(task)}
                            // Its own status, where the column does not already say it
                            // (My Tasks has only the built-in columns).
                            statusBadge={task.task_custom_status && task.task_custom_status !== id ? task.task_custom_status_name : undefined}
                            lineAbove={lineAt !== null && position === lineAt}
                            lineBelow={lineAt !== null && lineAt === others && position === others - 1}
                        />
                    )
                })}
                {lineAt !== null && others === 0 && (
                    <div className="relative h-2">
                        <DropLine className="top-0" />
                    </div>
                )}
                {!more && total !== undefined && total > tasks.length && (
                    <p className="px-2 py-2 text-center text-xs text-muted-foreground">
                        The newest {tasks.length} of {total}. The list view has them all.
                    </p>
                )}
                {more && (
                    <div ref={sentinel} className="py-2 text-center text-xs text-muted-foreground">
                        {tasks.length - limit} more
                    </div>
                )}
            </div>
        </Container>
    )
})

/** The line where a dragged card will land. It takes no space, so nothing shifts. */
function DropLine({ className }: { className: string }) {
    return <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-1 z-10 block h-0.5 rounded-full bg-primary", className)} />
}

const BoardCard = memo(function BoardCard({
    task,
    column,
    disabled,
    lineAbove,
    lineBelow,
    statusBadge,
}: {
    task: TaskInfoInterface
    column: string
    disabled: boolean
    statusBadge?: string
    lineAbove: boolean
    lineBelow: boolean
}) {
    const { setNodeRef, listeners, isDragging } = useDraggable({
        id: task.task_uuid,
        data: { type: "task", task, containerId: column },
        disabled,
    })
    return (
        <div className="relative">
            {lineAbove && <DropLine className="-top-[5px]" />}
            <Item
                ref={setNodeRef}
                value={task.task_uuid}
                task={task}
                statusBadge={statusBadge}
                dragging={isDragging}
                listeners={disabled ? undefined : listeners}
                data-task-id={task.task_uuid}
            />
            {lineBelow && <DropLine className="-bottom-[5px]" />}
        </div>
    )
})

/**
 * "Add task" at the foot of a column, Asana's way: type a name, Enter adds it
 * here and leaves the box open for the next one; Escape or an empty blur closes.
 */
function QuickAdd({ onAdd }: { onAdd: (name: string) => Promise<boolean> }) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState("")
    const [busy, setBusy] = useState(false)
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mx-3 mb-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
                <Plus className="h-4 w-4" />
                Add task
            </button>
        )
    }
    const submit = async () => {
        const n = name.trim()
        if (!n || busy) return
        setBusy(true)
        const ok = await onAdd(n)
        setBusy(false)
        if (ok) setName("")
    }
    return (
        <div className="mx-3 mb-3">
            <input
                autoFocus
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault()
                        void submit()
                    } else if (e.key === "Escape") {
                        setOpen(false)
                        setName("")
                    }
                }}
                onBlur={() => !name.trim() && setOpen(false)}
                placeholder="Task name, then Enter"
                aria-label="New task name"
                maxLength={200}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
            />
        </div>
    )
}
