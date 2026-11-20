"use client"

import { useEffect, type RefObject } from "react"
import { useDispatch, useStore } from "react-redux"
import type { RootState } from "@/store/store"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { goArmed, isTyping } from "@/lib/goKeys"
import { LIST_FIELDS, listKey, rangeOf, stepAcross, stepIn, type ListField } from "@/lib/listKeys"
import { onEscape } from "@/lib/keys/onEscape"
import { afterFocus, keysDrive, keysRelease, listNavIn, revealRow } from "@/lib/ui/listNav"
import type { SelectionStore } from "@/lib/listSelection"

const ITEM = "[data-task-id]"

/**
 * J and K (or the arrows) move through a list's tasks, ← and → across a
 * board's columns, Enter opens, X selects, and S, A, T or P (or Shift+C on a
 * backlog) change a field of the selection (onEdit), of the fields the list
 * offers. Tasks are read from the page ([data-task-id] rows and cards,
 * [data-column] columns), so it works on whatever is drawn: a page
 * of a table, a board that adds cards as it scrolls, folded columns passed
 * over. Keys count when they are the list's: typed in it, on its view, on the
 * page with its view active (split view), or in the panel showing one of its
 * tasks, where J and K then walk through tasks with the panel following.
 */
export function useListKeyboard({
  containerRef,
  store,
  enabled,
  onEdit,
  fields = LIST_FIELDS,
}: {
  containerRef: RefObject<HTMLElement | null>
  store: SelectionStore
  enabled: boolean
  onEdit?: (field: ListField) => void
  /** The fields its selection's bar changes; another field's key is left alone. A constant, so the keys aren't bound anew. */
  fields?: readonly ListField[]
}) {
  const dispatch = useDispatch()
  const app = useStore<RootState>()
  usePaintedPlace(containerRef, store)
  useEffect(() => {
    const box = containerRef.current
    if (!enabled || !box) return
    const idsIn = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>(ITEM), (el) => el.dataset.taskId ?? "").filter(Boolean)
    const elOf = (id: string) => box.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
    // A windowed list draws only some rows: its order and reveal are its own (lib/ui/listNav); else the page's rows.
    const nav = () => listNavIn(box)
    const order = () => nav()?.order() ?? idsIn(box)
    const has = (id: string) => nav()?.has(id) ?? elOf(id) !== null
    const itemOf = (t: EventTarget | null) => (t instanceof Element && box.contains(t) ? (t.closest<HTMLElement>(ITEM)?.dataset.taskId ?? null) : null)
    const viewOf = (el: Element) => el.closest("[data-split-view]")?.getAttribute("data-split-view") ?? null
    const activeView = () => String(app.getState().split?.active ?? -1)
    const panelTask = () => {
      const p = app.getState().rightPanel.rightPanelState
      return p.isOpen && p.data.taskUUID ? p.data.taskUUID : null
    }

    // Out of sight (a side view set aside by Focus, a tab not shown): not this list's keys.
    const hidden = () => !box.isConnected || (typeof box.checkVisibility === "function" && !box.checkVisibility())

    const ours = (t: EventTarget | null) => {
      if (hidden()) return false
      const el = t instanceof Element ? t : null
      if (el && box.contains(el)) return true
      const mine = viewOf(box) === activeView()
      if (!el || el === document.body || el === document.documentElement) return mine
      // Menus, dialogs and pickers keep their own keys.
      if (el.closest("[role=dialog],[role=menu],[role=listbox],[role=combobox]")) return false
      if (el.closest("[data-right-panel]")) {
        const open = panelTask()
        return mine && open !== null && has(open)
      }
      return viewOf(el) !== null && viewOf(el) === viewOf(box)
    }

    // Focused and brought into view with nothing of the page's layout read in the key (lib/ui/listNav revealRow).
    const reveal = (id: string) => {
      const list = nav()
      if (list) return list.reveal(id)
      const el = elOf(id)
      if (el) revealRow(el, el.hasAttribute("tabindex"))
    }

    const go = (id: string | null, extend: boolean) => {
      if (!id) return
      const s = store.get()
      // The focus first, while nothing waits to be styled, so the key's light and focus are styled once, in the frame.
      reveal(id)
      // The keys drive: a resting pointer's hover holds still till the pointer moves (lib/ui/listNav keysDrive).
      keysDrive(box)
      if (extend) {
        const from = s.anchor ?? s.highlighted ?? id
        store.addRun(rangeOf(order(), from, id), from)
      }
      store.highlight(id)
      // A task open in the panel follows the highlight.
      const open = panelTask()
      if (open && open !== id && has(open)) dispatch(openRightPanel({ taskUUID: id }))
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target as Element | null) || goArmed()) return
      const action = listKey(e)
      if (!action || !ours(e.target)) return
      const s = store.get()
      const current = (s.highlighted && has(s.highlighted) ? s.highlighted : null) ?? itemOf(e.target)
      switch (action.type) {
        case "move": {
          // On a board, up and down stay in the column; ← and → cross.
          const column = current ? elOf(current)?.closest("[data-column]") : null
          const next = stepIn(column && box.contains(column) ? idsIn(column) : order(), current, action.by)
          if (!next) return
          e.preventDefault()
          go(next, action.extend)
          return
        }
        case "column": {
          const columns = Array.from(box.querySelectorAll("[data-column]"), (c) => idsIn(c))
          // A list has no columns: the arrows stay the page's.
          if (columns.length === 0) return
          e.preventDefault()
          go(stepAcross(columns, current, action.by), false)
          return
        }
        case "open":
          if (!current) return
          e.preventDefault()
          dispatch(openRightPanel({ taskUUID: current }))
          return
        case "toggle":
          if (!current || e.repeat) return
          e.preventDefault()
          store.toggle(current)
          return
        case "edit":
          if (!onEdit || e.repeat || !fields.includes(action.field)) return
          if (s.selected.size === 0) {
            if (!current) return
            store.toggle(current)
          }
          e.preventDefault()
          onEdit(action.field)
          return
      }
    }

    // A click or a Tab onto a task puts the highlight there. Ctrl/⌘-click picks
    // a task and Shift-click a run, instead of opening it. A key's focus lights
    // its row once the focus is done (afterFocus), as the key goes on to.
    const onFocusIn = (e: FocusEvent) => {
      const id = itemOf(e.target)
      if (id) afterFocus(() => store.highlight(id))
    }
    const onMouseDown = (e: MouseEvent) => {
      // Shift-click would otherwise select the page's text up to here.
      if (e.shiftKey && itemOf(e.target)) e.preventDefault()
    }
    const onClick = (e: MouseEvent) => {
      const id = itemOf(e.target)
      if (!id) return
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        const s = store.get()
        if (e.shiftKey) {
          const from = s.anchor ?? s.highlighted ?? id
          store.addRun(rangeOf(order(), from, id), from)
        } else store.toggle(id)
      }
      store.highlight(id)
    }

    // A task the panel opens on its own (its previous and next, a link in it)
    // takes the highlight when it's one of this list's, so J and K go on from
    // it and one row reads as the panel's. It's brought into view; focus stays
    // where the person is.
    let shown = panelTask()
    const unfollow = app.subscribe(() => {
      const open = panelTask()
      if (open === shown) return
      shown = open
      if (!open || hidden() || !has(open) || store.get().highlighted === open) return
      store.highlight(open)
      const list = nav()
      const el = list ? null : elOf(open)
      if (list) list.reveal(open, false)
      else if (el) revealRow(el, false)
    })

    // Esc clears the selection; with none, it lets go of the highlight and passes the press on.
    const stopEscape = onEscape("page", (e) => {
      if (isTyping(e.target as Element | null) || goArmed() || !ours(e.target)) return false
      const selected = store.get().selected.size > 0
      if (selected) store.clear()
      else store.highlight(null)
      return selected
    })
    document.addEventListener("keydown", onKey)
    box.addEventListener("focusin", onFocusIn)
    box.addEventListener("mousedown", onMouseDown, true)
    box.addEventListener("click", onClick, true)
    return () => {
      unfollow()
      stopEscape()
      document.removeEventListener("keydown", onKey)
      box.removeEventListener("focusin", onFocusIn)
      box.removeEventListener("mousedown", onMouseDown, true)
      box.removeEventListener("click", onClick, true)
      // A list that goes while the keys marked it is let go (lib/ui/listNav keysRelease); one that stays while its keys
      // stop (a drag pauses them) keeps the mark, as the pointer is still where it was.
      if (!box.isConnected) keysRelease(box)
    }
  }, [enabled, containerRef, store, onEdit, fields, dispatch, app])
}

