"use client"

/**
 * THE LIST'S DRAG (L-1): a project's tasks moved into the project's one
 * manual order, which the board's columns show too, by pointer, finger or
 * keys. A chunk of its own, fetched when the page is idle
 * (components/task/reorderSlot): the list's first screen carries none of it.
 * It draws beside the list (reorderSlot's ReorderHost), never around it, and
 * lends the rows their grips and holds: its coming draws no row anew.
 *
 * - A computer's list: a grip on each row this person may change, on hover
 *   and focus. A phone's: no standing grip; the row itself, held for 250 ms
 *   (lib/ui/pressLift), lifts, and the lifted copy wears the grip. Through
 *   the shared drag (lib/ui/dnd): its sensors, keys and edge scrolling. The
 *   rows it left dim, the rows past the slot make room under the copy
 *   (lib/ui/makeRoom) and the drop line marks the slot's edge. A selected
 *   row carries the selection, in its order, with a count on the copy.
 * - At 60 fps on a long list (listDragBudget.test.tsx): one draggable for
 *   the whole list, which a grip or a row lends its element and its press;
 *   no droppables and no collision pass; the rows' places read at the lift
 *   and again only when something scrolls; and once a frame, only when the
 *   slot changes, a write for each row that crossed it. Nothing on the list
 *   renders while a row is held.
 * - In groups by status a drop in another group moves the task there too
 *   (the board's move: place and status at once). Grouped any other way a
 *   row stays in its own group: its group comes from the task's own fields.
 * - Alt+↑/↓ moves the highlighted task, or the selection, one place.
 * - Sorted by something else, a drag or Alt+arrow asks to switch to manual
 *   order and moves nothing.
 * - Every move shows at once, then saves (hooks/useListMove); Undo puts the
 *   tasks back between their old neighbours; a refusal reads the lists again
 *   and says why. Others' moves arrive as Task_Changed ranks
 *   (lib/tasks/rankCache), through the project's topic watched here.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  useDraggable,
  type Announcements,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type DraggableSyntheticListeners,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core"

import { ToastAction } from "@/components/ui/toast"
import { DropLine, placeDropLine, type DropLineAt } from "@/components/ui/drop-line"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { ReorderActions, ReorderLend, type ListReorder } from "@/components/task/reorderSlot"
import { useToast } from "@/hooks/use-toast"
import { swallowReleaseClick } from "@/lib/ui/releaseClick"
import { ListSelectionContext } from "@/hooks/useListSelection"
import { movedPlaces, useListMove } from "@/hooks/useListMove"
import { useStableCallback } from "@/hooks/useStableCallback"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { measureFlip, playFlip, type FlipRects } from "@/lib/flip"
import { GripVertical } from "@/lib/icons"
import { useLiveEntity } from "@/lib/liveEntity"
import { MqttContext } from "@/components/mqtt/mqttContext"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { dropPlace, placeTasks, stepPlace, undoRuns, type MovePlan } from "@/lib/tasks/listOrder"
import type { Grouping, TaskGroup } from "@/lib/tasks/grouping"
import { statusOptionOf, statusValueOf, type StatusOption } from "@/lib/taskStatus"
import { announce } from "@/lib/ui/announce"
import { DRAG_OVERLAY, eventPoint, useDndSetup, useDragState, type DragWords } from "@/lib/ui/dnd"
import { feedback } from "@/lib/ui/feedback"
import { makeRoom, slotAt, type Room, type Span } from "@/lib/ui/makeRoom"
import { holdLifted } from "@/lib/ui/pressLift"
import type { TaskInfoInterface } from "@/types/task"

/** A row's height (GroupedTaskList ROW_H): the keys move a held row one row at a time. */
const ROW_PX = 40
/** The gutter the grip sits in, where the drop line starts. */
const GUTTER = 18
/** The list's one draggable: what it holds is the task a grip or a row lent it. */
const HELD = "list-reorder"
/** The rows, and the list's flow: every item the room moves (rows, headers, "Show 5 more"), on a computer and on a phone. */
const ROW = "[data-task-id]"
const FLOW = '[data-group-header],[data-group]>[role="list"]>*,[data-phone-group],[data-phone-task-row]'
/** The rows a drag holds, dimmed where they were (app/interaction.css). */
const HELD_ROW = "data-reorder-held"
/** A pointer's slot is said once it has stayed put this long: a sweep down the list says only where it stops. */
const SAY_AFTER_MS = 400
/** A drop's room closes when the list has its new order; if that never comes, after this. */
const SETTLE_MS = 1000

