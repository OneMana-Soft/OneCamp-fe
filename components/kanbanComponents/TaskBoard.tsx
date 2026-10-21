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
 *
 * The keyboard moves a card the same way (lib/board/keyMove): Space picks up
 * the focused card, the arrows move the line, Space or Enter drops it there and
 * Escape puts it back, each step said aloud. dnd-kit's keyboard sensor never
 * fired here (the card's own Enter and Space opened the task first), and its
 * step function skipped every column that already held a card.
 */

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { fieldKeyDown } from "@/lib/keys/ime"
import { createPortal } from "react-dom"
import {
    DndContext,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    DragOverlay,
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
import { ColumnMoveMenu } from "@/components/kanbanComponents/Container/Container"
import { moveKeyOf, spotLabel, stepSpot } from "@/lib/board/keyMove"
import type { TaskInfoInterface } from "@/types/task"
import { dropMovedCard, insertionIndex, placeCard, type SettledDrop } from "@/lib/utils/kanbanDrop"
import { cn } from "@/lib/utils/helpers/cn"
import { isClosedStatus, type StatusOption } from "@/lib/taskStatus"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { columnHue, columnLozenge, columnWash } from "@/components/kanbanComponents/columnLook"
import type { CampHue } from "@/lib/campHue"
import { celebrateTask, warmBurstsWhenIdle } from "@/lib/celebrateSoon"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { BoardActionsContext, type BoardActions } from "@/components/kanbanComponents/boardActions"
import { ChevronDown, ChevronRight, Plus } from "@/lib/icons"
import { useCollapsedColumns } from "@/hooks/useCollapsedColumns"
import { useRowState } from "@/hooks/useListSelection"
import { cellKey, intoCells, splitCell, type Lane, type LaneSpec } from "@/lib/board/lanes"
import { feedback } from "@/lib/ui/feedback"
import { usePhone } from "@/hooks/usePhone"
import { useSheetMode } from "@/components/ui/overlayMode"
import { useDispatch } from "react-redux"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { CardSheet } from "@/components/kanbanComponents/CardSheet"
import { ColumnDropLine, ColumnGrip, ColumnLift, ColumnOrderProvider, COLUMN_SLOT, useColumnDrag, useColumnOrder, type ColumnOrdering } from "@/components/kanbanComponents/columnDrag"

/** Cards a column renders at first, and adds each time it is scrolled near its end. */
export const CARDS_PER_PAGE = 30

/** The server's closed-column page and ceiling (models/dgraph BoardClosedLimit, BoardClosedMax). */
export const BOARD_CLOSED_STEP = 200
export const BOARD_CLOSED_MAX = 2000

/**
 * The server's open-column page and ceiling (PROJ-BUG-8): each open column
 * comes as its first 1,000 cards in board order, and openLimit asks for more,
 * up to 5,000. Open columns had no page: Dgraph cut every sorted read at
 * 1,000, so a column of 2,500 to-dos showed 1,000 cards and said nothing.
 */
export const BOARD_OPEN_STEP = 1000
export const BOARD_OPEN_MAX = 5000

/**
 * How a column the server sent only part of goes on: done and cancelled
 * newest first, 200 at a time; an open column in board order, 500 at a time.
 */
export function columnPaging(status: { value: string; category?: string }) {
    const closed = isClosedStatus(status.category ?? status.value)
    return closed
        ? { closed, step: BOARD_CLOSED_STEP, max: BOARD_CLOSED_MAX }
        : { closed, step: BOARD_OPEN_STEP, max: BOARD_OPEN_MAX }
}
type Paging = ReturnType<typeof columnPaging>

type Columns = Record<string, TaskInfoInterface[]>
type Target = { column: string; index: number }

// The drop (work.md §1.3, `drop`): the copy flies to its slot in 200 ms on
// cubic-bezier(.2,0,0,1) while it settles back to scale 1, no tilt and the
// resting shadow (the work-dropping class, Item.module.scss). The slot under
// it keeps its dashed look until it lands.
const dropAnimation: DropAnimation = {
    duration: 200,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    sideEffects: defaultDropAnimationSideEffects({ className: { dragOverlay: "work-dropping" } }),
}

/** ms of the drop, after which the card has landed (the flash, the Done check). */
const DROP_MS = 200

/**
 * What a card does once it has landed (work.md W22): the brand-muted flash
 * fading over 700 ms (Atlassian's post-drop acknowledgement; kept under
 * reduced motion, as a colour fade), and, into Done, its glyph springing in
 * with the Spark tier from the card. The card is found by id, so the board
 * renders nothing for it.
 */
function landCard(board: HTMLElement | null, taskId: string, intoDone: boolean) {
    const card = Array.from(board?.querySelectorAll<HTMLElement>("[data-task-id]") ?? []).find((c) => c.dataset.taskId === taskId)
    if (!card) return
    card.animate?.(
        [{ backgroundColor: "color-mix(in oklab, var(--brand-muted) 100%, var(--raised))" }, { backgroundColor: "var(--raised)" }],
        { duration: 700, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
    )
    if (!intoDone) return
    const glyph = card.querySelector<HTMLElement>("[data-card-done-glyph] svg")
    if (glyph && typeof glyph.animate === "function" && !prefersReducedMotion()) {
        glyph.animate([{ transform: "scale(0.4)", opacity: 0.6 }, { transform: "scale(1.12)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }], {
            duration: 220,
            easing: "cubic-bezier(0.3, 1.35, 0.5, 1)",
        })
    }
    celebrateTask(card)
}

// The board decides where a card lands itself (see onDragMove); dnd-kit's
// collision pass would only repeat that work, over every card, on every move.
const noCollisions: CollisionDetection = () => []

// The sensors' options, made once. Written inline they were new objects on
// every render of the board, so dnd-kit rebuilt its sensors and activators,
// its context changed, and every card on the board rendered again: on each
// step of a drag's line, on pick-up and on drop (boardRenders.test.tsx).
// A few pixels before a drag starts, so a click still opens the task.
const MOUSE = { activationConstraint: { distance: 5 } }
// A short hold on touch, so a tap opens and a swipe scrolls.
const TOUCH = { activationConstraint: { delay: 180, tolerance: 8 } }
// dnd-kit starts scrolling within 20% of the scroller's edge by default:
// about 250px on a board, so a column near the edge of the window slid away
// while the card was held over it and the card landed several columns on.
// Scroll only at the very edge, and only the board and its columns. A board
// that snaps a column to the screen (a phone) is paged by the board itself
// (useEdgePaging): dnd-kit's scroll is a few pixels a tick, and each tick
// snapped on to the next column, so a card held at the edge of a phone flew
// past every column to the last in about a second.
const AUTO_SCROLL = {
    canScroll: (element: Element) => element instanceof HTMLElement && element.dataset.boardScroll !== undefined && !isPaged(element),
    threshold: { x: 0.06, y: 0.1 },
    acceleration: 8,
}

/** The board snaps one column into view at a time (a phone, Container.tsx). */
function isPaged(el: HTMLElement): boolean {
    return el.dataset.board !== undefined && typeof getComputedStyle === "function" && /x/.test(getComputedStyle(el).scrollSnapType || "")
}

/**
 * A held card at the left or right edge of a paged board, for this long,
 * turns the board one column; held there, one more each PAGE_EVERY_MS.
 * Trello's and Jira's apps page a list at a time the same way, so the column
 * a card is over never slides away under the finger.
 */
const PAGE_DWELL_MS = 350
const PAGE_EVERY_MS = 750

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
    badgeFor,
    onShowMore,
    lanes,
    crossProject = false,
    onOpen,
    columnOrder,
}: {
    /** The board as the server last described it, by status. */
    columns: Columns
    /** The status columns to show, in order: built-in and the project's own. */
    visible: StatusOption[]
    /** Whether this person may move this task. */
    canDrag: (task: TaskInfoInterface) => boolean
    /** Save a drop. The board already shows it. With lanes, drop.column is the
     * status and `lane` says which row the card left and which it entered. */
    onMove: (task: TaskInfoInterface, drop: SettledDrop<TaskInfoInterface>, lane?: { from: string; to: string }) => void
    /** Which board this is, so the columns folded on it are remembered. */
    boardKey?: string
    /** Make a task in a column (and lane) from its name; resolves whether it worked. */
    onQuickAdd?: (column: string, name: string, lane?: string) => Promise<boolean>
    /** A column's real total, for one the server sent only part of (any column since PROJ-BUG-8; lib/board/columnTotals). */
    totals?: Record<string, number | undefined>
    /** A word on each card the column does not already say (its status, on a board of people). */
    badgeFor?: (task: TaskInfoInterface, column: string) => string | undefined
    /** Load more of a column the server sent only part of (see totals; columnPaging says how). */
    onShowMore?: (column: string) => void
    /** Swimlanes: rows cutting every column, by person or priority. Memoise it. */
    lanes?: LaneSpec
    /** Its cards come from many projects (My Tasks): each wears its project's edge and tile. */
    crossProject?: boolean
    /** Open a card somewhere other than the panel beside the board (a phone has none: its page). */
    onOpen?: (task: TaskInfoInterface) => void
    /**
     * The project's column order, for someone who may change its statuses on
     * a board of status columns: columns then drag by a grip in their heads
     * (not on a phone) and their menus move them (columnDrag). Memoise it.
     */
    columnOrder?: Omit<ColumnOrdering, "drag">
}) {
    const [collapsed, toggleCollapsed] = useCollapsedColumns(boardKey)
    const [foldedLanes, toggleLane] = useCollapsedColumns(boardKey ? `${boardKey}:lanes` : undefined)
    // With lanes the board's lists are cells (one lane's share of one column);
    // everything below, the drag included, works on them unchanged.
    const board = useMemo(
        () => (lanes ? intoCells(columns, visible.map((v) => v.value), lanes) : columns),
        [columns, lanes, visible],
    )
    const lanesRef = useRef(lanes)
    lanesRef.current = lanes
    const [items, setItems] = useState<Columns>(board)
    const [activeTask, setActiveTask] = useState<TaskInfoInterface | null>(null)
    // Held from the keyboard rather than by the pointer: no card follows a
    // pointer, the held one stays in place, ringed, while the line moves.
    const [byKeys, setByKeys] = useState(false)
    const [said, say] = useState("")
    const instructions = useId()
    const refocus = useRef<string | null>(null)
    const [target, setTarget] = useState<Target | null>(null)
    const itemsRef = useRef(items)
    itemsRef.current = items
    const columnsRef = useRef(board)
    columnsRef.current = board
    const targetRef = useRef<Target | null>(null)
    // Where the finger or mouse is, read from the events themselves. dnd-kit's
    // delta also counts how far the board and the column scrolled under the
    // card, so pointer = start + delta was off by every pixel the board moved:
    // a card carried to the edge of a phone until the next column came in,
    // and dropped there, landed back where it started (or several cards down,
    // after the column scrolled).
    const pointer = useRef<{ x: number; y: number } | null>(null)
    const boardRef = useRef<HTMLDivElement>(null)
    const dragging = activeTask !== null
    const tilted = useRef(false)
    // The gap a column opens for the held card: its height and the 8px between
    // cards (make-room), set on the board as --room, so no card renders for it.
    const roomFor = (id: string) => {
        const card = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? []).find((c) => c.dataset.taskId === id)
        const h = card?.getBoundingClientRect().height ?? 0
        boardRef.current?.style.setProperty("--room", `${Math.round(h) + 8}px`)
    }

    const canDragRef = useRef(canDrag)
    canDragRef.current = canDrag
    const canDragTask = useCallback((task: TaskInfoInterface) => canDragRef.current(task), [])

    // Follow the server between drags, never during one. After a drop, keep
    // showing it until the data changes (the optimistic update or the server's
    // answer), or the card would jump back to where it started and forward again.
    const heldFrom = useRef<Columns | null>(null)
    // A card's sparks are lib/celebrate's, fetched once the page is idle.
    useEffect(() => warmBurstsWhenIdle(), [])
    useEffect(() => {
        if (dragging) return
        if (heldFrom.current === board) return
        heldFrom.current = null
        setItems((prev) => reuseUnchanged(prev, board))
    }, [board, dragging])

    const sensors = useSensors(useSensor(MouseSensor, MOUSE), useSensor(TouchSensor, TOUCH))

    const aim = (next: Target | null) => {
        const cur = targetRef.current
        if (cur?.column === next?.column && cur?.index === next?.index) return
        targetRef.current = next
        setTarget(next)
    }

    // Follow the pointer for as long as a card is held (passive: it never
    // holds up a scroll or the drag itself).
    useEffect(() => {
        if (!dragging || byKeys) return
        const follow = (e: Event) => {
            const p = pointerOf(e)
            if (p) pointer.current = p
        }
        window.addEventListener("touchmove", follow, { capture: true, passive: true })
        window.addEventListener("mousemove", follow, { capture: true, passive: true })
        return () => {
            window.removeEventListener("touchmove", follow, { capture: true })
            window.removeEventListener("mousemove", follow, { capture: true })
        }
    }, [dragging, byKeys])

    const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
        const task = active.data.current?.task as TaskInfoInterface | undefined
        if (!task || !canDragTask(task)) return
        pointer.current = pointerOf(activatorEvent)
        const touch = activatorEvent ? "touches" in activatorEvent : false
        tilted.current = activatorEvent ? touch : true
        // A long press that picks a card up taps the hand where it can
        // (Android), as a native board does (lib/ui/feedback: impact).
        if (touch) feedback("impact")
        roomFor(task.task_uuid)
        setByKeys(false)
        setActiveTask(task)
        // Until the pointer moves, it lands where it is.
        const cols = itemsRef.current
        const column = Object.keys(cols).find((k) => cols[k].some((t) => t.task_uuid === task.task_uuid))
        if (column) aim({ column, index: cols[column].findIndex((t) => t.task_uuid === task.task_uuid) })
    }

    const onDragMove = ({ active, delta }: DragMoveEvent) => {
        if (!activeTask || !boardRef.current) return
        // The lift's tilt leans the way the card first moves (pointer only).
        if (!tilted.current && Math.abs(delta.x) > 2) {
            tilted.current = true
            document.querySelector<HTMLElement>(".work-drag-overlay")?.style.setProperty("--tilt", delta.x < 0 ? "-1.5deg" : "1.5deg")
        }
        // The pointer for a mouse or finger; the lifted card's centre otherwise.
        const p = pointer.current
        if (p) return aimAt(p.x, p.y, String(active.id))
        const r = active.rect.current.translated
        if (r) aimAt(r.left + r.width / 2, r.top + r.height / 2, String(active.id))
    }

    // The list under (x, y) and the place in it, as the line shows it. Run on
    // each move, and again when the board or a column scrolls under a card
    // that is held still.
    const aimAt = (x: number, y: number, heldId: string) => {
        const board = boardRef.current
        if (!board) return
        let columnEl: HTMLElement | null = null
        // Columns span the board's height, so the pointer's x picks one; cells
        // in lanes are stacked, so both x and y must fall inside.
        const inLanes = Boolean(lanesRef.current)
        for (const el of board.querySelectorAll<HTMLElement>("[data-column]")) {
            const r = el.getBoundingClientRect()
            if (x >= r.left && x <= r.right && (!inLanes || (y >= r.top && y <= r.bottom))) {
                columnEl = el
                break
            }
        }
        // In the gap between columns (or lanes): keep the line where it is.
        if (!columnEl) return
        const mids: number[] = []
        for (const card of columnEl.querySelectorAll<HTMLElement>("[data-task-id]")) {
            if (card.dataset.taskId === heldId) continue
            const r = card.getBoundingClientRect()
            mids.push(r.top + r.height / 2)
        }
        aim({ column: columnEl.dataset.column!, index: insertionIndex(mids, y) })
    }

    const aimRef = useRef(aimAt)
    aimRef.current = aimAt
    // The board or a column scrolled under a card held still (a page turned,
    // a column scrolled at its foot): what is under the finger has changed.
    useEffect(() => {
        const board = boardRef.current
        if (!dragging || byKeys || !board || !activeTask) return
        const id = activeTask.task_uuid
        const again = () => {
            const p = pointer.current
            if (p) aimRef.current(p.x, p.y, id)
        }
        board.addEventListener("scroll", again, { capture: true, passive: true })
        return () => board.removeEventListener("scroll", again, { capture: true })
    }, [dragging, byKeys, activeTask])

    useEdgePaging(boardRef, pointer, dragging && !byKeys)
    useBoardPlace(boardRef, boardKey)

    const finish = () => {
        pointer.current = null
        targetRef.current = null
        setTarget(null)
        setActiveTask(null)
        setByKeys(false)
    }

    // Puts the held card where the line is, and saves it. Returns where it went.
    const settle = (task: TaskInfoInterface): Target | null => {
        const t = targetRef.current
        if (!t) return null
        const drop = placeCard(itemsRef.current, task.task_uuid, t.column, t.index)
        if (!drop || !dropMovedCard(itemsRef.current, drop, task.task_uuid)) return null
        heldFrom.current = columnsRef.current
        setItems(drop.items)
        // Save on the next frame, so the drop animation starts first: the
        // optimistic update copies every cached task list it touches.
        const ls = lanesRef.current
        // Into a done column from an open status: a task completed, which the
        // playful layer celebrates, from the card where it lands. Never on
        // the way back out.
        const toDone = visible.find((v) => v.value === splitCell(drop.column).column)?.category === "done" && !isClosedStatus(task.task_status)
        window.setTimeout(() => landCard(boardRef.current, task.task_uuid, toDone), DROP_MS)
        requestAnimationFrame(() => {
            if (!ls) return onMove(task, drop)
            const to = splitCell(drop.column)
            onMove(task, { ...drop, column: to.column }, { from: ls.laneOf(task), to: to.lane })
        })
        return { column: drop.column, index: drop.index }
    }

    const onDragEnd = ({ active }: DragEndEvent) => {
        if (activeTask && String(active.id) === activeTask.task_uuid) settle(activeTask)
        finish()
    }

    // The board's lists as a grid (one row, or a row per open lane), and how
    // many cards a list shows besides the held one, as the line counts them.
    const grid = (): string[][] => {
        const cols = visible.map((v) => v.value)
        const ls = lanesRef.current
        return ls ? ls.list.filter((l) => !foldedLanes.has(l.id)).map((l) => cols.map((c) => cellKey(l.id, c))) : [cols]
    }
    const shownIn = (list: string, held: string) => {
        const el = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-column]") ?? []).find((c) => c.dataset.column === list)
        return el ? Array.from(el.querySelectorAll<HTMLElement>("[data-task-id]")).filter((c) => c.dataset.taskId !== held).length : 0
    }
    const nameOf = (list: string) => {
        const { lane, column } = splitCell(list)
        const status = visible.find((v) => v.value === column)?.label ?? column
        const row = lane ? lanesRef.current?.list.find((l) => l.id === lane)?.label : undefined
        return row ? `${row}, ${status}` : status
    }

    // Space picks up the focused card; while one is held, the arrows move the
    // line, Space or Enter drops and Escape or Tab puts it back. Caught on the
    // way down, so the card's own Enter (open) and the list's keys never see
    // a key that belongs to the move.
    const onKeyDownCapture = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        const el = e.target instanceof HTMLElement ? e.target : null
        if (!activeTask) {
            if (e.key !== " " || !el?.dataset.taskId || activeTask) return
            const id = el.dataset.taskId
            const column = Object.keys(itemsRef.current).find((k) => itemsRef.current[k].some((t) => t.task_uuid === id))
            const task = column ? itemsRef.current[column].find((t) => t.task_uuid === id) : undefined
            if (!task || !column || !canDragTask(task)) return
            e.preventDefault()
            e.stopPropagation()
            const index = itemsRef.current[column].findIndex((t) => t.task_uuid === id)
            roomFor(id)
            setByKeys(true)
            setActiveTask(task)
            aim({ column, index })
            say(`Picked up ${task.task_name}. ${spotLabel(nameOf(column), index, shownIn(column, id))}. Arrow keys move it, Space drops it, Escape puts it back.`)
            return
        }
        if (!byKeys) return
        const held = activeTask
        const step = moveKeyOf(e.key)
        if (step) {
            e.preventDefault()
            e.stopPropagation()
            const at = targetRef.current
            if (!at) return
            const next = stepSpot(grid(), (list) => shownIn(list, held.task_uuid), at, step)
            aim(next)
            say(spotLabel(nameOf(next.column), next.index, shownIn(next.column, held.task_uuid)))
            return
        }
        if (e.key === " " || e.key === "Enter") {
            e.preventDefault()
            e.stopPropagation()
            const at = settle(held)
            refocus.current = held.task_uuid
            say(at ? `Dropped. ${spotLabel(nameOf(at.column), at.index, shownIn(at.column, held.task_uuid))}.` : `Put back where it was.`)
            finish()
            return
        }
        if (e.key === "Escape" || e.key === "Tab") {
            if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
            }
            refocus.current = e.key === "Escape" ? held.task_uuid : null
            say(`Put back where it was.`)
            finish()
        }
    }

    // After a drop from the keyboard the card may sit in another column (a new
    // element): focus follows it there, so the next move starts from it.
    useEffect(() => {
        const id = refocus.current
        if (!id || activeTask) return
        refocus.current = null
        const card = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? []).find((c) => c.dataset.taskId === id)
        card?.focus()
    })

    const liftedId = byKeys ? (activeTask?.task_uuid ?? null) : null

    // The cards' menu: "Move to…" each column, as a drop at its top would.
    // Made once; it reads the board through refs, so no card renders for it.
    const visibleRef = useRef(visible)
    visibleRef.current = visible
    const moveRef = useRef<(task: TaskInfoInterface, column: string) => void>(() => {})
    moveRef.current = (task, column) => {
        const ls = lanesRef.current
        const list = ls ? cellKey(ls.laneOf(task), column) : column
        targetRef.current = { column: list, index: 0 }
        settle(task)
        targetRef.current = null
        say(`Moved ${task.task_name} to ${visibleRef.current.find((v) => v.value === column)?.label ?? column}.`)
    }
    const onOpenRef = useRef(onOpen)
    onOpenRef.current = onOpen
    const dispatch = useDispatch()
    // On a phone, held either way (components/ui/overlayMode), a card's menu
    // is one sheet for the whole board (CardSheet): the card it is for, kept
    // while the sheet goes, and whether it is open. usePhone pages the board.
    const phone = usePhone()
    const sheet = useSheetMode()
    const [menu, setMenu] = useState<{ task: TaskInfoInterface | null; open: boolean }>({ task: null, open: false })
    const actions = useMemo<BoardActions>(
        () => ({
            columns: () => visibleRef.current,
            moveTo: (task, column) => moveRef.current(task, column),
            canMove: (task) => canDragRef.current(task),
            open: (task) => {
                if (onOpenRef.current) return onOpenRef.current(task)
                dispatch(openRightPanel({ chatMessageUUID: "", chatUUID: "", channelUUID: "", postUUID: "", taskUUID: task.task_uuid, groupUUID: "", docUUID: "" }))
            },
            openMenu: sheet ? (task) => setMenu({ task, open: true }) : undefined,
            crossProject,
        }),
        [crossProject, sheet, dispatch],
    )
    // The column the sheet's card is in now, for its check.
    const menuList = menu.task ? Object.keys(items).find((k) => items[k].some((t) => t.task_uuid === menu.task?.task_uuid)) : undefined

    // Columns in the project's order (columnDrag): a grip and its keys where a
    // drag can be had (not on a phone), the menu's moves everywhere.
    const columnHelp = useId()
    const ordering = useMemo(() => (columnOrder ? { ...columnOrder, drag: !phone } : undefined), [columnOrder, phone])
    const columnDrag = useColumnDrag({ boardRef, visible, ordering, say, describedBy: columnHelp, animate: !lanes })
    const heldColumn = columnDrag.held ? visible.find((v) => v.value === columnDrag.held) : undefined

    // The line stays in view as the keys move it down a long column.
    useEffect(() => {
        if (!byKeys || !target) return
        boardRef.current?.querySelector<HTMLElement>("[data-drop-line]")?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
    }, [byKeys, target])

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={noCollisions}
            autoScroll={AUTO_SCROLL}
            // A column's grip or a card: each drag is one or the other.
            onDragStart={(e) => {
                if (!columnDrag.onDragStart(e)) onDragStart(e)
            }}
            onDragMove={onDragMove}
            onDragEnd={(e) => {
                if (!columnDrag.onDragEnd()) onDragEnd(e)
            }}
            onDragCancel={() => {
                if (!columnDrag.onDragCancel()) finish()
            }}
        >
            <ColumnOrderProvider value={columnDrag.actions}>
            <BoardActionsContext.Provider value={actions}>
            {/* Display contents: only here to catch the keys of the cards inside. */}
            <div className="contents" data-escape-own={!!activeTask && byKeys ? "" : undefined} onKeyDownCapture={onKeyDownCapture}>
            {lanes ? (
                <LaneGrid
                    boardRef={boardRef}
                    lanes={lanes.list}
                    visible={visible}
                    items={items}
                    canDrag={canDragTask}
                    activeId={activeTask?.task_uuid ?? null}
                    liftedId={liftedId}
                    describedBy={instructions}
                    target={target}
                    folded={foldedLanes}
                    onToggleLane={toggleLane}
                    onQuickAdd={onQuickAdd}
                    totals={totals}
                    onShowMore={onShowMore}
                    badgeFor={badgeFor}
                    heldColumn={columnDrag.held}
                    heldByPointer={columnDrag.heldByPointer}
                />
            ) : (
            // Columns 280px apart by 12 (8 on a phone, where each snaps to the
            // screen's 16px margin and the next one peeks in at the right, so
            // the board says it goes on); the last column keeps 20px of room
            // after it, so nothing is clipped at the board's end. On a phone
            // that room is 40px (16 + 8 + 16), what the last column needs to
            // snap to the same 16px margin: with 28 it stopped 12px short.
            <div className="flex h-full min-h-0 flex-col">
            <div
                ref={boardRef}
                className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-4 pb-4 snap-x snap-mandatory scroll-px-4 sm:gap-3 sm:px-0 sm:snap-none sm:scroll-px-0 after:w-4 after:shrink-0 after:content-[''] sm:after:w-5"
                data-board-scroll=""
                data-board=""
            >
                {visible.map((status) => (
                    <BoardColumn
                        key={status.value}
                        status={status}
                        tasks={items[status.value] ?? NO_TASKS}
                        canDrag={canDragTask}
                        activeId={activeTask?.task_uuid ?? null}
                        liftedId={liftedId}
                        describedBy={instructions}
                        lineAt={target?.column === status.value ? target.index : null}
                        collapsed={collapsed.has(status.value)}
                        onToggleCollapse={toggleCollapsed}
                        onQuickAdd={onQuickAdd}
                        total={totals?.[status.value]}
                        badgeFor={badgeFor}
                        onShowMore={onShowMore}
                        // Only an empty column draws anything for a drag (its
                        // drop slot), so only it hears of one: a pickup
                        // re-rendered every column and its cards before.
                        dragActive={dragging && (items[status.value]?.length ?? 0) === 0}
                        lifted={columnDrag.held === status.value ? (columnDrag.heldByPointer ? "pointer" : "keys") : undefined}
                    />
                ))}
            </div>
            <BoardPager boardRef={boardRef} count={visible.length} />
            </div>
            )}
            </div>
            </BoardActionsContext.Provider>
            </ColumnOrderProvider>
            <ColumnDropLine line={columnDrag.line} />
            {sheet && (
                <CardSheet
                    task={menu.task}
                    open={menu.open}
                    onOpenChange={(open) => setMenu((m) => ({ ...m, open }))}
                    columns={visible}
                    current={menuList === undefined ? undefined : splitCell(menuList).column}
                    canMove={menu.task ? canDragTask(menu.task) : false}
                    onOpenTask={actions.open}
                    onMove={actions.moveTo}
                />
            )}
            <p id={instructions} className="sr-only">
                Press Space to pick the task up, the arrow keys to move it, and Space again to put it down. Escape puts it back.
            </p>
            <p id={columnHelp} className="sr-only">
                Moves the column for everyone in the project. Press Space to pick it up, the left and right arrow keys to move it, and Space again to put it down. Escape puts it back.
            </p>
            <p aria-live="assertive" aria-atomic="true" className="sr-only">
                {said}
            </p>
            {typeof document !== "undefined" &&
                createPortal(
                    <DragOverlay dropAnimation={dropAnimation} className="work-drag-overlay">
                        {heldColumn && columnDrag.heldByPointer ? (
                            <ColumnLift status={heldColumn} width={columnDrag.liftWidth} count={Math.max(totals?.[heldColumn.value] ?? 0, items[heldColumn.value]?.length ?? 0)} />
                        ) : activeTask && !byKeys ? (
                            <Item task={activeTask} value={activeTask.task_uuid} dragOverlay />
                        ) : null}
                    </DragOverlay>,
                    document.body,
                )}
        </DndContext>
    )
}

