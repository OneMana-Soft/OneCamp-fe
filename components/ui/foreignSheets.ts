"use client"

import * as React from "react"

import type { SheetDetent } from "@/components/ui/drawer"
import "./foreignSheets.css"

/**
 * A third-party overlay that is the app's sheet where overlays are sheets
 * (useSheetMode: a phone): a library's menu, popover, dialog or sidebar,
 * whose DOM the library renders, so it can't go through the shared Drawer.
 * It keeps its own DOM and behaviour (opening, closing, focus, Escape); only
 * its root is marked, and foreignSheets.css lays the marked root on the
 * bottom edge as the Drawer lays a sheet: full width, top corners, grabber,
 * scrim, the home-indicator strip, the keyboard's rule (app/phone.css C5c),
 * and its row of actions pinned at its foot.
 */
export interface ForeignSheet {
  /** What it is, named in guards and failures. */
  name: string
  /** Its root's classes: an element with any one of them, inside the scope, is the sheet. */
  classes: readonly string[]
  /** The positioned box around the root, when a positioning library wraps it (a Radix popper's wrapper): that box docks. */
  box?: string
  /** How tall it may be: the Drawer's detents ("menu" has no grabber). */
  detent: SheetDetent
  /** Its row of actions, pinned at its foot. */
  actions?: readonly string[]
}

const SHEET = "data-foreign-sheet"
const ACTIONS = "data-foreign-sheet-actions"
const LIFT = "data-foreign-sheet-lift"
/** The height a sheet keeps free under what it holds, for its pinned row of actions. */
const RESERVE = "--foreign-sheet-actions"

/**
 * Marks each overlay of `sheets` that is, or comes to be, under `root` and
 * inside `scope` (the library's own root class, so a class name it shares
 * with the app never matches); returns the undo. It only sets attributes on
 * nodes the library rendered, and never adds one to its tree. A mark is set
 * in the observer's microtask, before the overlay is first painted. A root
 * inside a docked sheet is that sheet's (a menu's list a popover holds), never
 * a sheet of its own, whichever mounts first.
 *
 * A z-index rises only within its layer, and a library may hold its overlays
 * in a layer of its own that the page's chrome covers (Excalidraw's top bar:
 * z-index 4, under a board's buttons at 20). So every box between a docked
 * sheet and `root` with a z-index of its own under the sheet's (the modal
 * layer, foreignSheets.css) is marked as well, and foreignSheets.css lifts it
 * to the sheet's layer while it holds one. A box already above it (a
 * library's dialog layer) is left where it is.
 *
 * A sheet's row of actions stands on the sheet's foot, out of what scrolls
 * (foreignSheets.css), so the sheet keeps the row's height free under what it
 * holds: measured as it changes, set on the sheet as --foreign-sheet-actions,
 * and taken off when the row goes.
 */
export function dockForeignSheets(root: Element, scope: string, sheets: readonly ForeignSheet[]): () => void {
  const roots = sheets.flatMap((s) => s.classes.map((c) => ({ sel: `.${c}`, s })))
  const anyRoot = roots.map((r) => r.sel).join(",")
  const anyActions = sheets.flatMap((s) => s.actions ?? []).map((c) => `.${c}`).join(",")
  const within = (node: Element, sel: string) => (node.matches(sel) ? [node, ...node.querySelectorAll(sel)] : [...node.querySelectorAll(sel)])
  const zOf = (el: Element) => {
    const z = getComputedStyle(el).zIndex
    return /^-?\d+$/.test(z) ? Number(z) : null
  }
  // Each pinned row of actions, and the sheet that keeps its height free.
  const pinned = new Map<Element, HTMLElement>()
  let sizes: ResizeObserver | null = null
  const letGo = (row: Element, sheet: HTMLElement) => {
    sizes?.unobserve(row)
    pinned.delete(row)
    // A row the library drew again in its place keeps the sheet's room.
    if (![...pinned.values()].includes(sheet)) sheet.style.removeProperty(RESERVE)
  }
  const measured: ResizeObserverCallback = (entries) => {
    for (const { target, borderBoxSize } of entries) {
      const sheet = pinned.get(target)
      if (!sheet) continue
      if (!target.isConnected || !sheet.contains(target)) letGo(target, sheet)
      else sheet.style.setProperty(RESERVE, `${borderBoxSize?.[0]?.blockSize ?? target.getBoundingClientRect().height}px`)
    }
  }
  const pin = (row: Element, sheet: HTMLElement) => {
    for (const [gone, held] of pinned) if (!gone.isConnected) letGo(gone, held)
    if (pinned.has(row) || typeof ResizeObserver === "undefined") return
    sizes ??= new ResizeObserver(measured)
    pinned.set(row, sheet)
    sizes.observe(row)
  }
  const mark = (node: Element) => {
    for (const el of within(node, anyRoot)) {
      const hit = el.closest(scope) ? roots.find((r) => el.matches(r.sel)) : undefined
      const sheet = hit && (hit.s.box ? el.closest(hit.s.box) : el)
      if (!hit || !sheet || sheet.parentElement?.closest(`[${SHEET}]`)) continue
      for (const inner of sheet.querySelectorAll(`[${SHEET}]`)) inner.removeAttribute(SHEET)
      sheet.setAttribute(SHEET, hit.s.detent)
      const layer = zOf(sheet)
      for (let up = sheet.parentElement; up && up !== root; up = up.parentElement) {
        const z = zOf(up)
        if (z !== null && (layer === null || z < layer)) up.setAttribute(LIFT, "")
      }
    }
    if (anyActions)
      for (const el of within(node, anyActions)) {
        const sheet = el.closest<HTMLElement>(`[${SHEET}]`)
        if (!sheet) continue
        el.setAttribute(ACTIONS, "")
        pin(el, sheet)
      }
  }
  mark(root)
  const seen = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) mark(n as Element)
  })
  seen.observe(root, { childList: true, subtree: true })
  return () => {
    seen.disconnect()
    sizes?.disconnect()
    for (const sheet of pinned.values()) sheet.style.removeProperty(RESERVE)
    pinned.clear()
    for (const el of root.querySelectorAll(`[${SHEET}],[${ACTIONS}],[${LIFT}]`)) for (const name of [SHEET, ACTIONS, LIFT]) el.removeAttribute(name)
  }
}

/**
 * While `on` (the page's useSheetMode, which alone decides), the overlays of
 * `sheets` inside `scope` are the app's sheets, wherever the library mounts
 * them (a dialog's portal on the body too).
 */
export function useForeignSheets(on: boolean, scope: string, sheets: readonly ForeignSheet[]): void {
  React.useEffect(() => (on ? dockForeignSheets(document.body, scope, sheets) : undefined), [on, scope, sheets])
}
