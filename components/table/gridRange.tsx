"use client"

/**
 * A block of the grid's cells (tables G1: gsheets-grid-01, airtable-04): its
 * eager shell. It keeps the range, draws its one overlay (set on the DOM, so a
 * range re-renders no cell) and hands the grid's events to the range's piece
 * (rangePiece: keys, mouse and finger, fill handle, clipboard, writes), a
 * chunk of its own warmed when the page is idle and as the pointer or the
 * focus reaches the grid. The piece imports no code other pages load (a new
 * chunk that does re-cuts every route's shared chunks), so the shell does that
 * code's work for it (kitOf). Until it lands, Shift+arrows and Ctrl/Cmd+D on a
 * cell at rest, a paste there, and a press wait for it (a press it takes up
 * unless ended); a copy hands the clipboard promises.
 */

import * as React from "react"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { useStableCallback } from "@/hooks/useStableCallback"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { blockText } from "@/lib/tables/cellText"
import { formatLocale } from "@/lib/tables/numberFormat"
import { isComposingKey } from "@/lib/keys/ime"
import { lazyView } from "@/lib/lazy/lazyView"
import { reloadForNewBuild } from "@/lib/newBuild"
import { whenIdle } from "@/lib/whenIdle"
import { feedback } from "@/lib/ui/feedback"
import type { Box } from "@/lib/tables/cellRange"
import type { GridWrites, RangeWrites } from "@/components/table/rangeActions"
import type { EarlyPress, KeyLike, RangeHandlers, RangeShell } from "@/components/table/rangePiece"

let pieceIn: typeof import("@/components/table/rangePiece") | null = null
const RangePart = lazyView(() =>
  import("@/components/table/rangePiece").then((m) => {
    pieceIn = m
    return m
  }),
)

/** The ledger, its own chunk (as the grid's undo reads it); gone after a deploy, the page reloads for the new build. */
const ledger = () =>
  import("@/lib/tables/ledger").catch(async (e: unknown) => {
    if (await reloadForNewBuild(e)) return new Promise<never>(() => undefined)
    throw e
  })

/** The grid's writes with the kit (RangeKit): the work of code the piece can't import. */
const kitOf = (g: GridWrites): RangeWrites => ({
  ...g,
  say: ({ action, ...t }) =>
    void toast({
      ...t,
      action: action && (
        <ToastAction altText={action.label} onClick={action.run}>
          {action.label}
        </ToastAction>
      ),
    }),
  batch: (input) => ledger().then((m) => m.batchRows(g.tableId, input, true)),
  undo: (set) => ledger().then((m) => m.undoChange(g.tableId, set)),
  failure: (e, fallback) => ({ status: apiErrorStatus(e), message: apiErrorMessage(e, fallback) }),
  writable: (f) => fieldKind(f.type).stored,
  text: (rows, fields) => blockText(rows, fields, g.valuesOf),
  count: (n) => formatLocale(n, {}),
})

/** A finger's hold that starts a range taps the hand, as a long press does everywhere in the app. */
const onHeld = () => void feedback("impact")

/** A key the piece takes from a cell at rest, kept until it lands: Shift+arrows, Ctrl/Cmd+D. */
const waits = (e: React.KeyboardEvent) =>
  e.ctrlKey || e.metaKey ? !e.altKey && !e.shiftKey && e.key.toLowerCase() === "d" : e.shiftKey && !e.altKey && e.key.startsWith("Arrow")
/** A cell at rest's box ("row:col"), where a key, a copy or a paste came from. */
const atRest = (t: EventTarget | null) => (t instanceof HTMLElement && t.hasAttribute("data-rest") ? t.dataset.cell : undefined)

