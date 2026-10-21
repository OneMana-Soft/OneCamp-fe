"use client"

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useDispatch, useSelector, useStore } from "react-redux"
import { DndContext, useDraggable, useDroppable, type CollisionDetection, type DragCancelEvent, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core"
import type { RootState } from "@/store/store"
import { DRAG_OVERLAY, dragPoint, useDndSetup, useDragState, type DragWords } from "@/lib/ui/dnd"
import { measureFlip, playFlip } from "@/lib/flip"
import { announce } from "@/lib/ui/announce"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { ArrowLeftRight, GripVertical } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { MAIN, MAIN_KEY, keyOf, paneKey, type Pane } from "@/lib/split"
import { SEAM_PX, viewRow } from "@/lib/splitLayout"
import { moveView, restoreSplit, swapViews } from "@/store/slice/splitActions"
import { selectSplit } from "@/hooks/useSplitView"
import { useViewLook, viewLook } from "@/components/split/paneLook"

type Zone = "before" | "swap" | "after"
export type Aim = { key: string; zone: Zone }
/** A view on screen: its key and where its sheet is. */
export type Spot = { key: string; rect: { left: number; right: number; width: number; top: number; height: number } }

/**
 * Where a view held at `x` would go among the views on screen, left to
 * right: before or after the one under it (its outer quarters), or into its
 * place, the two swapping (its middle half). Null where it would land where
 * it is. Pure.
 */
export function aimAt(x: number, spots: Spot[], held: string): Aim | null {
  const i = spots.findIndex((s) => x >= s.rect.left - SEAM_PX / 2 && x < s.rect.right + SEAM_PX / 2)
  const h = spots.findIndex((s) => s.key === held)
  if (i < 0 || i === h) return null
  const f = (x - spots[i].rect.left) / spots[i].rect.width
  const zone: Zone = f < 0.25 ? "before" : f > 0.75 ? "after" : "swap"
  if ((zone === "before" && h === i - 1) || (zone === "after" && h === i + 1)) return null
  return { key: spots[i].key, zone }
}

/**
 * Where the arrow keys stop while a view is held: before each view and in
 * its place, and after the last; never where nothing would change. Pure.
 */
export function stopsFor(spots: Spot[], held: string): { x: number; aim: Aim }[] {
  const xs = spots.flatMap((s, i) => [s.rect.left + s.rect.width * 0.125, s.rect.left + s.rect.width / 2, ...(i === spots.length - 1 ? [s.rect.right - s.rect.width * 0.125] : [])])
  return xs.flatMap((x) => {
    const aim = aimAt(x, spots, held)
    return aim ? [{ x, aim }] : []
  })
}

/**
 * A drop before or after a view (design verdict, 20 Oct): its line, centred in
 * the gap to the neighbour on that side (the gutter at the row's end), and the
 * incoming column's faint slot on the target's side of the line, the held
 * view's width but never past half the target, as VS Code previews a split: a
 * swap tints the whole target, with its chip, so the two never look alike. Pure.
 */
export function dropMarks(aim: Aim, spots: Spot[], held: string) {
  const i = spots.findIndex((s) => s.key === aim.key)
  const t = spots[i]?.rect
  if (!t || aim.zone === "swap") return null
  const before = aim.zone === "before"
  const n = spots[before ? i - 1 : i + 1]?.rect
  const x = before ? (n ? (n.right + t.left) / 2 : t.left - SEAM_PX / 2) : n ? (t.right + n.left) / 2 : t.right + SEAM_PX / 2
  const w = Math.min(spots.find((s) => s.key === held)?.rect.width ?? 0, t.width / 2)
  return { x, top: t.top, height: t.height, slotLeft: before ? x + SEAM_PX / 2 : x - SEAM_PX / 2 - w, slotWidth: w }
}

/** The change a drop makes: the held view moved before or after another, or the two swapped. */
export function dropOf(aim: Aim, held: string, panes: Pane[], order: string[]) {
  const viewOf = (k: string) => (k === MAIN_KEY ? MAIN : panes.findIndex((p) => paneKey(p) === k))
  const a = viewOf(held)
  const b = viewOf(aim.key)
  if (aim.zone === "swap") return swapViews({ a, b, quiet: true })
  const rest = viewRow(panes, order).filter((v) => v !== a)
  return moveView({ view: a, to: rest.indexOf(b) + (aim.zone === "after" ? 1 : 0), quiet: true })
}

/**
 * A layer mark's attributes: that it is one (data-split-mark), and whether it
 * shows (data-on). `.split-layer > [data-split-mark]:not([data-on])` hides it,
 * keyed on the mark's own attribute, so no other element is ever tried.
 */
const mark = (shown: unknown) => ({ "data-split-mark": "", "data-on": shown ? "" : undefined })

/** The last change told, kept across mounts: the layer goes while a view is focused alone. */
let told: unknown = null

const rowKeys = (s: RootState) => {
  const { panes, order } = selectSplit(s)
  return viewRow(panes, order).map((v) => keyOf(panes, v))
}

// One element each: the held view's handle renders on every move (its
// transform), and an unchanged element isn't rendered again.
const PILL = <i aria-hidden="true" />
const GLYPH = <GripVertical className="split-handle-glyph" aria-hidden="true" />

/** A view's handle, in its slot: a pane's whole bar, under its buttons, or the grip on the page's top edge. */
function Handle({ id, slot, label }: { id: string; slot: HTMLElement; label: string }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id })
  const main = id === MAIN_KEY
  return createPortal(
    <div ref={setNodeRef} {...attributes} {...listeners} aria-label={`Move ${label}`} data-drag-handle="" className={main ? "split-grip" : "split-handle"}>
      {main ? PILL : GLYPH}
    </div>,
    slot,
  )
}