// Where a row lands is the layer's to say (aimNow): dnd-kit's collision pass
// would only repeat it, over every row, on every move.
const NO_HITS: ReturnType<CollisionDetection> = []
const noCollisions: CollisionDetection = () => NO_HITS
// dnd-kit's words need a drop target, and there is none: the layer speaks.
const quiet = () => undefined
const SILENT: Announcements = { onDragStart: quiet, onDragMove: quiet, onDragOver: quiet, onDragEnd: quiet, onDragCancel: quiet }
const NO_WORDS: DragWords = { name: () => "", place: () => null }

const rowSteps: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  const by = event.code === KeyboardCode.Down ? 1 : event.code === KeyboardCode.Up ? -1 : 0
  if (!by) return undefined
  event.preventDefault()
  return { ...currentCoordinates, y: currentCoordinates.y + by * ROW_PX }
}

type Press = "onMouseDown" | "onTouchStart" | "onKeyDown"

interface LayerActions {
  manual: boolean
  ask: () => void
  /** A grip or a row lends the list's one draggable its row and its press. */
  press: (task: TaskInfoInterface, e: React.SyntheticEvent<HTMLElement>, kind: Press) => void
  /** The keys' instructions (dnd-kit's), for a grip's aria-describedby. */
  describedBy: string
}

/**
 * Where a held row will land, as data the drag owns: the group, the place
 * among its other tasks, and the tasks directly above and below in the
 * project's order. Never a row on the page, so a windowed list that drops
 * rows from the page loses nothing.
 */
type Target = { group: string; index: number; before: string; after: string }

/** What is held: the task pressed, the tasks it carries, and where its middle is from the pointer. */
type Held = {
  id: string
  ids: string[]
  moving: Set<string>
  /** The row's height: the room it makes. */
  height: number
  /** How far below the row's top the pointer pressed. */
  grab: number
  /** Lifted by the keys: its middle is dnd-kit's moved rect. */
  keys: boolean
  /** Sorted another way: the hold asked to switch, and nothing moves. */
  asked: boolean
}

/** A row's place, read once: how far it sits below its parent, which the room never moves. */
type Place = { dy: number; height: number; parent: Element }
type Geometry = {
  rows: HTMLElement[]
  spans: Span[]
  flowIndex: Map<Element, number>
  places: Map<Element, Place>
  left: number
  width: number
}

/** What the page shows now: the room's slot, the line, the refused cursor, the place last said. */
type Shown = { from: number | null; line: string; invalid: boolean; said: string }
const NOTHING_SHOWN: Shown = { from: null, line: "", invalid: false, said: "" }

type Handle = {
  setNodeRef: (el: HTMLElement | null) => void
  setActivatorNodeRef: (el: HTMLElement | null) => void
  listeners: DraggableSyntheticListeners
}

export interface ReorderLayerProps extends ListReorder {
  tasks: TaskInfoInterface[]
  groups: TaskGroup[]
  grouping: Grouping
  options: StatusOption[]
  canEdit: (task: TaskInfoInterface) => boolean
  box: React.RefObject<HTMLDivElement | null>
  /** The list's tasks as a move leaves them, shown at once (GroupedTaskList), before the caches bring them back so. */
  onPlaced?: (tasks: TaskInfoInterface[]) => void
}

const rowsIn = (box: HTMLElement | null) => Array.from(box?.querySelectorAll<HTMLElement>(ROW) ?? [])
const rowOf = (box: HTMLElement | null, id: string) => rowsIn(box).find((r) => r.dataset.taskId === id) ?? null