export function useGridRange(o: Pick<RangeShell, "tableRef" | "scrollRef" | "focusCell" | "revealCell"> & { writes: () => GridWrites }) {
  const overlay = React.useRef<HTMLDivElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const fill = React.useRef<HTMLDivElement>(null)
  const status = React.useRef<HTMLSpanElement>(null)
  const writes = useStableCallback(() => kitOf(o.writes()))
  const shell = React.useRef<RangeShell>(null)
  const s = (shell.current ??= { ...o, range: null, overlay, box, fill, status, writes, onHeld })
  s.focusCell = o.focusCell
  s.revealCell = o.revealCell

  const made = React.useRef<RangeHandlers | null>(null)
  const handlers = useStableCallback(() => (made.current ??= pieceIn && pieceIn.rangeHandlers(s)))
  /** The piece's handlers once `attempt` lands it, the focus's cell drawn as the range. */
  const landed = (attempt = RangePart.warm()) =>
    attempt.then(() => {
      const h = handlers()!
      h.landed()
      return h
    })
  const failed = React.useRef<Promise<unknown>>(null)
  /** `job` once the piece is in; a load that fails says so once. */
  const whenIn = (verb: string, job: (h: RangeHandlers) => void) => {
    const attempt = RangePart.warm()
    landed(attempt).then(job, () => {
      if (failed.current === attempt) return
      failed.current = attempt
      toast({ tone: "error", title: `Couldn't ${verb} those cells: try again` })
    })
  }
  const warming = React.useRef(false)
  const warm = useStableCallback(() => {
    if (pieceIn || warming.current) return
    warming.current = true
    landed().catch(() => (warming.current = false))
  })
  React.useEffect(() => whenIdle(warm), [warm])

  const onKey = useStableCallback((e: React.KeyboardEvent): boolean => {
    // A key in an input method's word is its box's.
    if (isComposingKey(e.nativeEvent)) return false
    const h = handlers()
    if (h) return h.onKey(e)
    const cell = atRest(e.target)
    if (!cell || !waits(e)) return false
    e.preventDefault()
    e.stopPropagation()
    const k: KeyLike = { key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: e.target, preventDefault() {}, stopPropagation() {} }
    whenIn(e.shiftKey ? "select" : "fill", (h) => void h.keyFrom(cell, k))
    return true
  })
  const onCopy = useStableCallback((e: React.ClipboardEvent) => {
    const h = handlers()
    if (h) return h.onCopy(e)
    // A browser whose clipboard takes no promises copies the cell's text itself.
    const cell = atRest(e.target)
    if (!cell || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return
    e.preventDefault()
    const copied = landed().then((h) => h.copyFrom(cell) ?? { text: "", html: "" })
    const as = (type: "text" | "html") => copied.then((c) => new Blob([c[type]], { type: `text/${type === "text" ? "plain" : type}` }))
    navigator.clipboard
      .write([new ClipboardItem({ "text/plain": as("text"), "text/html": as("html") })])
      .catch(() => toast({ tone: "error", title: "Couldn't copy those cells: try again" }))
  })
  const onPaste = useStableCallback((e: React.ClipboardEvent) => {
    const h = handlers()
    if (h) return h.onPaste(e)
    const cell = atRest(e.target)
    if (!cell) return
    e.preventDefault()
    const clip = { text: e.clipboardData.getData("text/plain"), html: e.clipboardData.getData("text/html") }
    whenIn("paste", (h) => h.pasteInto(cell, clip))
  })
  const onPointerDown = useStableCallback((e: React.PointerEvent) => {
    const h = handlers()
    if (h) return h.onPointerDown(e)
    warm()
    if (e.button !== 0) return
    const p: EarlyPress = { button: 0, pointerType: e.pointerType, pointerId: e.pointerId, shiftKey: e.shiftKey, clientX: e.clientX, clientY: e.clientY, target: e.target, at: performance.now(), ended: false }
    // A finger's touch events stay with the element it went down on, even once a live cell takes its place.
    const t = e.target as HTMLElement
    const end = (ev: Event) => {
      if (!("pointerId" in ev) || ev.pointerId === p.pointerId) p.ended = true
    }
    const off = () => {
      window.removeEventListener("pointerup", end, true)
      window.removeEventListener("pointercancel", end, true)
      t.removeEventListener("touchend", end)
      t.removeEventListener("touchcancel", end)
    }
    window.addEventListener("pointerup", end, true)
    window.addEventListener("pointercancel", end, true)
    t.addEventListener("touchend", end)
    t.addEventListener("touchcancel", end)
    landed().then((h) => {
      off()
      h.adopt(p)
    }, off)
  })

  // The grid's touchmove isn't passive: a finger holding a range drags it rather than scrolling the page.
  React.useEffect(() => {
    const el = o.scrollRef.current
    if (!el) return
    const move = (e: TouchEvent) => handlers()?.onTouchMove(e)
    const end = (e: TouchEvent) => handlers()?.onTouchEnd(e)
    el.addEventListener("touchmove", move, { passive: false })
    el.addEventListener("touchend", end)
    el.addEventListener("touchcancel", end)
    return () => {
      el.removeEventListener("touchmove", move)
      el.removeEventListener("touchend", end)
      el.removeEventListener("touchcancel", end)
      made.current?.dispose()
    }
  }, [o.scrollRef, handlers])

  const handle = useStableCallback((e: React.PointerEvent<HTMLSpanElement>) => handlers()?.handle[e.type === "pointerdown" ? "down" : e.type === "pointermove" ? "move" : e.type === "pointerup" ? "up" : "cancel"](e))
  // The overlay never re-renders: everything about it is set on the DOM.
  const drawn = React.useMemo(
    () => (
      <>
        <div ref={overlay} className="v3-cell-range" data-cell-range="" data-on="false" aria-hidden="true">
          <div ref={box} data-range-box="">
            <span data-fill-handle="" onPointerDown={handle} onPointerMove={handle} onPointerUp={handle} onPointerCancel={handle} />
          </div>
          <div ref={fill} data-fill-box="" />
        </div>
        <span ref={status} className="sr-only" role="status" aria-live="polite" />
      </>
    ),
    [handle],
  )

  return {
    overlay: drawn,
    place: useStableCallback(() => handlers()?.place()),
    inFrozen: useStableCallback(() => overlay.current?.dataset.on === "true" && overlay.current.dataset.inFrozen === "true"),
    select: useStableCallback((b: Box) => handlers()?.select(b)),
    /** A cell took the focus. */
    onFocusIn: useStableCallback((target: EventTarget) => (handlers() ? handlers()!.onFocusIn(target) : warm())),
    /** The focus left the grid. */
    clear: useStableCallback(() => (handlers() ? handlers()!.clear() : (s.range = null))),
    onKey,
    onCopy,
    onPaste,
    onPointerDown,
    onMouseDown: useStableCallback((e: React.MouseEvent) => handlers()?.onMouseDown(e)),
    /** The click a drag, Shift+click or long press ended with: true when taken (it opens no cell). */
    onClick: useStableCallback((e: React.MouseEvent): boolean => handlers()?.onClick(e) ?? false),
    onContextMenu: useStableCallback((e: React.MouseEvent) => handlers()?.onContextMenu(e)),
    warm,
  }
}