const NO_TASKS: TaskInfoInterface[] = []

/**
 * next, keeping prev's array for each list that holds the same cards: the
 * board's data is rebuilt whole when one task changes (a drop, an edit), and
 * a column given a new array of the same cards would render again for nothing.
 */
export function reuseUnchanged(prev: Columns, next: Columns): Columns {
    const out: Columns = {}
    let same = Object.keys(prev).length === Object.keys(next).length
    for (const [k, list] of Object.entries(next)) {
        const old = prev[k]
        if (old && old.length === list.length && old.every((t, i) => t === list[i])) out[k] = old
        else {
            out[k] = list
            same = false
        }
    }
    return same ? prev : out
}

/**
 * One column. Memoised: while a card is dragged, only the column the line is
 * in, and the one it just left, render again.
 */
const BoardColumn = memo(function BoardColumn({
    status,
    tasks,
    canDrag,
    activeId,
    liftedId,
    describedBy,
    lineAt,
    collapsed,
    onToggleCollapse,
    onQuickAdd,
    total,
    badgeFor,
    onShowMore,
    dragActive,
    lifted,
}: {
    status: StatusOption
    tasks: TaskInfoInterface[]
    canDrag: (task: TaskInfoInterface) => boolean
    activeId: string | null
    /** The card held from the keyboard, if any. */
    liftedId: string | null
    /** The board's instructions for moving a card from the keyboard. */
    describedBy: string
    /** Where the drop line is, counted among the cards other than the one lifted. */
    lineAt: number | null
    collapsed: boolean
    onToggleCollapse: (column: string) => void
    onQuickAdd?: (column: string, name: string) => Promise<boolean>
    total?: number
    badgeFor?: (task: TaskInfoInterface, column: string) => string | undefined
    onShowMore?: (column: string) => void
    /** A card is held somewhere on the board. */
    dragActive: boolean
    /** This column is held to be moved (columnDrag), and how. */
    lifted?: "pointer" | "keys"
}) {
    // A drop target only for the keyboard, whose sensor steps between columns.
    const id = status.value
    // Its place in the project's order, where this person may change it.
    const order = useColumnOrder()
    const move = useMemo(
        () => (order ? { left: () => order.move(id, -1), right: () => order.move(id, 1), canLeft: () => order.canMove(id, -1), canRight: () => order.canMove(id, 1) } : undefined),
        [order, id],
    )
    const { setNodeRef } = useDroppable({ id, data: { type: "container", children: tasks } })
    const [adding, setAdding] = useState(false)
    // Lit only for a card from another column; in its own a card just opens a gap.
    const isSource = activeId !== null && tasks.some((t) => t.task_uuid === activeId)
    const count = Math.max(total ?? 0, tasks.length)
    return (
        <Container
            collapsed={collapsed}
            onToggleCollapse={() => onToggleCollapse(id)}
            onAdd={onQuickAdd ? () => setAdding(true) : undefined}
            footer={onQuickAdd && !collapsed ? <QuickAdd open={adding} onOpenChange={setAdding} empty={count === 0} onAdd={(name) => onQuickAdd(id, name)} /> : undefined}
            ref={setNodeRef}
            label={id}
            title={status.label}
            status={status}
            count={count}
            scrollable
            hover={lineAt !== null && !isSource}
            dragActive={dragActive}
            data-column={id}
            {...{ [COLUMN_SLOT]: id }}
            grip={order?.drag ? <ColumnGrip status={status} /> : undefined}
            move={move}
            lifted={lifted}
        >
            <CardStack
                id={id}
                column={id}
                tasks={tasks}
                canDrag={canDrag}
                activeId={activeId}
                liftedId={liftedId}
                describedBy={describedBy}
                lineAt={lineAt}
                total={total}
                paging={columnPaging(status)}
                badgeFor={badgeFor}
                onShowMore={onShowMore}
                className="pb-4"
            />
        </Container>
    )
})