/** The handle named as its view's bar is: the name follows the view, apart from the handle, which draws on every move. */
const NamedHandle = memo(function NamedHandle({ id, slot }: { id: string; slot: HTMLElement }) {
  return <Handle id={id} slot={slot} label={useViewLook(id).name} />
})

/** Where a held view can land on another: before it, in its place, after it (all its sheet; the aim says which). */
function Drop({ id, node }: { id: string; node: HTMLElement }) {
  const { setNodeRef } = useDroppable({ id })
  useLayoutEffect(() => setNodeRef(node), [node, setNodeRef])
  return null
}

const sameEls = (a: { key: string; sheet: HTMLElement; slot: HTMLElement | null }[], b: typeof a) =>
  a.length === b.length && a.every((x, i) => x.key === b[i].key && x.sheet === b[i].sheet && x.slot === b[i].slot)

/**
 * The arrange layer of split view (case matrix, release-1010/design/split):
 * drag a view by its bar (the page by its grip) to put it before or after
 * another, or into its place; or hold it with Space and walk it with the
 * arrows. The shared drag (lib/ui/dnd: its sensors, keys and words) in a
 * layer of its own beside the panel group: its handles are portals into the
 * views' bars, so nothing here wraps a view, and a drag never draws one. The
 * ghost and the drop line move on transforms; the views move by CSS order
 * (never in the DOM: a moved element loses its scroll and focus) and travel
 * there by FLIP. Every move, swap and make-room close says so in a toast
 * with Undo. Loaded with the first pane (components/split/lazy).
 *
 * What a carry draws (fluid-21): one layer of marks, made with the layer and
 * only ever shown, hidden and moved: the carry's surface over the page (the
 * drag's cursor sits on it, under the pointer, and the views under it take no
 * pointer: an editor tracking it laid the page out on every move), the place
 * the held view left, the ghost, the line, the slot and the swap. The held
 * view is see-through (data-split-held, the sheet alone restyled); hiding what
 * it holds, and the views' pointer, restyled every element in them as a view
 * was lifted and set down.
 */
