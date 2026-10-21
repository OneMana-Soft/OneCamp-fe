"use client"

/**
 * Dragging a board's columns into order (design/projects-vs-asana-jira/
 * BOARD_COLUMNS_PLAN.md). The order is the project's, shared by everyone:
 * only someone who may change its statuses gets the grip and the menu's
 * moves, and the server refuses everyone else.
 *
 * Like a card's drag, nothing on the board moves while a column is held: it
 * lifts as a copy of its head, the column it left dims, and a line shows the
 * gap it will go to, only where it may go (Done, Cancelled and their own stay
 * after the open columns: lib/board/columnOrder). On the drop the columns
 * slide to their new places (FLIP), unless motion is reduced.
 *
 * The grip is a button. Space or Enter picks the column up, the arrows move
 * the line, Space or Enter puts it down and Escape puts it back, each step
 * said aloud. A phone has no grip (a drag in a board that scrolls sideways
 * fights the scroll): the column's menu moves it left or right.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react"
import { createPortal } from "react-dom"
import { useDraggable, type DragStartEvent } from "@dnd-kit/core"
import { dropColumn, placesFor, shiftColumn } from "@/lib/board/columnOrder"
import type { StatusOption } from "@/lib/taskStatus"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { GripVertical } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { columnHue, columnLozenge, columnWash } from "@/components/kanbanComponents/columnLook"

/** What the board needs to put its columns in the project's order. */
export interface ColumnOrdering {
  /** Every status of the project in its order, the ones this person hides too. */
  order: string[]
  /** Whether a column (by value) is closed: done or cancelled, or counts as one. */
  closed: (value: string) => boolean
  /** Saves a new order; the board shows it at once. */
  onChange: (order: string[]) => void
  /** Whether a column may be dragged here (not on a phone); its menu moves it either way. */
  drag: boolean
}

/** A column's place on the board, which a column drag measures. */
export const COLUMN_SLOT = "data-column-slot"
const COLUMN_DRAG = "column"

/** What the columns read: stable, so a held card renders no column for it. */
export interface ColumnOrderActions {
  /** Whether this column has a grip. */
  drag: boolean
  /** The id of the words that say how to move a column from the keys. */
  describedBy: string
  onGripKey: (value: string, e: ReactKeyboardEvent<HTMLElement>) => void
  /** Focus left the grip: a column the keys hold is put back. */
  onGripBlur: (value: string) => void
  /** Moves the column one place, or does nothing where it can't go; canMove says which. */
  move: (value: string, by: -1 | 1) => void
  canMove: (value: string, by: -1 | 1) => boolean
}

const ColumnOrderContext = createContext<ColumnOrderActions | null>(null)

/** Gives the columns inside the board's grip and moves (null: none, the board can't be reordered). */
export function ColumnOrderProvider({ value, children }: { value: ColumnOrderActions | null; children: React.ReactNode }) {
  return <ColumnOrderContext.Provider value={value}>{children}</ColumnOrderContext.Provider>
}

/** The column order's actions, when the board lets this person reorder its columns. */
export function useColumnOrder() {
  return useContext(ColumnOrderContext)
}

type Line = { x: number; top: number; height: number }

/** Where a pointer is, from the event itself (the board's own read, for a column). */
function pointerOf(event: Event | null): { x: number; y: number } | null {
  if (!event) return null
  if ("touches" in event) {
    const t = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0]
    return t ? { x: t.clientX, y: t.clientY } : null
  }
  if ("clientX" in event) return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }
  return null
}

/**
 * The board's column drag: its state, the handlers its DndContext calls (each
 * says whether the drag was a column's), and the pieces it renders.
 */
