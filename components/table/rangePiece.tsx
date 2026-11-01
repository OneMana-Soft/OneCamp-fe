"use client"

/**
 * A block of the grid's cells (tables G1: gsheets-grid-01, airtable-04): the
 * range's piece, a chunk of its own off the table's first load. Its eager
 * shell (gridRange) keeps the range and its overlay and hands it the grid's
 * events: here are the keys, the mouse and the finger, the fill handle and
 * the clipboard, and through rangeActions the writes.
 *
 * It imports no code another page loads (app/firstLoad.test.ts): a new lazy
 * chunk that does re-cuts every route's shared chunks. What it needs of that
 * code (toasts, the batch, the server's words, a cell's text as the export
 * writes it) the shell hands it with the writes (RangeKit).
 */

import type * as React from "react"
import { boxOf, boxSize, extendRange, type Box, type CellRange } from "@/lib/tables/cellRange"
import { toHtmlTable, toTsv } from "@/lib/tables/clipboardGrid"
import type { CellPos } from "@/lib/tables/gridKeys"
import { clearCells, fillCells, pasteCells, type RangeWrites } from "@/components/table/rangeActions"

/** What the shell keeps and the piece works on: the range, the overlay's elements, the grid's hands. */
export interface RangeShell {
  /** From the cell it started at (its anchor) to the one it reached (its focus); null with the focus off the grid. */
  range: CellRange | null
  tableRef: React.RefObject<HTMLTableElement | null>
  scrollRef: React.RefObject<HTMLDivElement | null>
  overlay: React.RefObject<HTMLDivElement | null>
  box: React.RefObject<HTMLDivElement | null>
  fill: React.RefObject<HTMLDivElement | null>
  status: React.RefObject<HTMLSpanElement | null>
  /** What the writes need, as of now: the grid's, with the shell's kit. */
  writes: () => RangeWrites
  /** Gives a cell the focus, shut (the grid's focusCell). */
  focusCell: (row: number, col: number, shut?: boolean) => void
  /** Brings a cell into view without giving it the focus. */
  revealCell: (row: number, col: number) => void
  /** A finger's hold started a range: the shell plays its feedback (lib/ui/feedback, which the piece can't import). */
  onHeld: () => void
}

/** A key's part the range reads: a React event's, or one the shell kept until the piece landed (its preventDefault done then). */
export type KeyLike = Pick<React.KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "target" | "preventDefault" | "stopPropagation">

/** How a press went down: a React event's, or one the shell kept until the piece landed. */
type PressStart = Pick<React.PointerEvent, "button" | "pointerType" | "pointerId" | "shiftKey" | "clientX" | "clientY" | "target">

/** A press made before the piece landed, kept by the shell: when it went down, and whether it has ended (or turned into a scroll) since. */
export interface EarlyPress extends PressStart {
  at: number
  ended: boolean
}

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
/** A finger held this long on a cell starts a range (as Sheets on a phone). */
const LONG_PRESS_MS = 500
/** A finger that moves this far first is scrolling, not holding. */
const SLOP_PX = 10

const same = (a: CellPos, b: CellPos) => a.row === b.row && a.col === b.col

/** A cell's place from its box's data-cell ("row:col"). */
function posOf(id: string | undefined): CellPos | null {
  if (!id) return null
  const [row, col] = id.split(":").map(Number)
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}
/** The cell an element is in, by its box's data-cell. */
const cellOf = (el: Element | null | undefined) => posOf(el?.closest?.("tbody td[data-field]")?.querySelector<HTMLElement>("[data-cell]")?.dataset.cell)
const cellAt = (x: number, y: number) => cellOf(document.elementFromPoint(x, y))

/** The row (its index among the rows shown) at a point, or null off the rows. */
function rowAt(x: number, y: number): number | null {
  const at = document.elementFromPoint(x, y)?.closest<HTMLElement>("tbody tr[data-index]")?.dataset.index
  return at === undefined ? null : Number(at)
}

/** A live text box keeps its own keys, copy and paste; a cell at rest or shut, or a control that isn't text, takes the range's. */
function typingIn(t: HTMLElement): boolean {
  if (t.hasAttribute("data-rest")) return false
  if (t instanceof HTMLTextAreaElement) return true
  return t instanceof HTMLInputElement && /^(text|number|email|url|tel|search)$/.test(t.type)
}

/** Part of a box's text selected: not none, not all. */
function partSelected(t: HTMLElement): boolean {
  if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return false
  const { selectionStart: s, selectionEnd: e } = t
  return s !== null && e !== null && s !== e && !(s === 0 && e === t.value.length)
}

