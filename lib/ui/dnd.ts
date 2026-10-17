"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core"

import { announce } from "@/lib/ui/announce"
import { edgeScroller } from "@/lib/ui/edgeScroll"
import { PRESS_LIFT } from "@/lib/ui/pressLift"

/**
 * THE SHARED DRAG (INTERACTION_SPEC.md §5): every @dnd-kit surface takes its
 * sensors, keys, drop animation, edge scrolling and announcements from here,
 * so a drag lifts, moves, lands and is spoken the same way everywhere, by
 * pointer, finger and keyboard. app/interaction.css draws it from the
 * attributes useDragState gives out (data-drag-state, data-drop and the
 * document's data-dragging); app/interaction.test.ts refuses a DndContext
 * that doesn't come through useDndSetup.
 */

/**
 * The arrow keys move a held item into the next drop target that way: the
 * next column with ←→ on a board, the next group with ↑↓ in a list. It aims
 * the item's middle at the target's top, where its header ends.
 */
export const containerCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const dir = ({ [KeyboardCode.Right]: [1, 0], [KeyboardCode.Left]: [-1, 0], [KeyboardCode.Down]: [0, 1], [KeyboardCode.Up]: [0, -1] } as Record<string, [number, number]>)[event.code]
  const from = context.collisionRect
  if (!dir || !from) return
  event.preventDefault()
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2
  const overId = context.over?.id
  let best: { x: number; y: number; d: number } | null = null
  for (const c of context.droppableContainers.getEnabled()) {
    const r = c.rect.current
    if (!r || c.id === overId) continue
    const tx = r.left + r.width / 2
    const ty = r.top + Math.min(r.height / 2, 56)
    const along = (tx - cx) * dir[0] + (ty - cy) * dir[1]
    if (along <= 1) continue
    const across = Math.abs((tx - cx) * dir[1]) + Math.abs((ty - cy) * dir[0])
    const d = along + across * 2
    if (!best || d < best.d) best = { x: tx - from.width / 2, y: ty - from.height / 2, d }
  }
  return best ? { x: best.x, y: best.y } : undefined
}

/** A pointer over a target picks it; a keyboard move (no pointer) falls back to overlap. */
export const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : rectIntersection(args)
}

/** A mouse lifts after 5px, a finger after a 250ms hold within 8px (lib/ui/pressLift, D11); the keyboard: Space lifts, Space or Enter drops, Escape or Tab puts back. */
export function useDndSensors(coordinateGetter: KeyboardCoordinateGetter = containerCoordinates) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: PRESS_LIFT.travel } }),
    useSensor(TouchSensor, { activationConstraint: { delay: PRESS_LIFT.hold, tolerance: PRESS_LIFT.slop } }),
    useSensor(KeyboardSensor, {
      coordinateGetter,
      keyboardCodes: { start: [KeyboardCode.Space], cancel: [KeyboardCode.Esc, KeyboardCode.Tab], end: [KeyboardCode.Space, KeyboardCode.Enter] },
    }),
  )
}

/** Where the pointer or finger is during a drag; null for the keyboard, which has none. */
export function dragPoint(e: DragMoveEvent | DragEndEvent): { x: number; y: number; touch: boolean } | null {
  const start = e.activatorEvent
  if (!start || start instanceof KeyboardEvent) return null
  const touch = (start as TouchEvent).touches?.[0]
  const x = touch?.clientX ?? (start as MouseEvent).clientX
  const y = touch?.clientY ?? (start as MouseEvent).clientY
  return x === undefined || y === undefined ? null : { x: x + e.delta.x, y: y + e.delta.y, touch: !!touch }
}

/** Where an item is, for the words a drag says: its container and, when the container keeps an order, its place in it. */
export interface DragPlace {
  container: string
  position?: number
  count?: number
}

export interface DragWords {
  /** What the item is called ("Launch plan"). */
  name: (id: UniqueIdentifier) => string
  /** Where an item or a target is. */
  place: (id: UniqueIdentifier) => DragPlace | null
}

const at = (p: DragPlace | null) => (p ? (p.position && p.count ? `${p.container}, position ${p.position} of ${p.count}` : p.container) : "")