export function useColumnDrag({
  boardRef,
  visible,
  ordering,
  say,
  describedBy,
  animate = true,
}: {
  boardRef: RefObject<HTMLDivElement | null>
  visible: StatusOption[]
  ordering?: ColumnOrdering
  say: (words: string) => void
  describedBy: string
  /** Whether the columns slide to their new places (not in lanes, whose cells don't follow their heads). */
  animate?: boolean
}) {
  const [held, setHeld] = useState<string | null>(null)
  const [byKeys, setByKeys] = useState(false)
  const [gap, setGap] = useState<number | null>(null)
  const [line, setLine] = useState<Line | null>(null)
  const [liftWidth, setLiftWidth] = useState<number | undefined>(undefined)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const flip = useColumnFlip(boardRef)

  // Read through refs by the stable actions below.
  const live = useRef({ visible, ordering, held, gap, byKeys, animate })
  live.current = { visible, ordering, held, gap, byKeys, animate }
  const shown = () => live.current.visible.map((v) => v.value)
  const nameOf = (value: string) => live.current.visible.find((v) => v.value === value)?.label ?? value
  const slots = () => Array.from(boardRef.current?.querySelectorAll<HTMLElement>(`[${COLUMN_SLOT}]`) ?? [])
  const slotsBut = (value: string) => slots().filter((el) => el.getAttribute(COLUMN_SLOT) !== value)

  /** Where the line for gap g (among the other columns) is drawn, on screen. */
  const lineFor = (value: string, g: number): Line | null => {
    const others = slotsBut(value)
    const board = boardRef.current?.getBoundingClientRect()
    if (!others.length || !board) return null
    const at = g < others.length ? others[g].getBoundingClientRect().left - 6 : others[others.length - 1].getBoundingClientRect().right + 6
    return { x: Math.round(at) - 1, top: Math.round(board.top), height: Math.round(board.height) }
  }
  /** The gap a pointer at x is over: how many of the other columns' middles it is past. */
  const gapAt = (value: string, x: number) => slotsBut(value).filter((el) => {
    const r = el.getBoundingClientRect()
    return x > r.left + r.width / 2
  }).length
  /** Whether the column may go to gap g: somewhere new, and where the rule lets it. */
  const allowed = (value: string, g: number) => {
    const o = live.current.ordering
    return !!o && dropColumn(o.order, shown(), value, g, o.closed) !== null
  }
  /** Gap g in words, among the columns shown. */
  const whereWords = (value: string, g: number) => {
    const others = shown().filter((v) => v !== value)
    if (g <= 0) return "first"
    if (g >= others.length) return "last"
    return `between ${nameOf(others[g - 1])} and ${nameOf(others[g])}`
  }

  /** The line for gap g, or none: no gap, or the column's own (it is where it was). */
  const lineAt = (value: string, g: number | null) => (g === null || g === shown().indexOf(value) ? null : lineFor(value, g))
  const aim = (value: string, g: number | null) => {
    setGap(g)
    setLine(lineAt(value, g))
  }
  /** For the keys: the gap aimed at, brought into view first (the board scrolls sideways). */
  const aimInView = (value: string, g: number) => {
    const others = slotsBut(value)
    const near = g === shown().indexOf(value) ? slots().find((el) => el.getAttribute(COLUMN_SLOT) === value) : others[Math.min(g, others.length - 1)]
    if (near && typeof near.scrollIntoView === "function") near.scrollIntoView({ block: "nearest", inline: "nearest" })
    aim(value, g)
  }
  const finish = () => {
    pointer.current = null
    live.current = { ...live.current, held: null, byKeys: false, gap: null }
    setHeld(null)
    setByKeys(false)
    setGap(null)
    setLine(null)
  }
  /** The grip of a column, on the board now. */
  const gripOf = (value: string) =>
    slots().find((el) => el.getAttribute(COLUMN_SLOT) === value)?.querySelector<HTMLElement>("[data-column-grip]") ?? null
  /** Puts the column in gap g and saves the order. Whether it moved. */
  const commit = (value: string, g: number): boolean => {
    const o = live.current.ordering
    const next = o ? dropColumn(o.order, shown(), value, g, o.closed) : null
    if (!o || !next) return false
    if (live.current.animate) flip.record()
    o.onChange(next)
    return true
  }

  // A column moved to the right is put back into the page after the others,
  // and the browser takes focus from a grip that moves: after a put-down by
  // the keys, its grip has it back, unless the person has gone elsewhere.
  const refocus = useRef<{ value: string; until: number } | null>(null)
  useLayoutEffect(() => {
    const r = refocus.current
    if (!r) return
    const grip = gripOf(r.value)
    const lost = document.activeElement === null || document.activeElement === document.body
    if (grip && lost) {
      grip.focus()
      refocus.current = null
    } else if (Date.now() > r.until || (!lost && document.activeElement !== grip)) refocus.current = null
  })

  // Follow the pointer while a column is held (passive, as for a card).
  useEffect(() => {
    if (!held || byKeys) return
    const follow = (e: Event) => {
      const p = pointerOf(e)
      if (!p) return
      pointer.current = p
      const g = gapAt(held, p.x)
      aim(held, allowed(held, g) ? g : null)
    }
    window.addEventListener("mousemove", follow, { capture: true, passive: true })
    window.addEventListener("touchmove", follow, { capture: true, passive: true })
    return () => {
      window.removeEventListener("mousemove", follow, { capture: true })
      window.removeEventListener("touchmove", follow, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the board through refs
  }, [held, byKeys])

  // While a column is held the board may scroll under it (the drag's
  // auto-scroll, the keys bringing a gap into view): the line keeps up.
  useEffect(() => {
    const board = boardRef.current
    if (!held || !board) return
    const onScroll = () => {
      const { held: value, gap: g, byKeys: keys } = live.current
      if (!value) return
      if (!keys && pointer.current) {
        const at = gapAt(value, pointer.current.x)
        aim(value, allowed(value, at) ? at : null)
      } else setLine(lineAt(value, g))
    }
    board.addEventListener("scroll", onScroll, { passive: true })
    return () => board.removeEventListener("scroll", onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the board through refs
  }, [held])

  /** The DndContext's start: a column's, or not (false). */
  const onDragStart = ({ active, activatorEvent }: DragStartEvent): boolean => {
    if (active.data.current?.type !== COLUMN_DRAG) return false
    const value = String(active.data.current.value)
    if (!live.current.ordering?.drag) return true
    pointer.current = pointerOf(activatorEvent)
    setLiftWidth(slots().find((el) => el.getAttribute(COLUMN_SLOT) === value)?.getBoundingClientRect().width || undefined)
    setByKeys(false)
    setHeld(value)
    aim(value, null)
    say(`Picked up the ${nameOf(value)} column.`)
    return true
  }
  /** The DndContext's end: puts a held column where the line is (false when no column was held). */
  const onDragEnd = (): boolean => {
    const { held: value, gap: g, byKeys: keys } = live.current
    if (!value || keys) return false
    if (g !== null && commit(value, g)) say(`${nameOf(value)} moved ${whereWords(value, g)}.`)
    else say(`${nameOf(value)} put back.`)
    finish()
    return true
  }
  const onDragCancel = (): boolean => {
    const { held: value, byKeys: keys } = live.current
    if (!value || keys) return false
    say(`${nameOf(value)} put back.`)
    finish()
    return true
  }

  // The actions the columns read, made once: they read through refs.
  const onGripKey = useCallback((value: string, e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const { held: lifted, byKeys: keys, gap: g } = live.current
    if (!lifted || !keys || lifted !== value) {
      if (e.key !== " " && e.key !== "Enter") return
      e.preventDefault()
      e.stopPropagation()
      const own = shown().indexOf(value)
      setByKeys(true)
      setHeld(value)
      aimInView(value, own)
      say(`Picked up the ${nameOf(value)} column. The left and right arrows move it, Space or Enter puts it down, Escape puts it back.`)
      return
    }
    const own = shown().indexOf(value)
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      e.stopPropagation()
      const o = live.current.ordering
      if (!o) return
      const places = [...new Set([...placesFor(o.order, shown(), value, o.closed), own])].sort((a, b) => a - b)
      const at = g ?? own
      const next = e.key === "ArrowLeft" ? [...places].reverse().find((p) => p < at) : places.find((p) => p > at)
      if (next === undefined) {
        say(`The ${nameOf(value)} column can't go further ${e.key === "ArrowLeft" ? "left" : "right"}.`)
        return
      }
      aimInView(value, next)
      say(next === own ? `${nameOf(value)}, where it was.` : `${nameOf(value)}, ${whereWords(value, next)}.`)
      return
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      const moved = g !== null && g !== own && commit(value, g)
      say(moved ? `${nameOf(value)} put down ${whereWords(value, g!)}.` : `${nameOf(value)} put back where it was.`)
      if (moved) refocus.current = { value, until: Date.now() + 1500 }
      finish()
      return
    }
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
      }
      say(`${nameOf(value)} put back where it was.`)
      finish()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the board through refs
  }, [])
  const onGripBlur = useCallback((value: string) => {
    const { held: lifted, byKeys: keys } = live.current
    if (lifted !== value || !keys) return
    say(`${nameOf(value)} put back where it was.`)
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the board through refs
  }, [])
  const move = useCallback((value: string, by: -1 | 1) => {
    const o = live.current.ordering
    if (!o) return
    const next = shiftColumn(o.order, shown(), value, by, o.closed)
    if (!next) return
    if (live.current.animate) flip.record()
    o.onChange(next)
    const now = next.filter((v) => shown().includes(v))
    say(`${nameOf(value)} moved ${whereWords(value, now.indexOf(value))}.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the board through refs
  }, [])
  const canMove = useCallback((value: string, by: -1 | 1) => {
    const o = live.current.ordering
    return !!o && shiftColumn(o.order, shown(), value, by, o.closed) !== null
  }, [])
  const drag = !!ordering?.drag
  const actions = useMemo<ColumnOrderActions>(
    () => ({ drag, describedBy, onGripKey, onGripBlur, move, canMove }),
    [drag, describedBy, onGripKey, onGripBlur, move, canMove],
  )

  return {
    /** The column held (by the pointer or the keys), to dim where it was. */
    held,
    /** Held by the pointer: the lift follows it. */
    heldByPointer: held !== null && !byKeys,
    /** The held column's width, for its lifted head. */
    liftWidth,
    onDragStart,
    onDragEnd,
    onDragCancel,
    /** For ColumnOrderProvider: null when the board can't be reordered. */
    actions: ordering ? actions : null,
    line,
  }
}

/** The line between two columns where a held one will go, drawn over the board. */
export function ColumnDropLine({ line }: { line: { x: number; top: number; height: number } | null }) {
  if (!line || typeof document === "undefined") return null
  return createPortal(
    <div
      aria-hidden="true"
      data-column-drop-line=""
      className="pointer-events-none fixed z-50 w-0.5 rounded-[1px] bg-primary ring-2 ring-sheet"
      style={{ left: line.x, top: line.top + 8, height: Math.max(0, line.height - 16) }}
    />,
    document.body,
  )
}

/**
 * The grip in a column's head: a drag by the pointer, and the keys' way to
 * move the column. Only where the board lets this person reorder its columns.
 */
export function ColumnGrip({ status, className }: { status: StatusOption; className?: string }) {
  const actions = useColumnOrder()
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `column:${status.value}`,
    data: { type: COLUMN_DRAG, value: status.value },
    disabled: !actions?.drag,
  })
  if (!actions?.drag) return null
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      onKeyDown={(e) => actions.onGripKey(status.value, e)}
      onBlur={() => actions.onGripBlur(status.value)}
      aria-label={`Move the ${status.label} column`}
      aria-describedby={actions.describedBy}
      title="Drag to move this column for everyone in the project"
      data-column-grip=""
      data-touch-target=""
      className={cn(
        "inline-flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        isDragging && "cursor-grabbing",
        className,
      )}
    >
      <GripVertical className="size-3.5" aria-hidden="true" />
    </button>
  )
}

/**
 * The held column as it follows the pointer: its head alone (lozenge, count,
 * tint) at the head's own width, lifted (e2, 2° of tilt, none under reduced
 * motion); its cards stay behind, dimmed (DESIGN-BUILD-2, 18 Oct).
 */
export function ColumnLift({ status, count, width }: { status: StatusOption; count?: number; width?: number }) {
  const hue = columnHue(status)
  return (
    <div data-column-lift="" style={{ width: width ?? 280 }} className="overflow-hidden rounded-lg bg-sheet opacity-95 shadow-e2 motion-safe:rotate-2">
      <div className={cn("flex h-10 items-center gap-2 px-2", columnWash(hue))}>
        <span className={cn("inline-flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-2 text-xs font-[510]", columnLozenge(hue))}>
          <TaskStatusCell status={status} label="tip" />
          <span className="truncate">{status.label}</span>
        </span>
        {count !== undefined && <span className="text-xs tabular-nums text-ink-3">{count}</span>}
      </div>
    </div>
  )
}

/**
 * The columns slide to their new places when the order changes (FLIP): record
 * where each was just before, and on the next render each animates from there.
 * Nothing moves under reduced motion.
 */
function useColumnFlip(boardRef: RefObject<HTMLDivElement | null>) {
  const before = useRef<{ at: Map<string, number>; until: number } | null>(null)
  useLayoutEffect(() => {
    const was = before.current?.at
    if (!was) return
    // A save that never changed the screen (refused before it showed) leaves nothing to slide later.
    if (Date.now() > before.current!.until) {
      before.current = null
      return
    }
    const slots = Array.from(boardRef.current?.querySelectorAll<HTMLElement>(`[${COLUMN_SLOT}]`) ?? [])
    // Only once the order on screen has changed: the save's first render may not have it yet.
    if (!slots.some((el) => {
      const left = was.get(el.getAttribute(COLUMN_SLOT) ?? "")
      return left !== undefined && Math.abs(left - el.getBoundingClientRect().left) >= 1
    })) return
    before.current = null
    if (prefersReducedMotion()) return
    for (const el of slots) {
      const left = was.get(el.getAttribute(COLUMN_SLOT) ?? "")
      if (left === undefined) continue
      const dx = left - el.getBoundingClientRect().left
      if (Math.abs(dx) < 1 || typeof el.animate !== "function") continue
      el.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" })
    }
  })
  return {
    record: () => {
      const m = new Map<string, number>()
      for (const el of boardRef.current?.querySelectorAll<HTMLElement>(`[${COLUMN_SLOT}]`) ?? []) m.set(el.getAttribute(COLUMN_SLOT) ?? "", el.getBoundingClientRect().left)
      before.current = { at: m, until: Date.now() + 1000 }
    },
  }
}