/** A row's light select box (GroupedTaskList), drawn while no Checkbox is. */
const LIGHT_BOX = "[data-row-box]"

/**
 * The keys' place, painted with no render (FLUIDITY-24): whatever draws the
 * highlighted task carries data-highlighted="true", also as rows land later.
 * Rows style it with CSS (lit:). Only [data-task-id]: menus have their own.
 * The row that holds the focus has its light box as Tab's stop (tabIndex 0,
 * as the Checkbox it drew there had); every other light box keeps -1.
 */
function usePaintedPlace(containerRef: RefObject<HTMLElement | null>, store: SelectionStore) {
  useEffect(() => {
    const box = containerRef.current
    if (!box) return
    const reach = (at: EventTarget | null) => {
      const row = at instanceof Element && box.contains(at) ? at.closest(ITEM) : null
      for (const el of box.querySelectorAll<HTMLElement>(`${LIGHT_BOX}[tabindex="0"]`)) if (el.closest(ITEM) !== row) el.tabIndex = -1
      if (row) for (const el of row.querySelectorAll<HTMLElement>(`${LIGHT_BOX}[tabindex="-1"]`)) if (el.closest(ITEM) === row) el.tabIndex = 0
    }
    const paint = () => {
      const id = store.get().highlighted
      for (const el of box.querySelectorAll<HTMLElement>(`${ITEM}[data-highlighted]`)) if (el.dataset.taskId !== id) el.removeAttribute("data-highlighted")
      if (id) for (const el of box.querySelectorAll<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]:not([data-highlighted])`)) el.setAttribute("data-highlighted", "true")
    }
    paint()
    reach(document.activeElement)
    // Written once a key's focus is done (lib/ui/listNav afterFocus), so it restyles nothing within it; at once for a click's or Tab's.
    const onFocusIn = (e: FocusEvent) => afterFocus(() => reach(e.target))
    const onFocusOut = (e: FocusEvent) => afterFocus(() => reach(e.relatedTarget))
    box.addEventListener("focusin", onFocusIn)
    box.addEventListener("focusout", onFocusOut)
    let was = store.get().highlighted
    const unsubscribe = store.subscribe(() => {
      if (store.get().highlighted === was) return
      was = store.get().highlighted
      paint()
    })
    // Rows (and light boxes) that land later, painted before the screen is.
    const landed = new MutationObserver(() => {
      paint()
      reach(document.activeElement)
    })
    landed.observe(box, { childList: true, subtree: true, attributeFilter: ["data-task-id"] })
    return () => {
      unsubscribe()
      landed.disconnect()
      box.removeEventListener("focusin", onFocusIn)
      box.removeEventListener("focusout", onFocusOut)
    }
  }, [containerRef, store])
}