/** A caret in a box, or part of its text selected: someone typing there. */
function caretIn(t: HTMLElement): boolean {
  if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return false
  const { selectionStart: s, selectionEnd: e } = t
  return s !== null && e !== null && !(s === 0 && e === t.value.length && e > 0)
}

/** One value on the clipboard: no tab or line end in its text but a last one, and no second cell in its HTML table. */
function oneValue(text: string, html: string): boolean {
  if (/[\t\r\n]/.test(text.replace(/(\r\n|\r|\n)$/, ""))) return false
  return !/<t[dh][\s>][\s\S]*?<t[dh][\s>]/i.test(html)
}

/** What a range's announcement says. */
const rangeText = (b: Box) => {
  const { rows, cols } = boxSize(b)
  return `${rows * cols} cells selected, ${rows} ${rows === 1 ? "row" : "rows"} by ${cols} ${cols === 1 ? "column" : "columns"}`
}

/** A finger's touch events seen once (on its own element, and again where they bubble). */
const seen = new WeakSet<Event>()

interface Press {
  /** A finger's: held still, it starts a range (ranging); a mouse's grows one by its drag. */
  touch: boolean
  /**
   * The element a finger went down on: its touch events go there to the end,
   * even once a live cell has taken its place (the cell comes to life as the
   * finger presses), so they're listened to there.
   */
  target: HTMLElement | null
  id: number
  from: CellPos
  x: number
  y: number
  moved: boolean
  ranging: boolean
  timer: number
}

/** A rect against the table, and whether the box runs past the rows drawn above or below it. */
interface Placed {
  x: number
  y: number
  w: number
  h: number
  clipTop: boolean
  clipBottom: boolean
}

/** The copy of a range: its cells as TSV and as an HTML table. */
export interface Copied {
  text: string
  html: string
}