export function SplitArrange({ shown }: { shown: string }) {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const [els, setEls] = useState<{ key: string; sheet: HTMLElement; slot: HTMLElement | null }[]>([])
  const spots = useRef<Spot[]>([])
  const held = useRef("")
  const [aim, setAim] = useState<Aim | null>(null)
  const aimRef = useRef<Aim | null>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const start = useRef({ x: 0, y: 0 })
  const [layer, setLayer] = useState<HTMLElement | null>(null)

  // The marks' layer, at the end of the page's body for as long as the arrange layer is.
  useLayoutEffect(() => {
    const el = document.createElement("div")
    el.className = "split-layer"
    document.body.appendChild(el)
    setLayer(el)
    // Gone before a carry ended (a view focused alone), it leaves no view see-through.
    return () => {
      el.remove()
      document.querySelector("[data-split-held]")?.removeAttribute("data-split-held")
    }
  }, [])

  // The views on screen and their handles' slots (a pane's draws after this
  // loads: "split:slots"). A move changes only their order, so only a view
  // shown or hidden finds them again.
  const shownSet = shown.split(",").sort().join()
  useLayoutEffect(() => {
    const find = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>("[data-split-sheet]"))
        .filter((sheet) => sheet.getClientRects().length > 0)
        .map((sheet) => {
          const key = sheet.dataset.splitSheet ?? ""
          return { key, sheet, slot: document.querySelector<HTMLElement>(`[data-split-handle="${key}"]`) }
        })
      setEls((was) => (sameEls(was, next) ? was : next))
    }
    find()
    window.addEventListener("split:slots", find)
    return () => window.removeEventListener("split:slots", find)
  }, [shownSet])

  // A move travels: measured before the store's change reaches the page,
  // played once it has. The views only: a task list's rows inside one move
  // with it, and played on their own they went twice the distance.
  useEffect(() => {
    let last = rowKeys(store.getState())
    return store.subscribe(() => {
      const now = rowKeys(store.getState())
      if (now.join() === last.join()) return
      const reordered = [...now].sort().join() === [...last].sort().join()
      last = now
      if (!reordered) return
      const root = document.querySelector("[data-split-row]")
      const before = measureFlip(root, new Set(now))
      requestAnimationFrame(() => void playFlip(root, before, { duration: 200 }))
    })
  }, [store])

  // Every change worth an Undo, in a toast (one at a time) and in words.
  const change = useSelector((s: RootState) => selectSplit(s).change)
  const lastToast = useRef<{ dismiss: () => void } | null>(null)
  useEffect(() => {
    if (!change || change === told) return
    told = change
    const s = store.getState()
    const name = viewLook(s, selectSplit(s), change.key, change.pane).name
    const row = rowKeys(s)
    const title = change.what === "room" ? `Closed ${name} to make room` : change.what === "swap" ? `Swapped ${name} and ${viewLook(s, selectSplit(s), change.other ?? "").name}` : `Moved ${name}`
    const description =
      change.what === "room" ? `${Math.min(selectSplit(s).room + 1, 4)} views fit side by side in this window.` : change.what === "move" ? `Now ${row.indexOf(change.key) + 1} of ${row.length}, left to right.` : undefined
    if (!change.quiet) announce(`${title}. ${description ?? ""}`)
    const before = change.before
    const undo = () => {
      dispatch(restoreSplit(before))
      announce("Put back as it was.")
    }
    lastToast.current?.dismiss()
    lastToast.current = toast({ title, description, tone: change.what === "room" ? "info" : undefined, action: <ToastAction altText="Undo" onClick={undo}>Undo</ToastAction> })
  }, [change, dispatch, store])

  const nameOf = useCallback((key: string) => viewLook(store.getState(), selectSplit(store.getState()), key).name, [store])
  const words = useMemo<DragWords>(
    () => ({
      name: (id) => nameOf(String(id).split("|")[0]),
      place: (id) => {
        const [key, zone] = String(id).split("|")
        if (!zone) {
          const row = rowKeys(store.getState())
          return { container: "the views side by side", position: row.indexOf(key) + 1, count: row.length }
        }
        return { container: zone === "swap" ? `${nameOf(key)}'s place, the two swapping` : `the place ${zone} ${nameOf(key)}` }
      },
    }),
    [nameOf, store],
  )
  // The arrow keys walk the held view through the places it can go.
  const keys = useCallback<KeyboardCoordinateGetter>((event, { context }) => {
    const r = context.collisionRect
    if (!r || (event.code !== "ArrowLeft" && event.code !== "ArrowRight")) return
    event.preventDefault()
    const cx = r.left + r.width / 2
    const stops = stopsFor(spots.current, held.current)
    const next = event.code === "ArrowRight" ? stops.find((s) => s.x > cx + 1) : [...stops].reverse().find((s) => s.x < cx - 1)
    return next ? { x: next.x - r.width / 2, y: r.top } : undefined
  }, [])
  const dnd = useDndSetup(words, keys)
  const drag = useDragState()
  const collide = useCallback<CollisionDetection>(({ pointerCoordinates, collisionRect }) => {
    const a = aimAt(pointerCoordinates?.x ?? collisionRect.left + collisionRect.width / 2, spots.current, held.current)
    return a ? [{ id: `${a.key}|${a.zone}` }] : []
  }, [])

  const sheetOf = (key: string) => els.find((x) => x.key === key)?.sheet
  const finish = () => {
    sheetOf(held.current)?.removeAttribute("data-split-held")
    held.current = ""
    aimRef.current = null
    setAim(null)
  }
  const onStart = (e: DragStartEvent) => {
    drag.handlers.onDragStart(e)
    held.current = String(e.active.id)
    spots.current = els.map(({ key, sheet }) => ({ key, rect: sheet.getBoundingClientRect() })).sort((a, b) => a.rect.left - b.rect.left)
    // Space lifts before the handle is measured: the ghost starts on it, not in the corner.
    const r = e.active.rect.current.initial ?? (e.activatorEvent?.target as Element | null)?.getBoundingClientRect?.()
    sheetOf(held.current)?.setAttribute("data-split-held", "")
    const t = (e.activatorEvent as TouchEvent | null)?.touches?.[0]
    const p = e.activatorEvent instanceof MouseEvent ? { x: e.activatorEvent.clientX, y: e.activatorEvent.clientY } : t ? { x: t.clientX, y: t.clientY } : r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }
    start.current = p
  }
  const onMove = (e: DragMoveEvent) => {
    const r = e.active.rect.current.translated
    const p = dragPoint(e) ?? (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null)
    if (!p) return
    if (ghost.current) ghost.current.style.transform = `translate3d(${Math.round(p.x + 14)}px, ${Math.round(p.y + 10)}px, 0)`
    const a = aimAt(p.x, spots.current, held.current)
    if (a?.key !== aimRef.current?.key || a?.zone !== aimRef.current?.zone) {
      aimRef.current = a
      setAim(a)
    }
  }
  const onCancel = (e: DragCancelEvent) => {
    drag.handlers.onDragCancel(e)
    finish()
  }
  // The move first, while the views are still as they were drawn: its FLIP
  // reads them from the last frame, not from a page restyled on the spot.
  const onEnd = (e: DragEndEvent) => {
    drag.handlers.onDragEnd(e)
    const a = aimRef.current
    const { panes, order } = selectSplit(store.getState())
    if (a) dispatch(dropOf(a, held.current, panes, order))
    finish()
  }

  const holding = drag.activeId !== null ? String(drag.activeId) : ""
  const look = holding ? viewLook(store.getState(), selectSplit(store.getState()), holding) : null
  const left = holding ? spots.current.find((s) => s.key === holding)?.rect : undefined
  const target = aim ? spots.current.find((s) => s.key === aim.key)?.rect : undefined
  const marks = aim ? dropMarks(aim, spots.current, held.current) : null
  const GhostIcon = look?.icon
  const box = (r?: { left: number; top: number; width: number; height: number }) => (r ? { left: r.left, top: r.top, width: r.width, height: r.height } : undefined)
  return (
    <DndContext {...dnd} {...drag.handlers} collisionDetection={collide} onDragStart={onStart} onDragMove={onMove} onDragEnd={onEnd} onDragCancel={onCancel}>
      {els.map(({ key, slot }) => slot && <NamedHandle key={key} id={key} slot={slot} />)}
      {els.flatMap(({ key, sheet }) => (["before", "swap", "after"] as const).map((z) => <Drop key={`${key}|${z}`} id={`${key}|${z}`} node={sheet} />))}
      {layer &&
        createPortal(
          <>
            <div className={cn("split-carry", DRAG_OVERLAY)} {...mark(holding)} />
            <div className="split-held" {...mark(left)} style={box(left)} />
            <div ref={ghost} className="split-ghost" data-drag-state="lifted" {...mark(look)} aria-hidden="true" style={{ transform: `translate3d(${Math.round(start.current.x + 14)}px, ${Math.round(start.current.y + 10)}px, 0)` }}>
              {GhostIcon && <GhostIcon className="h-4 w-4 shrink-0 text-ink-3" />}
              <span className="truncate">{look?.name}</span>
            </div>
            <span className="split-drop-slot" {...mark(marks && marks.slotWidth > 0)} style={marks ? { left: marks.slotLeft, top: marks.top, width: marks.slotWidth, height: marks.height } : undefined} />
            <span data-drop-line="col" {...mark(marks)} style={marks ? { left: marks.x - 1, top: marks.top + 8, height: marks.height - 16 } : undefined} />
            <div className="split-drop-swap" data-drop="valid" {...mark(aim?.zone === "swap" && target)} style={box(target)}>
              <span className="split-drop-chip">
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> Swap places
              </span>
            </div>
          </>,
          layer,
        )}
    </DndContext>
  )
}