/**
 * A column's (or a lane cell's) cards: a page at first and more as it is
 * scrolled, so a big board opens and drags as fast as a small one, with the
 * line where a dragged card would land.
 */
function CardStack({
    id,
    column,
    tasks,
    canDrag,
    activeId,
    liftedId,
    describedBy,
    lineAt,
    total,
    paging,
    badgeFor,
    onShowMore,
    className,
}: {
    /** The list's key on the board: a status, or a lane cell. */
    id: string
    /** The status the list is in. */
    column: string
    tasks: TaskInfoInterface[]
    canDrag: (task: TaskInfoInterface) => boolean
    activeId: string | null
    liftedId: string | null
    describedBy: string
    lineAt: number | null
    total?: number
    /** How the column goes on past what the server sent (columnPaging). */
    paging?: Paging
    badgeFor?: (task: TaskInfoInterface, column: string) => string | undefined
    onShowMore?: (column: string) => void
    className?: string
}) {
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
    // Make room (work.md W22): the cards from the line down move aside by the
    // held card's height and the gap (--room, on the board), 160 ms, so the
    // gap is where it will land. Set on the cards' elements, not their props:
    // a step renders no card. In the card's own column, at its own place,
    // the slot it left already says so and nothing moves.
    const stack = useRef<HTMLDivElement>(null)
    const sourceAt = activeId ? shown.findIndex((t) => t.task_uuid === activeId) : -1
    useLayoutEffect(() => {
        const slots = stack.current?.querySelectorAll<HTMLElement>(":scope > [data-card-slot]")
        if (!slots) return
        const open = lineAt !== null && !(sourceAt >= 0 && lineAt === sourceAt)
        let pos = 0
        slots.forEach((el) => {
            if (el.dataset.cardSlot === activeId) {
                delete el.dataset.shift
                return
            }
            if (open && pos >= lineAt!) el.dataset.shift = ""
            else delete el.dataset.shift
            pos++
        })
    }, [lineAt, activeId, sourceAt, shown])
    let k = 0
    return (
            <div ref={stack} className={cn("flex flex-col gap-2 w-full", className)}>
                {shown.map((task) => {
                    const position = task.task_uuid === activeId ? -1 : k++
                    return (
                        <BoardCard
                            key={task.task_uuid}
                            task={task}
                            column={id}
                            disabled={!canDrag(task)}
                            lifted={task.task_uuid === liftedId}
                            describedBy={describedBy}
                            // Its own status, where the column does not already say it
                            // (My Tasks has only the built-in columns).
                            statusBadge={badgeFor ? badgeFor(task, column) : task.task_custom_status && task.task_custom_status !== column ? task.task_custom_status_name : undefined}
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
                    <div className="flex flex-col items-center gap-1 px-2 py-2 text-center text-xs text-muted-foreground">
                        <span>
                            {paging?.closed === false ? "The first" : "The newest"} {tasks.length} of {total}.
                        </span>
                        {onShowMore && tasks.length < (paging?.max ?? BOARD_CLOSED_MAX) ? (
                            <button
                                type="button"
                                onClick={() => onShowMore(column)}
                                data-touch-target=""
                                className="rounded-md px-2 py-1 font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                            >
                                Show {Math.min(paging?.step ?? BOARD_CLOSED_STEP, total - tasks.length)} more
                            </button>
                        ) : (
                            <span>The list view has them all.</span>
                        )}
                    </div>
                )}
                {more && (
                    <div ref={sentinel} className="py-2 text-center text-xs text-muted-foreground">
                        {tasks.length - limit} more
                    </div>
                )}
            </div>
    )
}

/** Width of a column in lanes: the column heads and every cell share it. */
const LANE_CELL = "w-[min(280px,calc(100vw-32px))] shrink-0"

/**
 * The board in swimlanes: status heads pinned on top, then a row per lane. A
 * lane folds to its header (remembered per board), and its header stays at
 * the left edge while the board scrolls sideways.
 */
function LaneGrid({
    boardRef,
    lanes,
    visible,
    items,
    canDrag,
    activeId,
    liftedId,
    describedBy,
    target,
    folded,
    onToggleLane,
    onQuickAdd,
    totals,
    onShowMore,
    badgeFor,
    heldColumn,
    heldByPointer,
}: {
    boardRef: React.RefObject<HTMLDivElement | null>
    lanes: Lane[]
    visible: StatusOption[]
    items: Columns
    canDrag: (task: TaskInfoInterface) => boolean
    activeId: string | null
    liftedId: string | null
    describedBy: string
    target: Target | null
    folded: Set<string>
    onToggleLane: (lane: string) => void
    onQuickAdd?: (column: string, name: string, lane?: string) => Promise<boolean>
    totals?: Record<string, number | undefined>
    onShowMore?: (column: string) => void
    badgeFor?: (task: TaskInfoInterface, column: string) => string | undefined
    /** The column held to be moved (columnDrag), and whether by the pointer. */
    heldColumn?: string | null
    heldByPointer?: boolean
}) {
    const inColumn = (status: string) => lanes.reduce((n, l) => n + (items[cellKey(l.id, status)]?.length ?? 0), 0)
    const order = useColumnOrder()
    return (
        <div ref={boardRef} className="h-full overflow-auto overscroll-contain px-4 pb-4 sm:px-0" data-board-scroll="">
            <div className="w-max min-w-full">
                <div className="sticky top-0 z-20 flex gap-3 bg-sheet pb-2 pl-1">
                    {visible.map((status) => {
                        const loaded = inColumn(status.value)
                        const total = totals?.[status.value]
                        const capped = total !== undefined && total > loaded
                        const paging = columnPaging(status)
                        const hue = columnHue(status)
                        const lifted = heldColumn === status.value
                        return (
                            <div
                                key={status.value}
                                {...{ [COLUMN_SLOT]: status.value }}
                                data-column-lifted={lifted ? (heldByPointer ? "pointer" : "keys") : undefined}
                                className={cn(
                                    LANE_CELL,
                                    "group/column flex h-10 items-center gap-2 rounded-lg px-2",
                                    columnWash(hue),
                                    lifted && heldByPointer && "opacity-40",
                                    lifted && !heldByPointer && "ring-2 ring-primary",
                                )}
                            >
                                {/* Its grip, as a board without lanes has it: the order is the project's,
                                    so the column moves in every lane. */}
                                {order?.drag && (
                                    <div className="-ml-1 -mr-1 flex pointer-events-none opacity-0 transition-opacity duration-[140ms] focus-within:pointer-events-auto focus-within:opacity-100 group-hover/column:pointer-events-auto group-hover/column:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                                        <ColumnGrip status={status} />
                                    </div>
                                )}
                                {/* The column's lozenge, as a board without lanes heads it. */}
                                <span data-column-lozenge="" className={cn("inline-flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-2 text-xs font-[510]", columnLozenge(hue))}>
                                    <TaskStatusCell status={status} label="tip" />
                                    <h2 className="truncate">{status.label}</h2>
                                </span>
                                <span className="text-xs tabular-nums text-ink-3">{Math.max(total ?? 0, loaded)}</span>
                                {/* Its moves, as a column's own menu has them: the way on a phone. */}
                                {order && (
                                    <div className="order-last ml-auto flex pointer-events-none opacity-0 transition-opacity duration-[140ms] focus-within:pointer-events-auto focus-within:opacity-100 group-hover/column:pointer-events-auto group-hover/column:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                                        <ColumnMoveMenu
                                            name={status.label}
                                            move={{
                                                left: () => order.move(status.value, -1),
                                                right: () => order.move(status.value, 1),
                                                canLeft: () => order.canMove(status.value, -1),
                                                canRight: () => order.canMove(status.value, 1),
                                            }}
                                        />
                                    </div>
                                )}
                                {capped && onShowMore && loaded < paging.max && (
                                    <button
                                        type="button"
                                        onClick={() => onShowMore(status.value)}
                                        title={`The ${paging.closed ? "newest" : "first"} ${loaded} of ${total} are on the board`}
                                        data-touch-target=""
                                        className="rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                                    >
                                        Show more
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
                <div className="flex flex-col gap-1">
                    {lanes.map((lane) => {
                        const isFolded = folded.has(lane.id)
                        const count = visible.reduce((n, s) => n + (items[cellKey(lane.id, s.value)]?.length ?? 0), 0)
                        return (
                            <section key={lane.id} aria-label={lane.label} className="flex flex-col">
                                <div className="sticky left-0 z-10 w-fit">
                                    <button
                                        type="button"
                                        onClick={() => onToggleLane(lane.id)}
                                        aria-expanded={!isFolded}
                                        data-touch-target=""
                                        className="group/lane inline-flex items-center gap-2 rounded-md px-1.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                                    >
                                        {isFolded ? (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                                        )}
                                        {lane.icon}
                                        <span className="truncate">{lane.label}</span>
                                        <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
                                    </button>
                                </div>
                                {!isFolded && (
                                    <div className="flex gap-3 pb-3 pl-1">
                                        {visible.map((status) => {
                                            const id = cellKey(lane.id, status.value)
                                            return (
                                                <LaneCell
                                                    key={id}
                                                    hue={columnHue(status)}
                                                    id={id}
                                                    lane={lane.id}
                                                    column={status.value}
                                                    tasks={items[id] ?? NO_TASKS}
                                                    canDrag={canDrag}
                                                    activeId={activeId}
                                                    liftedId={liftedId}
                                                    describedBy={describedBy}
                                                    lineAt={target?.column === id ? target.index : null}
                                                    onQuickAdd={onQuickAdd}
                                                    badgeFor={badgeFor}
                                                />
                                            )
                                        })}
                                    </div>
                                )}
                            </section>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

/** One lane's share of one column: somewhere to drop even when empty. */
const LaneCell = memo(function LaneCell({
    hue,
    id,
    lane,
    column,
    tasks,
    canDrag,
    activeId,
    liftedId,
    describedBy,
    lineAt,
    onQuickAdd,
    badgeFor,
}: {
    /** Its column's status hue (columnLook): the lane's share of the column wears the column's wash. */
    hue: CampHue | null
    id: string
    lane: string
    column: string
    tasks: TaskInfoInterface[]
    canDrag: (task: TaskInfoInterface) => boolean
    activeId: string | null
    liftedId: string | null
    describedBy: string
    lineAt: number | null
    onQuickAdd?: (column: string, name: string, lane?: string) => Promise<boolean>
    badgeFor?: (task: TaskInfoInterface, column: string) => string | undefined
}) {
    const { setNodeRef } = useDroppable({ id, data: { type: "container", children: tasks } })
    return (
        <div
            ref={setNodeRef}
            data-column={id}
            // Under a held card: the layer's drop well (INTERACTION_SPEC §5.2).
            data-drop={lineAt !== null ? "valid" : undefined}
            className={cn(
                LANE_CELL,
                "group/cell flex min-h-[4.5rem] flex-col gap-2 rounded-lg p-2 transition-[background-color,box-shadow] duration-[140ms] [contain:layout]",
                columnWash(hue),
            )}
        >
            <CardStack id={id} column={column} tasks={tasks} canDrag={canDrag} activeId={activeId} liftedId={liftedId} describedBy={describedBy} lineAt={lineAt} badgeFor={badgeFor} />
            {onQuickAdd && <QuickAdd compact onAdd={(name) => onQuickAdd(column, name, lane)} />}
        </div>
    )
})

/**
 * Where a dragged card will land: the layer's 2px accent line with its ring
 * (app/interaction.css [data-drop-line], INTERACTION_SPEC §5.1), in the
 * middle of the gap the cards open for it (work.md W22). Above a card that
 * has moved aside, it rises by half the room, to the gap's middle. It takes
 * no space, and the keys keep it in view.
 */
function DropLine({ className }: { className: string }) {
    return <span aria-hidden="true" data-drop-line="" className={cn("pointer-events-none absolute inset-x-1 z-10 block", className)} />
}

const BoardCard = memo(function BoardCard({
    task,
    column,
    disabled,
    lifted,
    describedBy,
    lineAbove,
    lineBelow,
    statusBadge,
}: {
    task: TaskInfoInterface
    column: string
    disabled: boolean
    /** Held from the keyboard: it stays in place, ringed, while the line moves. */
    lifted: boolean
    describedBy: string
    statusBadge?: string
    lineAbove: boolean
    lineBelow: boolean
}) {
    const { setNodeRef, listeners, isDragging } = useDraggable({
        id: task.task_uuid,
        data: { type: "task", task, containerId: column },
        disabled,
    })
    const { highlighted, selected } = useRowState(task.task_uuid)
    return (
        <div
            data-card-slot={task.task_uuid}
            className="relative transition-transform duration-[160ms] ease-out data-[shift]:translate-y-[var(--room,0px)]"
        >
            {lineAbove && <DropLine className="-top-[5px] [[data-shift]>&]:top-[calc(-5px_-_var(--room,0px)/2)]" />}
            <Item
                ref={setNodeRef}
                value={task.task_uuid}
                task={task}
                statusBadge={statusBadge}
                dragging={isDragging}
                lifted={lifted}
                highlighted={highlighted}
                selected={selected}
                listeners={disabled ? undefined : listeners}
                data-task-id={task.task_uuid}
                aria-describedby={disabled ? undefined : describedBy}
            />
            {lineBelow && <DropLine className="-bottom-[5px]" />}
        </div>
    )
})

/**
 * "New task" at the foot of a column, Asana's way (work.md W20): a ghost row,
 * 32px and full width, that waits for the column's hover (always there on an
 * empty column or a touch screen). Typing a name and Enter adds it here and
 * leaves the box open for the next; Escape or an empty blur closes. The
 * column's "+" opens it too.
 */
function QuickAdd({
    onAdd,
    compact = false,
    open: controlled,
    onOpenChange,
    empty = false,
}: {
    onAdd: (name: string) => Promise<boolean>
    compact?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
    empty?: boolean
}) {
    const [own, setOwn] = useState(false)
    const open = controlled ?? own
    const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOwn(v))
    const [name, setName] = useState("")
    const [busy, setBusy] = useState(false)
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-touch-target=""
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-md text-xs text-ink-3 transition-[color,background-color,opacity] duration-[140ms] hover:bg-hover hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:opacity-100",
                    // In a lane cell it waits for the pointer, so a board of
                    // many cells stays quiet; a touch screen always shows it.
                    compact
                        ? "self-start px-2 py-1 text-xs [@media(hover:hover)]:opacity-0 group-hover/cell:opacity-100"
                        : cn("mx-2 mb-2 h-8 shrink-0 px-2", !empty && "[@media(hover:hover)]:opacity-0 group-hover/column:opacity-100"),
                )}
            >
                <Plus className="size-3.5" />
                New task
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
        <div className={compact ? undefined : "mx-2 mb-2"}>
            <input
                autoFocus
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                data-escape-own=""
                onKeyDown={fieldKeyDown((e) => {
                    if (e.key === "Enter") {
                        e.preventDefault()
                        void submit()
                    } else if (e.key === "Escape") {
                        // Handled here: a task panel open beside the board stays open.
                        e.preventDefault()
                        setOpen(false)
                        setName("")
                    }
                })}
                onBlur={() => !name.trim() && setOpen(false)}
                placeholder="Task name, then Enter"
                aria-label="New task name"
                maxLength={200}
                className="h-9 w-full rounded-[10px] bg-raised px-3 text-sm shadow-e1 outline-none placeholder:text-ink-3 focus:outline-1 focus:outline-brand/50 focus:ring-[3px] focus:ring-brand/12 disabled:opacity-60"
            />
        </div>
    )
}

/**
 * Turns a paged board (a phone) one column while a held card waits at its
 * left or right edge: PAGE_DWELL_MS there, then one more each PAGE_EVERY_MS.
 * The edge is the outer 10% of the board, at least 24px. Each turn ticks
 * (lib/ui/feedback: selection). It reads the pointer from a ref on each
 * frame, so a drag renders nothing for it.
 */
function useEdgePaging(boardRef: React.RefObject<HTMLDivElement | null>, pointer: React.RefObject<{ x: number; y: number } | null>, active: boolean) {
    useEffect(() => {
        const board = boardRef.current
        if (!active || !board || !isPaged(board) || typeof requestAnimationFrame !== "function") return
        let side = 0
        let since = 0
        let last = 0
        let frame = 0
        const tick = (now: number) => {
            const p = pointer.current
            const r = board.getBoundingClientRect()
            const edge = Math.max(24, r.width * 0.1)
            const at = !p || p.y < r.top || p.y > r.bottom ? 0 : p.x >= r.right - edge ? 1 : p.x <= r.left + edge ? -1 : 0
            if (at !== side) {
                side = at
                since = now
            } else if (at !== 0 && now - since >= PAGE_DWELL_MS && now - last >= PAGE_EVERY_MS) {
                const max = board.scrollWidth - board.clientWidth
                const can = at > 0 ? board.scrollLeft < max - 1 : board.scrollLeft > 1
                if (can) {
                    last = now
                    const first = board.querySelector<HTMLElement>("[data-column]")
                    const step = (first?.getBoundingClientRect().width ?? board.clientWidth) + 8
                    board.scrollBy({ left: at * step, behavior: prefersReducedMotion() ? "auto" : "smooth" })
                    feedback("selection")
                }
            }
            frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [boardRef, pointer, active])
}

type Place = { column: string; top: number }
const isPlace = (v: unknown): v is Place =>
    typeof v === "object" && v !== null && typeof (v as Place).column === "string" && typeof (v as Place).top === "number"

/**
 * Where a paged board (a phone) was, put back when it is drawn again: the
 * column at the margin and how far down its cards were scrolled, kept per
 * board for this tab's session. A card opens on the task's own page, and a
 * tab is drawn afresh when it is chosen again, so back from a task, or a
 * return to the Board tab, showed the first column at its top every time.
 */
function useBoardPlace(boardRef: React.RefObject<HTMLDivElement | null>, boardKey: string | undefined) {
    useLayoutEffect(() => {
        const board = boardRef.current
        if (!boardKey || !board || !isPaged(board)) return
        const key = `oc_board_at:${boardKey}`
        const columns = () => Array.from(board.querySelectorAll<HTMLElement>("[data-column]"))
        // Where a column comes to rest: the board's edge and its 16px margin.
        const pad = parseFloat(getComputedStyle(board).scrollPaddingLeft) || 0
        const margin = () => board.getBoundingClientRect().left + pad
        try {
            const at: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null")
            const column = isPlace(at) ? columns().find((c) => c.dataset.column === at.column) : undefined
            if (column && isPlace(at)) {
                board.scrollLeft += column.getBoundingClientRect().left - margin()
                const cards = column.querySelector<HTMLElement>("[data-board-scroll]")
                if (cards) cards.scrollTop = at.top
            }
        } catch {
            // Nothing kept, or no storage (a private window): the first column.
        }
        // Read on each scroll, while the board is this one: the column nearest
        // the margin, and its cards' scroll. Written once the scroll has
        // settled, and at once if the board goes before then (a card tapped as
        // the board came to rest), from what was read, never from the page
        // then, which may already be another board.
        let place: Place | null = null
        let timer = 0
        const save = () => {
            timer = 0
            try {
                if (place) sessionStorage.setItem(key, JSON.stringify(place))
            } catch {
                // No storage: the board starts at its first column.
            }
        }
        const keep = () => {
            const at = margin()
            let near: HTMLElement | undefined
            let off = Infinity
            for (const c of columns()) {
                const d = Math.abs(c.getBoundingClientRect().left - at)
                if (d < off) {
                    near = c
                    off = d
                }
            }
            if (!near?.dataset.column) return
            place = { column: near.dataset.column, top: Math.round(near.querySelector<HTMLElement>("[data-board-scroll]")?.scrollTop ?? 0) }
            window.clearTimeout(timer)
            timer = window.setTimeout(save, 150)
        }
        board.addEventListener("scroll", keep, { capture: true, passive: true })
        return () => {
            board.removeEventListener("scroll", keep, { capture: true })
            if (timer) {
                window.clearTimeout(timer)
                save()
            }
        }
    }, [boardRef, boardKey])
}

/**
 * On a phone, one column per screen: a 6px dot per column under the board,
 * the one in view in ink (work.md W20). It follows the board's scroll by
 * writing to its dots, so scrolling renders nothing.
 */
function BoardPager({ boardRef, count }: { boardRef: React.RefObject<HTMLDivElement | null>; count: number }) {
    const dots = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const board = boardRef.current
        if (!board) return
        const paint = () => {
            const first = board.querySelector<HTMLElement>("[data-column]")
            const step = (first?.getBoundingClientRect().width ?? board.clientWidth) + 8
            const at = Math.round(board.scrollLeft / Math.max(1, step))
            dots.current?.querySelectorAll<HTMLElement>("[data-dot]").forEach((d, i) => {
                if (i === at) d.dataset.on = ""
                else delete d.dataset.on
            })
        }
        paint()
        board.addEventListener("scroll", paint, { passive: true })
        return () => board.removeEventListener("scroll", paint)
    }, [boardRef, count])
    if (count < 2) return null
    return (
        <div ref={dots} aria-hidden="true" data-board-pager="" className="flex justify-center gap-1.5 pb-2 sm:hidden">
            {Array.from({ length: count }, (_, i) => (
                <span key={i} data-dot="" className="size-1.5 rounded-full bg-ink-4 transition-colors data-[on]:bg-ink" />
            ))}
        </div>
    )
}