export function ReorderLayer(props: ReorderLayerProps) {
  const { projectId, manual, options, tasks, box } = props
  const connected = React.useContext(MqttContext) !== null
  const store = React.useContext(ListSelectionContext)
  const { toast } = useToast()
  const move = useListMove(projectId, options)

  // The handlers are made once and read the latest props here.
  const live = React.useRef(props)
  live.current = props
  const flatIds = () => live.current.tasks.map((t) => t.task_uuid)
  const taskOf = (id: string) => live.current.tasks.find((t) => t.task_uuid === id)
  const nameOf = (id: string) => taskOf(id)?.task_name || "Untitled task"
  const groupOf = (id: string) => live.current.groups.find((g) => g.tasks.some((t) => t.task_uuid === id))
  const groupByKey = (key: string | undefined) => live.current.groups.find((g) => g.key === key)
  const idsOf = (g: TaskGroup) => g.tasks.map((t) => t.task_uuid)
  /** Where one held task already is among its group's others (-1 for a selection, or another group): a drop there is no move. */
  const ownPlace = (active: string, moving: string[], g: TaskGroup) => {
    if (moving.length !== 1 || groupOf(active)?.key !== g.key) return -1
    const ids = idsOf(g)
    return ids.slice(0, ids.indexOf(active)).filter((id) => !moving.includes(id)).length
  }
  const editable = (id: string) => {
    const t = taskOf(id)
    return !!t && live.current.canEdit(t)
  }
  /** What a move is called: a task's title, or how many. */
  const called = (ids: string[]) => (ids.length > 1 ? `${ids.length} tasks` : nameOf(ids[0]))
  /** Where a task is, in words: its group and its place there. */
  const whereIs = (id: string) => {
    const g = groupOf(id)
    return g ? `${g.label}, position ${g.tasks.findIndex((x) => x.task_uuid === id) + 1} of ${g.tasks.length}` : "its place"
  }
  /** In groups by status, the tasks moved into another status's group take it. */
  const statusFor = (ids: string[], g: TaskGroup): Record<string, string> => {
    if (live.current.grouping !== "status" || !g.status) return {}
    return Object.fromEntries(ids.filter((id) => statusValueOf(taskOf(id) ?? {}) !== g.key).map((id) => [id, g.key]))
  }

  // One function for the list's life: every grip reads it through the layer's context.
  const ask = useStableCallback(() => {
    toast({
      title: `Sorted by ${live.current.sortedBy ?? "another order"}`,
      description: "Tasks move by hand in manual order.",
      // A question, not a result: the grip's own mark, in the info tone.
      tone: "info",
      icon: <GripVertical className="size-3.5" aria-hidden="true" />,
      action: (
        <ToastAction altText="Use manual order" onClick={() => live.current.onManual()}>
          Use manual order
        </ToastAction>
      ),
    })
  })

  // ---- The drag's state: refs, written straight on the page, never rendered ----
  const handle = React.useRef<Handle | null>(null)
  const pressed = React.useRef<string | null>(null)
  const held = React.useRef<Held | null>(null)
  const pointer = React.useRef<{ x: number; y: number } | null>(null)
  const keyMid = React.useRef<{ x: number; y: number } | null>(null)
  const geometry = React.useRef<Geometry | null>(null)
  const stale = React.useRef(false)
  const frame = React.useRef(0)
  const room = React.useRef<Room | null>(null)
  const shown = React.useRef<Shown>(NOTHING_SHOWN)
  const targetRef = React.useRef<Target | null>(null)
  const lineRef = React.useRef<HTMLSpanElement | null>(null)
  const release = React.useRef<(() => void) | null>(null)
  const stop = React.useRef<(() => void) | null>(null)
  const sayTimer = React.useRef(0)
  const [lift, setLift] = React.useState<{ task: TaskInfoInterface; ids: string[]; width: number; height: number } | null>(null)

  // The rows slide to their new places once the list has them (FLIP), and
  // the row the keys moved keeps the focus. A drop's room closes first.
  const flip = React.useRef<{ rects: FlipRects; only?: Set<string> } | null>(null)
  const refocus = React.useRef<string | null>(null)
  const settling = React.useRef<{ ghost: HTMLElement | null; timer: number } | null>(null)
  React.useLayoutEffect(() => {
    settle(false)
    if (flip.current) playFlip(box.current, flip.current.rects, { duration: 200, only: flip.current.only })
    flip.current = null
    // The list changed under a held row (another person's move): its rows are read again.
    if (held.current && !held.current.asked) remeasure()
    const id = refocus.current
    refocus.current = null
    const row = id ? rowOf(box.current, id) : null
    if (row && document.activeElement !== row && !row.contains(document.activeElement)) {
      row.focus({ preventScroll: true })
      row.scrollIntoView?.({ block: "nearest" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the drag through refs
  }, [tasks, box])

  const putBack = async (flat: string[], ids: string[], status: Record<string, string>) => {
    flip.current = { rects: measureFlip(box.current) }
    for (const run of undoRuns(flat, ids, status)) if (!(await move(run, live.current.tasks))) return
    announce(`${called(ids)} put back.`)
  }

  /** Moves tasks: at once on screen (sliding from `from`, or from where the rows are now), then on the server, with Undo. */
  const run = async (plan: MovePlan, from?: { rects: FlipRects; only?: Set<string> }) => {
    const tasks = live.current.tasks
    const flat = flatIds()
    const was = Object.fromEntries(Object.keys(plan.status ?? {}).map((id) => [id, statusValueOf(taskOf(id) ?? {})]))
    const words = called(plan.ids)
    flip.current = from ?? { rects: measureFlip(box.current) }
    // The list the move was made in shows it now, and the project's cached
    // lists and the server have it once that frame is drawn (the board's
    // way): copying every cached list is a long task of renders.
    const { onPlaced } = live.current
    if (onPlaced) {
      const { ranks, patches, place } = movedPlaces(plan, tasks, live.current.options)
      onPlaced(placeTasks(tasks, place, ranks, patches))
      await afterPaint()
    }
    if (!(await move(plan, tasks))) return
    toast({
      title: plan.ids.length > 1 ? `${plan.ids.length} tasks moved` : "Task moved",
      description: plan.ids.length > 1 ? undefined : words,
      duration: 5000,
      action: (
        <ToastAction altText="Undo" onClick={() => void putBack(flat, plan.ids, was)}>
          Undo
        </ToastAction>
      ),
    })
  }

  // Alt+↑/↓: the highlighted task, or the selection it is in, one place.
  const keyMove = (anchor: string, by: -1 | 1) => {
    const g = groupOf(anchor)
    if (!g) return
    const flat = flatIds()
    const selected = store?.get().selected
    const moving = (selected?.has(anchor) ? flat.filter((id) => selected.has(id)) : [anchor]).filter(editable)
    if (!moving.length) return announce(`${nameOf(anchor)} can't be moved.`)
    const words = called(moving)
    const ids = idsOf(g)
    const index = stepPlace({ group: ids, moving, by })
    if (index === null) return announce(`${words} ${moving.length > 1 ? "are" : "is"} already ${by < 0 ? "first" : "last"} in ${g.label}.`)
    const { before, after } = dropPlace({ flat, group: ids, index, moving })
    const count = ids.filter((id) => !moving.includes(id)).length + moving.length
    if (rowOf(box.current, anchor)?.contains(document.activeElement)) refocus.current = anchor
    void run({ ids: moving, before, after, status: statusFor(moving, g) })
    announce(`${words} moved to position ${index + 1} of ${count} in ${g.label}.`)
  }
  const keyMoveRef = React.useRef(keyMove)
  keyMoveRef.current = keyMove

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return
      const el = live.current.box.current
      if (!el?.isConnected) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest("input,textarea,select,[contenteditable],[role=dialog],[role=menu],[role=listbox],[role=combobox]")) return
      const inBox = !!target && el.contains(target)
      // The list's keys, from inside it or from the page with a row highlighted.
      if (!inBox && target && target !== document.body && target !== document.documentElement) return
      const s = store?.get()
      const fromRow = inBox ? target!.closest<HTMLElement>(ROW)?.dataset.taskId : undefined
      const anchor = [fromRow, s?.highlighted, ...(s?.selected ?? [])].find((id) => id && rowOf(el, id))
      if (!anchor) return
      e.preventDefault()
      if (!live.current.manual) return ask()
      keyMoveRef.current(anchor, e.key === "ArrowUp" ? -1 : 1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [ask, store])

  // ---- The drag ----
  const dnd = useDndSetup(NO_WORDS, rowSteps)
  const drag = useDragState()
  const describedBy = React.useId()

  /** A grip's or a row's press, lent to the one draggable: dnd-kit's sensor for it takes it from there. */
  const press = React.useCallback((task: TaskInfoInterface, e: React.SyntheticEvent<HTMLElement>, kind: Press) => {
    const h = handle.current
    const row = e.currentTarget.closest<HTMLElement>(ROW)
    if (!h?.listeners || !row) return
    pressed.current = task.task_uuid
    h.setNodeRef(row)
    h.setActivatorNodeRef(e.currentTarget)
    h.listeners[kind]?.(e)
  }, [])
  const hold = React.useCallback((task: TaskInfoInterface, e: React.TouchEvent<HTMLElement>) => press(task, e, "onTouchStart"), [press])

  /** Reads where the rows are: the ones known by their parents' places, new ones (a scroll drew them) as they are. */
  const measure = (fresh: boolean) => {
    const el = live.current.box.current
    const h = held.current
    if (!el || !h) return
    const places = fresh ? new Map<Element, Place>() : (geometry.current?.places ?? new Map<Element, Place>())
    const rows = rowsIn(el)
    // The room moves only what is on screen, with a row to spare each way:
    // an item whose transform comes or goes is laid out again, and what is
    // off screen can't be seen to make room.
    const spare = h.height * 2
    const tall = window.innerHeight
    const flow = Array.from(el.querySelectorAll<HTMLElement>(FLOW)).filter((item) => {
      const r = item.getBoundingClientRect()
      return r.bottom > -spare && r.top < tall + spare
    })
    const tops = new Map<Element, number>()
    const topOf = (p: Element) => {
      let top = tops.get(p)
      if (top === undefined) tops.set(p, (top = p.getBoundingClientRect().top))
      return top
    }
    const spans = rows.map((row) => {
      let p = places.get(row)
      if (!p) {
        // Not moved by the room yet (new, or all let back for this read): where it is is its place.
        const r = row.getBoundingClientRect()
        const parent = row.parentElement ?? el
        p = { dy: r.top - topOf(parent), height: r.height, parent }
        places.set(row, p)
      }
      const top = topOf(p.parent) + p.dy
      return { top, bottom: top + p.height }
    })
    for (const row of places.keys()) if (!row.isConnected) places.delete(row)
    const area = el.getBoundingClientRect()
    geometry.current = { rows, spans, flowIndex: new Map(flow.map((item, i) => [item, i])), places, left: area.left, width: area.width }
    // The rows it carries dim, those a windowed list has just drawn too.
    for (const row of rows) if (h.moving.has(row.dataset.taskId ?? "") && !row.hasAttribute(HELD_ROW)) row.setAttribute(HELD_ROW, "")
    room.current?.items(flow)
  }

  /** Every row let back at once and read again where it is (the list changed under a held row). */
  const remeasure = () => {
    const el = live.current.box.current
    const h = held.current
    if (!el || !h) return
    room.current?.close(false)
    room.current = makeRoom(h.height)
    shown.current = { ...shown.current, from: null }
    measure(true)
    schedule()
  }

  /** The slot under the held copy's middle, and what the page shows for it, written only where it changes. */
  const aimNow = () => {
    const h = held.current
    const g = geometry.current
    if (!h || !g || h.asked) return
    const p = pointer.current
    const mid = h.keys ? keyMid.current : p && { x: p.x, y: p.y - h.grab + h.height / 2 }
    let target: Target | null = null
    let from: number | null = null
    let line: DropLineAt | null = null
    let invalid = false
    let said = ""
    const slot = mid && mid.x >= g.left - 64 && mid.x <= g.left + g.width + 64 ? slotAt(g.spans, mid.y, ROW_PX * 2) : null
    const row = slot ? g.rows[slot.row] : null
    const id = row?.dataset.taskId
    const group = id ? groupOf(id) : undefined
    const home = groupOf(h.id)
    if (slot && row && id && group) {
      if (live.current.grouping !== "status" && group.key !== home?.key) {
        invalid = true
        said = `${group.label} doesn't take tasks from ${home?.label ?? "another group"}.`
      } else {
        const ids = idsOf(group)
        const index = ids.slice(0, ids.indexOf(id)).filter((x) => !h.moving.has(x)).length + (slot.after && !h.moving.has(id) ? 1 : 0)
        const count = ids.filter((x) => !h.moving.has(x)).length + h.ids.length
        said = `${group.label}, position ${index + 1} of ${count}.`
        // Where it already is: a drop there changes nothing, and nothing says otherwise.
        if (index !== ownPlace(h.id, h.ids, group)) {
          const at = g.flowIndex.get(row)
          from = at === undefined ? null : at + (slot.after ? 1 : 0)
          const y = slot.after ? g.spans[slot.row].bottom : g.spans[slot.row].top
          line = { top: Math.round(y), left: Math.round(g.left + GUTTER), width: Math.round(g.width - GUTTER - 8) }
          const was = targetRef.current
          target = was?.group === group.key && was.index === index ? was : { group: group.key, index, ...dropPlace({ flat: flatIds(), group: ids, index, moving: h.ids }) }
        }
      }
    }
    targetRef.current = target
    const now = shown.current
    room.current?.open(from)
    // The line, if it changed and is drawn yet (the lift renders it): otherwise tried again next frame.
    const lineKey = line ? `${line.top},${line.left},${line.width}` : ""
    let drawn = now.line
    if (lineKey !== now.line && lineRef.current) {
      placeDropLine(lineRef.current, line)
      drawn = lineKey
    }
    // Nothing is ever "over" here: the refused cursor is the layer's to set.
    if (invalid !== now.invalid) document.documentElement.setAttribute("data-dragging", invalid ? "invalid" : "true")
    if (said && said !== now.said) {
      window.clearTimeout(sayTimer.current)
      if (h.keys) announce(said)
      else sayTimer.current = window.setTimeout(() => announce(said), SAY_AFTER_MS)
    }
    shown.current = { from, line: drawn, invalid, said: said || now.said }
  }

  const tick = () => {
    frame.current = 0
    if (!held.current || held.current.asked) return
    if (stale.current) {
      stale.current = false
      measure(false)
    }
    aimNow()
  }
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(tick)
  }

  /** The drag's listeners on the window: the pointer, and a scroll or a resize that moves the rows under it. */
  const listen = () => {
    const follow = (e: Event) => {
      const at = eventPoint(e)
      if (!at) return
      pointer.current = at
      schedule()
    }
    const moved = () => {
      stale.current = true
      schedule()
    }
    const opts = { capture: true, passive: true } as const
    window.addEventListener("mousemove", follow, opts)
    window.addEventListener("touchmove", follow, opts)
    window.addEventListener("scroll", moved, opts)
    window.addEventListener("resize", moved, opts)
    return () => {
      window.removeEventListener("mousemove", follow, true)
      window.removeEventListener("touchmove", follow, true)
      window.removeEventListener("scroll", moved, true)
      window.removeEventListener("resize", moved, true)
    }
  }

  /** The rows a drag held, bright again. */
  const unhold = () => live.current.box.current?.querySelectorAll(`[${HELD_ROW}]`).forEach((row) => row.removeAttribute(HELD_ROW))

  /** A drop's room closed and its copy gone: when the list has its new order (the layout effect), or, if that never comes, from a timer. */
  function settle(play: boolean) {
    const s = settling.current
    if (!s) return
    settling.current = null
    window.clearTimeout(s.timer)
    s.ghost?.remove()
    room.current?.close(false)
    room.current = null
    unhold()
    if (play && flip.current) {
      playFlip(live.current.box.current, flip.current.rects, { duration: 200, only: flip.current.only })
      flip.current = null
    }
  }

  /** The drag over: its listeners off, and, unless a drop is settling (`back` false), the rows back where they were, sliding. */
  const end = (back: boolean) => {
    stop.current?.()
    stop.current = null
    release.current?.()
    release.current = null
    window.cancelAnimationFrame(frame.current)
    frame.current = 0
    window.clearTimeout(sayTimer.current)
    placeDropLine(lineRef.current, null)
    if (back) {
      // Kept until the next lift, which ends its slide back at once.
      room.current?.close(true)
      unhold()
    }
    held.current = null
    pointer.current = null
    keyMid.current = null
    geometry.current = null
    targetRef.current = null
    shown.current = NOTHING_SHOWN
    setLift(null)
  }

  const onDragStart = (e: DragStartEvent) => {
    drag.handlers.onDragStart(e)
    const id = pressed.current
    const el = live.current.box.current
    const task = id ? taskOf(id) : undefined
    const row = id ? rowOf(el, id) : null
    if (!id || !task || !el || !row) return
    // A drop still settling is done now, and a cancel's slide back too.
    settle(true)
    room.current?.close(false)
    room.current = null
    if (typeof TouchEvent !== "undefined" && e.activatorEvent instanceof TouchEvent) {
      release.current = holdLifted()
      feedback("impact")
    }
    const start = eventPoint(e.activatorEvent)
    const r = row.getBoundingClientRect()
    const selected = store?.get().selected
    const flat = flatIds()
    const moving = (selected?.has(id) ? flat.filter((x) => selected.has(x)) : [id]).filter(editable)
    const ids = moving.length ? moving : [id]
    held.current = { id, ids, moving: new Set(ids), height: r.height, grab: start ? start.y - r.top : r.height / 2, keys: !start, asked: !live.current.manual }
    // Sorted another way (a phone's hold): it asks, and nothing lifts.
    if (!live.current.manual) return ask()
    pointer.current = start
    keyMid.current = start ? null : { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    room.current = makeRoom(r.height)
    stop.current = listen()
    stale.current = false
    measure(true)
    setLift({ task, ids, width: r.width, height: r.height })
    announce(`Picked up ${called(ids)}. ${whereIs(id)}.`)
    schedule()
  }

  const onDragMove = (e: DragMoveEvent) => {
    const h = held.current
    if (!h || h.asked) return
    // The edge scroll follows a pointer; the keys scroll the row into view themselves.
    drag.handlers.onDragMove(e)
    if (h.keys) {
      const r = e.active.rect.current.translated
      if (r) keyMid.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    schedule()
  }

  const onDragEnd = (e: DragEndEvent) => {
    drag.handlers.onDragEnd(e)
    const h = held.current
    // The release's click is the drop's, not the row's (it opens it): a mouse's, and a finger's that didn't move.
    if (eventPoint(e.activatorEvent)) swallowReleaseClick()
    if (!h || h.asked) return end(true)
    // The last move counts, drawn or not.
    if (frame.current) {
      window.cancelAnimationFrame(frame.current)
      tick()
    }
    const t = targetRef.current
    const g = t ? groupByKey(t.group) : undefined
    if (!t || !g) {
      announce(`Cancelled. ${called(h.ids)} is back in ${whereIs(h.id)}.`)
      return end(true)
    }
    // The rows as they are drawn now, the room open, and the copy where it
    // was let go: the moved row slides from there into its place.
    const rects = measureFlip(live.current.box.current)
    const copy = document.querySelector<HTMLElement>("[data-reorder-lift] [data-drag-state='lifted']")
    if (copy) rects.set(h.ids[0], copy.getBoundingClientRect())
    const tall = window.innerHeight
    const only = new Set([...rects].filter(([, r]) => r.bottom > -r.height && r.top < tall + r.height).map(([id]) => id))
    const count = idsOf(g).filter((x) => !h.moving.has(x)).length + h.ids.length
    announce(`Dropped ${called(h.ids)} in ${g.label}, position ${t.index + 1} of ${count}.`)
    const ghost = keepCopy()
    const ids = h.ids
    end(false)
    settling.current = { ghost, timer: window.setTimeout(() => settle(true), SETTLE_MS) }
    void run({ ids, before: t.before, after: t.after, status: statusFor(ids, g) }, { rects, only })
  }

  const onDragCancel = (e: DragCancelEvent) => {
    drag.handlers.onDragCancel(e)
    const h = held.current
    if (h && !h.asked) announce(`Cancelled. ${called(h.ids)} is back in ${whereIs(h.id)}.`)
    end(true)
  }

  // Unmounted mid-drag or mid-drop: nothing of it stays on the page.
  React.useEffect(
    () => () => {
      settle(false)
      stop.current?.()
      release.current?.()
      window.cancelAnimationFrame(frame.current)
      window.clearTimeout(sayTimer.current)
      room.current?.close(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on unmount
    [],
  )

  const actions = React.useMemo<LayerActions>(() => ({ manual, ask, press, describedBy }), [manual, ask, press, describedBy])
  // The rows' grips and holds, lent to the list it sits beside, and taken back when it goes.
  const lend = React.useContext(ReorderLend)
  React.useLayoutEffect(() => lend({ Grip, hold, actions }), [lend, hold, actions])
  React.useLayoutEffect(() => () => lend({}), [lend])

  return (
    <>
      {connected && <ProjectTopic projectId={projectId} />}
      <DndContext
        {...dnd}
        id={describedBy}
        accessibility={{ ...dnd.accessibility, announcements: SILENT }}
        collisionDetection={noCollisions}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <OneDraggable handle={handle} />
        {lift && <DropLine ref={lineRef} floating />}
        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay className={DRAG_OVERLAY} dropAnimation={null} zIndex={60}>
              {lift ? <Lift task={lift.task} count={lift.ids.length} width={lift.width} height={lift.height} options={options} /> : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
    </>
  )
}

/** The list's one draggable, inside the context: grips and rows lend it their element and their press, so no row listens to the drag. */
function OneDraggable({ handle }: { handle: React.RefObject<Handle | null> }) {
  const { setNodeRef, setActivatorNodeRef, listeners } = useDraggable({ id: HELD })
  React.useLayoutEffect(() => {
    handle.current = { setNodeRef, setActivatorNodeRef, listeners }
  })
  return null
}

/** Resolves once the next frame has been drawn. */
function afterPaint(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => window.setTimeout(done, 0)))
}

/**
 * The lifted copy, kept where it was let go until the list has its new
 * order: dnd-kit's overlay leaves with the drag, and the new order comes a
 * moment later. A picture: nothing reads it.
 */
function keepCopy(): HTMLElement | null {
  const overlay = document.querySelector<HTMLElement>("[data-reorder-lift]")?.parentElement
  if (!overlay) return null
  const ghost = overlay.cloneNode(true) as HTMLElement
  ghost.querySelector("[data-reorder-lift]")?.removeAttribute("data-reorder-lift")
  ghost.setAttribute("aria-hidden", "true")
  ghost.style.pointerEvents = "none"
  document.body.appendChild(ghost)
  return ghost
}

/**
 * The project's topic, while the list is open: others' moves come as
 * Task_Changed with ranks, which the app's one message router puts into the
 * lists (lib/tasks/rankCache), as the board's topic does for its columns.
 * Lists read before the topic was live are read again once it is.
 */
function ProjectTopic({ projectId }: { projectId: string }) {
  const live = useLiveEntity("project", projectId)
  const { revalidateTaskKeys } = useTaskUpdate()
  useMqttTopic({ topic: live.state === "ok" ? (live.topic ?? "") : "", onLive: () => revalidateTaskKeys(projectId) })
  return null
}

/**
 * A row's grip on a computer, in the gutter before its select box: the
 * drag's handle for a pointer or a finger, and for the keys (Space lifts, the
 * arrows move, Space or Enter puts down, Escape puts back). The row itself is
 * what lifts. Sorted by something else, it asks to switch. It shows on hover
 * and with the keys' focus on its row, never for a mouse's highlight.
 */
function Grip({ task, editable }: { task: TaskInfoInterface; editable: boolean }) {
  const layer = React.useContext(ReorderActions) as LayerActions | null
  if (!editable || !layer) return null
  const on = layer.manual
  return (
    <button
      type="button"
      // The press goes to the list's one draggable first (dnd-kit passes over
      // a press whose default is already prevented); then a mouse's is kept
      // from focusing the grip: the ring is the keys'.
      onMouseDown={(e) => {
        if (on) layer.press(task, e, "onMouseDown")
        e.preventDefault()
      }}
      onTouchStart={on ? (e) => layer.press(task, e, "onTouchStart") : undefined}
      onKeyDown={on ? (e) => layer.press(task, e, "onKeyDown") : undefined}
      // Sorted another way, a drag's press asks at once (its release lands
      // elsewhere, so no click comes), and so do Enter and Space (a click
      // with no pointer).
      onPointerDown={(e) => {
        e.stopPropagation()
        if (!on) layer.ask()
      }}
      onClick={on ? undefined : (e) => e.detail === 0 && layer.ask()}
      aria-label={`Move ${task.task_name}`}
      aria-roledescription={on ? "draggable" : undefined}
      aria-describedby={on ? layer.describedBy : undefined}
      title={on ? "Drag to move" : "Moves in manual order"}
      data-reorder-grip=""
      data-drag-handle=""
      className="absolute left-0.5 top-1/2 inline-flex h-6 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 opacity-0 outline-none transition-[opacity,color,background-color] duration-[140ms] hover:bg-hover hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100 group-focus-visible/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <GripVertical className="size-3.5" aria-hidden="true" />
    </button>
  )
}

/** The row as it follows the pointer: lifted (the layer's shadow and scale), the grip's mark on it, with a count and a card behind it for a selection. */
const Lift = React.memo(function Lift({ task, count, width, height, options }: { task: TaskInfoInterface; count: number; width: number; height: number; options: StatusOption[] }) {
  const status = statusOptionOf(task, options) ?? options[0]
  return (
    // Inset 8px each side of the row it lifts from (a card, never past a phone's edge), at most 640px, and as tall as the row.
    <div data-reorder-lift="" className="relative" style={{ width: width ? Math.min(width - 16, 640) : 420, marginLeft: 8 }}>
      {count > 1 && <div aria-hidden="true" className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg border border-line bg-raised shadow-e1" />}
      <div data-drag-state="lifted" className="relative flex items-center gap-2.5 rounded-lg border border-line bg-raised pl-0.5 pr-3 text-sm font-[450] text-foreground" style={{ height: height || ROW_PX }}>
        <span className="inline-flex w-4 shrink-0 justify-center text-ink-3">
          <GripVertical className="size-3.5" aria-hidden="true" />
        </span>
        {status && <StatusGlyph status={statusKindOf(status)} hue={status.hue} />}
        <span className="min-w-0 flex-1 truncate">{task.task_name}</span>
        {count > 1 && (
          <span data-lift-count="" className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-brand px-1.5 text-xs font-[590] tabular-nums text-brand-foreground">
            {count}
          </span>
        )}
      </div>
    </div>
  )
})