/** A grid's range handlers, made once the piece lands, on the shell's state (`s`). */
export function rangeHandlers(s: RangeShell) {
  let press: Press | null = null
  // A long press's range shows on its one cell too, handle and all: no focus ring marks it.
  let held = false
  // The click a drag or a Shift+click ends with, and the menu a long press opens, go nowhere.
  let swallow = { click: false, menu: false }
  let fill: { box: Box; to: (Box & { up: boolean }) | null } | null = null

  /** Where a box's cells are drawn, against the table: its columns by their headers, its rows by those drawn (the rest are off the window). */
  const rectOf = (box: Box): Placed | null => {
    const table = s.tableRef.current
    const body = table?.tBodies[0]
    const th = (i: number) => table?.querySelector<HTMLElement>(`thead th[data-col-index="${i}"]`)
    const l = th(box.left)
    const r = th(box.right)
    if (!table || !body || !l || !r) return null
    let top = Infinity
    let bottom = -Infinity
    let first = Infinity
    let last = -Infinity
    for (const tr of Array.from(body.rows)) {
      const at = tr.dataset.index
      if (at === undefined) continue
      const i = Number(at)
      if (i < box.top || i > box.bottom) continue
      const b = tr.getBoundingClientRect()
      top = Math.min(top, b.top)
      bottom = Math.max(bottom, b.bottom)
      first = Math.min(first, i)
      last = Math.max(last, i)
    }
    if (top === Infinity) return null
    const t = table.getBoundingClientRect()
    const lb = l.getBoundingClientRect()
    const rb = r.getBoundingClientRect()
    const left = Math.min(lb.left, rb.left)
    const right = Math.max(lb.right, rb.right)
    return { x: left - t.left, y: top - t.top, w: right - left, h: bottom - top, clipTop: first > box.top, clipBottom: last < box.bottom }
  }

  const draw = (el: HTMLElement, p: Placed) => {
    el.style.width = `${p.w}px`
    el.style.height = `${p.h}px`
    el.style.transform = `translate(${p.x}px, ${p.y}px)`
  }

  /** Draws the range where its cells are; hidden with none, or none of its rows drawn. */
  const place = () => {
    const o = s.overlay.current
    const el = s.box.current
    if (!o || !el) return
    const r = s.range
    const box = r && boxOf(r)
    const p = box && rectOf(box)
    if (!box || !p) {
      o.dataset.on = "false"
      return
    }
    draw(el, p)
    const one = box.top === box.bottom && box.left === box.right
    o.dataset.single = one && !held ? "true" : "false"
    // Its first column frozen (up to three are: the header's marks say): it rides over the frozen columns.
    o.dataset.inFrozen = s.tableRef.current?.tHead?.rows[0]?.cells[box.left + 1]?.hasAttribute("data-frozen") ? "true" : "false"
    o.dataset.clipTop = p.clipTop ? "true" : "false"
    o.dataset.clipBottom = p.clipBottom ? "true" : "false"
    o.dataset.on = "true"
  }

  const say = (r: CellRange | null) => {
    const el = s.status.current
    if (!el) return
    const text = r && !same(r.anchor, r.focus) ? rangeText(boxOf(r)) : ""
    if (el.textContent !== text) el.textContent = text
  }

  const set = (r: CellRange | null) => {
    s.range = r
    place()
    say(r)
  }
  /** The range's focus moves; its anchor stays. */
  const reach = (at: CellPos) => {
    const r = s.range
    if (r && !same(r.focus, at)) set({ anchor: r.anchor, focus: at })
  }
  /** The range from the cell holding the focus: the range itself when it started there, else that cell alone. */
  const current = (at: CellPos): CellRange => {
    const r = s.range
    return r && same(r.anchor, at) ? r : { anchor: at, focus: at }
  }

  const ranging = (on: boolean) => {
    const table = s.tableRef.current
    if (!table) return
    if (on) {
      table.dataset.ranging = ""
      window.getSelection()?.removeAllRanges()
    } else delete table.dataset.ranging
  }

  // ---- the focus ---------------------------------------------------------

  /** A cell took the focus: the range starts there, unless it already did (a drag or Shift+click keeps the focus on its anchor). */
  const onFocusIn = (target: EventTarget) => {
    const at = cellOf(target as Element)
    if (!at) return
    const r = s.range
    if (r && same(r.anchor, at)) return place()
    held = false
    set({ anchor: at, focus: at })
  }
  /** The focus left the grid. */
  const clear = () => {
    if (press?.ranging || fill) return
    held = false
    set(null)
  }
  /** The piece has landed: a cell that took the focus before it is the range, and the range is drawn. */
  const landed = () => {
    const el = document.activeElement
    if (!s.range && el && s.tableRef.current?.contains(el)) {
      const at = cellOf(el)
      if (at) s.range = { anchor: at, focus: at }
    }
    place()
  }

  // ---- the keys ----------------------------------------------------------

  const fillDown = (box: Box) => {
    const { left, right } = box
    if (box.bottom > box.top) return void fillCells(s.writes(), { left, right, source: { top: box.top, bottom: box.top }, to: { top: box.top + 1, bottom: box.bottom }, copy: true })
    if (box.top > 0) return void fillCells(s.writes(), { left, right, source: { top: box.top - 1, bottom: box.top - 1 }, to: { top: box.top, bottom: box.top }, copy: true })
  }

  /**
   * A key from the cell `at`, at rest or shut, or a control that isn't text (a
   * live text box keeps its own): Shift+arrows grow the range, Escape drops
   * it, Delete or Backspace clears a range of more than one cell, Ctrl/Cmd+D
   * fills down. True when the range took the key.
   */
  const keyAt = (at: CellPos, e: KeyLike): boolean => {
    const r = current(at)
    const many = !same(r.anchor, r.focus)
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey
    const take = () => {
      e.preventDefault()
      e.stopPropagation()
      return true
    }
    if (ARROWS.has(e.key) && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const { rows, fields } = s.writes()
      const next = extendRange(r, e.key, { rows: rows().length, cols: fields().length })
      if (next) {
        set(next)
        s.revealCell(next.focus.row, next.focus.col)
      }
      return take()
    }
    if (ARROWS.has(e.key) && many) {
      // A plain arrow goes from the range's anchor, and the range is that cell again.
      set({ anchor: r.anchor, focus: r.anchor })
      return false
    }
    if (e.key === "Escape" && many) {
      set({ anchor: r.anchor, focus: r.anchor })
      return take()
    }
    if ((e.key === "Delete" || e.key === "Backspace") && many && !mod) {
      void clearCells(s.writes(), boxOf(r))
      return take()
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === "d") {
      fillDown(boxOf(r))
      return take()
    }
    return false
  }
  /** A key the grid hands over (the shell has checked it isn't an input method's). */
  const onKey = (e: KeyLike): boolean => {
    const target = e.target as HTMLElement
    if (typingIn(target)) return false
    const at = cellOf(target)
    return at ? keyAt(at, e) : false
  }

  // ---- the clipboard -----------------------------------------------------

  /** A copy from the cell `at`: the range's cells as the export says them, as TSV and as an HTML table. */
  const copyAt = (at: CellPos): Copied => {
    const box = boxOf(current(at))
    const w = s.writes()
    const block = w.text(w.rows().slice(box.top, box.bottom + 1), w.fields().slice(box.left, box.right + 1))
    return { text: toTsv(block), html: toHtmlTable(block) }
  }
  /** Ctrl/Cmd+C: the range's copy. A box with part of its text selected copies that. */
  const onCopy = (e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement
    const at = cellOf(target)
    if (!at || (typingIn(target) && partSelected(target))) return
    const { text, html } = copyAt(at)
    e.clipboardData.setData("text/plain", text)
    e.clipboardData.setData("text/html", html)
    e.preventDefault()
  }

  /** A block over the range from the cell `at`, as one batch. */
  const pasteAt = (at: CellPos, clip: Copied) => {
    if (!clip.text && !clip.html) return
    void pasteCells(s.writes(), clip, boxOf(current(at)))
  }
  /**
   * Ctrl/Cmd+V: a block over the range, as one batch. A box being typed in
   * keeps its own paste: with a caret, one value, or lines of text into a long
   * text's box.
   */
  const onPaste = (e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement
    const at = cellOf(target)
    if (!at) return
    const text = e.clipboardData.getData("text/plain")
    const html = e.clipboardData.getData("text/html")
    const r = current(at)
    const many = !same(r.anchor, r.focus)
    if (typingIn(target)) {
      if (caretIn(target)) return
      if (!many && (oneValue(text, html) || (target instanceof HTMLTextAreaElement && !text.includes("\t")))) return
    }
    e.preventDefault()
    pasteAt(at, { text, html })
  }

  // ---- the mouse and the finger -----------------------------------------

  const stopListening = () => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
    window.removeEventListener("pointercancel", onCancel)
  }
  const endPress = () => {
    const p = press
    press = null
    stopListening()
    if (!p) return
    window.clearTimeout(p.timer)
    p.target?.removeEventListener("touchmove", onTouchMove)
    p.target?.removeEventListener("touchend", onTouchEnd)
    p.target?.removeEventListener("touchcancel", onTouchEnd)
    if (p.moved || p.ranging) {
      ranging(false)
      swallow.click = true
    }
  }
  function onMove(ev: PointerEvent) {
    const p = press
    if (!p || ev.pointerId !== p.id) return
    if (p.touch) {
      // A finger that moves before it has held long enough is scrolling.
      if (!p.ranging && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > SLOP_PX) endPress()
      return
    }
    if (!(ev.buttons & 1)) return endPress()
    const at = cellAt(ev.clientX, ev.clientY)
    if (!at) return
    if (!p.moved) {
      if (same(at, p.from)) return
      // A drag into a second cell: a range, not a selection of the first cell's text.
      p.moved = true
      ranging(true)
      s.focusCell(p.from.row, p.from.col, true)
    }
    reach(at)
  }
  // A finger's press ends where the touch does (onTouchEnd), not at a pointercancel.
  function onUp(ev: PointerEvent) {
    if (press && ev.pointerId === press.id && !press.ranging) endPress()
  }
  function onCancel(ev: PointerEvent) {
    if (press && ev.pointerId === press.id && !press.ranging) endPress()
  }

  const heldDown = () => {
    const p = press
    if (!p) return
    p.ranging = true
    held = true
    swallow = { click: true, menu: true }
    ranging(true)
    set({ anchor: p.from, focus: p.from })
    s.onHeld()
  }

  /**
   * A press on a cell: a mouse's starts a range there (a drag grows it); a
   * finger's starts one once held still. `heldFor`: how long a finger has
   * already held (a press the shell kept until the piece landed).
   */
  const onPointerDown = (e: PressStart, heldFor = 0) => {
    swallow = { click: false, menu: false }
    if (e.button !== 0) return
    const at = cellOf(e.target as Element)
    if (!at) return
    endPress()
    if (e.pointerType !== "touch" && e.shiftKey && s.range) return // Shift+click (onMouseDown)
    const touch = e.pointerType === "touch"
    const p: Press = { touch, target: null, id: e.pointerId, from: at, x: e.clientX, y: e.clientY, moved: false, ranging: false, timer: 0 }
    if (touch) {
      p.timer = window.setTimeout(heldDown, Math.max(0, LONG_PRESS_MS - heldFor))
      p.target = e.target as HTMLElement
      p.target.addEventListener("touchmove", onTouchMove, { passive: false })
      p.target.addEventListener("touchend", onTouchEnd)
      p.target.addEventListener("touchcancel", onTouchEnd)
    } else {
      held = false
      set({ anchor: at, focus: at })
    }
    press = p
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
  }
  /** A press made before the piece landed, kept by the shell: taken up as it would have been, unless it has ended (a click's or a tap's work is done). */
  const adopt = (p: EarlyPress) => {
    if (!p.ended) onPointerDown(p, performance.now() - p.at)
  }

  /** Shift+click grows the range to the cell clicked: the focus stays on its anchor, and no text is selected. */
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !e.shiftKey) return
    const at = cellOf(e.target as Element)
    if (!at || !s.range) return
    e.preventDefault()
    swallow.click = true
    reach(at)
  }

  /** The click a range's drag, Shift+click or long press ended with: taken, so it opens no cell. True when taken. */
  const onClick = (e: React.MouseEvent): boolean => {
    if (!swallow.click) return false
    swallow.click = false
    e.preventDefault()
    e.stopPropagation()
    return true
  }
  const onContextMenu = (e: React.MouseEvent) => {
    if (!swallow.menu && !press?.ranging) return
    swallow.menu = false
    e.preventDefault()
  }

  // A finger holding a range drags it: the page doesn't scroll under it, and
  // the range follows the finger. The grid's own touchmove isn't passive, so
  // the browser waits on it before scrolling (it does nothing unless a range
  // is held), and the finger's touches are cancelable wherever they go.
  function onTouchMove(e: TouchEvent) {
    if (!press?.ranging || seen.has(e)) return
    seen.add(e)
    if (e.cancelable) e.preventDefault()
    const t = e.touches[0]
    const at = t && cellAt(t.clientX, t.clientY)
    if (at) reach(at)
  }
  function onTouchEnd(e: TouchEvent) {
    if (seen.has(e) || !press?.touch) return
    seen.add(e)
    const was = press.ranging
    endPress()
    if (!was) return
    place()
    window.setTimeout(() => (swallow = { click: false, menu: false }), 400)
  }

  // ---- the fill handle ---------------------------------------------------

  const showFill = (to: Box | null) => {
    const o = s.overlay.current
    const el = s.fill.current
    if (!o || !el) return
    const p = to && rectOf(to)
    if (p) draw(el, p)
    o.dataset.filling = p ? "true" : "false"
  }
  const handle = {
    down: (e: React.PointerEvent<HTMLSpanElement>) => {
      const r = s.range
      if (!r || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      fill = { box: boxOf(r), to: null }
      ranging(true)
    },
    move: (e: React.PointerEvent<HTMLSpanElement>) => {
      const f = fill
      if (!f) return
      const row = rowAt(e.clientX, e.clientY)
      if (row === null) return
      const { box } = f
      f.to =
        row > box.bottom
          ? { top: box.bottom + 1, bottom: row, left: box.left, right: box.right, up: false }
          : row < box.top
            ? { top: row, bottom: box.top - 1, left: box.left, right: box.right, up: true }
            : null
      showFill(f.to)
    },
    up: () => {
      const f = fill
      fill = null
      showFill(null)
      ranging(false)
      const to = f?.to
      if (!f || !to) return
      const { box } = f
      void fillCells(s.writes(), { left: box.left, right: box.right, source: { top: box.top, bottom: box.bottom }, to: { top: to.top, bottom: to.bottom }, up: to.up })
    },
    cancel: () => {
      fill = null
      showFill(null)
      ranging(false)
    },
  }

  /** A write's block, selected once written (a paste's or a fill's whole box). */
  const select = (box: Box) => {
    held = false
    set({ anchor: { row: box.top, col: box.left }, focus: { row: box.bottom, col: box.right } })
  }

  /** What waited for the piece, by its cell's box (data-cell): a key, a copy, a paste. */
  const at = (cell: string) => posOf(cell)
  return {
    place,
    landed,
    onFocusIn,
    clear,
    onKey,
    keyFrom: (cell: string, e: KeyLike) => {
      const p = at(cell)
      return p ? keyAt(p, e) : false
    },
    onCopy,
    copyFrom: (cell: string): Copied | null => {
      const p = at(cell)
      return p ? copyAt(p) : null
    },
    onPaste,
    pasteInto: (cell: string, clip: Copied) => {
      const p = at(cell)
      if (p) pasteAt(p, clip)
    },
    onPointerDown: (e: React.PointerEvent) => onPointerDown(e),
    adopt,
    onMouseDown,
    onClick,
    onContextMenu,
    onTouchMove,
    onTouchEnd,
    handle,
    select,
    /** The grid goes: a press in hand ends. */
    dispose: endPress,
  }
}

export type RangeHandlers = ReturnType<typeof rangeHandlers>