/**
 * The words (§5.1), said through the app's one live region (lib/ui/announce)
 * rather than @dnd-kit's own, which stays silent.
 */
export function dragAnnouncements({ name, place }: DragWords): Announcements {
  const say = (text: string) => {
    announce(text)
    return undefined
  }
  return {
    onDragStart: ({ active }) => say(`Picked up ${name(active.id)}. ${at(place(active.id))}.`),
    onDragOver: ({ over }) => (over ? say(`${at(place(over.id))}.`) : undefined),
    onDragEnd: ({ active, over }) => (over ? say(`Dropped ${name(active.id)} in ${at(place(over.id))}.`) : say(`Cancelled. ${name(active.id)} is back in ${at(place(active.id))}.`)),
    onDragCancel: ({ active }) => say(`Cancelled. ${name(active.id)} is back in ${at(place(active.id))}.`),
  }
}

/** What a keyboard user hears on a draggable item (aria-describedby). */
export const DRAG_INSTRUCTIONS = {
  draggable: "To pick it up, press Space. Move it with the arrow keys, drop it with Space or Enter, or press Escape to put it back.",
}

/** Everything a DndContext takes from here: spread it, add the drag handlers from useDragState. */
export function useDndSetup(words: DragWords, coordinateGetter?: KeyboardCoordinateGetter) {
  const sensors = useDndSensors(coordinateGetter)
  const announcements = useMemo(() => dragAnnouncements(words), [words])
  return {
    sensors,
    collisionDetection,
    autoScroll: false,
    accessibility: { announcements, screenReaderInstructions: DRAG_INSTRUCTIONS },
  }
}

/**
 * The state of one drag, as attributes the layer draws (§9.2), and its
 * handlers: the item that left its slot is the placeholder, the target under
 * it is a valid drop, the document says it is dragging (the grabbing cursor),
 * and a pointer near a scroller's edge scrolls it (lib/ui/edgeScroll, the
 * innermost first). @dnd-kit's own sensors end a drag on Escape and on a
 * touch the browser takes back, so there is no cancel path here.
 * `canDrop` says whether the target takes the item; a refused one shows no
 * tint and the not-allowed cursor.
 */
export function useDragState(canDrop: (active: UniqueIdentifier, over: UniqueIdentifier) => boolean = () => true) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null)
  const scroll = useRef<ReturnType<typeof edgeScroller> | null>(null)
  const valid = activeId !== null && overId !== null ? canDrop(activeId, overId) : true

  useEffect(() => {
    const root = document.documentElement
    if (activeId === null) root.removeAttribute("data-dragging")
    else root.setAttribute("data-dragging", valid ? "true" : "invalid")
    return () => root.removeAttribute("data-dragging")
  }, [activeId, valid])

  useEffect(() => () => scroll.current?.stop(), [])

  const end = useCallback(() => {
    setActiveId(null)
    setOverId(null)
    scroll.current?.stop()
    scroll.current = null
  }, [])

  const handlers = {
    onDragStart: useCallback((e: DragStartEvent) => {
      setActiveId(e.active.id)
      scroll.current?.stop()
      scroll.current = edgeScroller(undefined, undefined, (el) => !!el.closest("[data-drag-state='lifted']"))
    }, []),
    onDragMove: useCallback((e: DragMoveEvent) => {
      // A keyboard move has no pointer: the sensor scrolls the item into view itself.
      const at = dragPoint(e)
      if (at) scroll.current?.follow(at.x, at.y, at.touch)
    }, []),
    onDragOver: useCallback((e: DragOverEvent) => setOverId(e.over?.id ?? null), []),
    onDragCancel: useCallback<(e: DragCancelEvent) => void>(() => end(), [end]),
    onDragEnd: useCallback<(e: DragEndEvent) => void>(() => end(), [end]),
  }

  return {
    activeId,
    overId,
    /** The item's own element while it is away: the dashed slot it left. */
    dragState: (id: UniqueIdentifier) => (id === activeId ? ("placeholder" as const) : undefined),
    /** A target under the held item. */
    dropState: (id: UniqueIdentifier) => (id === overId && activeId !== null ? (valid ? ("valid" as const) : ("invalid" as const)) : undefined),
    handlers,
  }
}
