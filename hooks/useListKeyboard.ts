"use client"

import { useEffect, type RefObject } from "react"
import { useDispatch, useStore } from "react-redux"
import type { RootState } from "@/store/store"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { goArmed, isTyping } from "@/lib/goKeys"
import { listKey, rangeOf, stepAcross, stepIn, type ListField } from "@/lib/listKeys"
import type { SelectionStore } from "@/lib/listSelection"

const ITEM = "[data-task-id]"

/**
 * J and K (or the arrows) move through a list's tasks, ← and → across a
 * board's columns, Enter opens, X selects, and S, A, T or P change a field of
 * the selection (onEdit). Tasks are read from the page ([data-task-id] rows
 * and cards, [data-column] columns), so it works on whatever is drawn: a page
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
}: {
  containerRef: RefObject<HTMLElement | null>
  store: SelectionStore
  enabled: boolean
  onEdit?: (field: ListField) => void
}) {
  const dispatch = useDispatch()
  const app = useStore<RootState>()
  useEffect(() => {
    const box = containerRef.current
    if (!enabled || !box) return
    const idsIn = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>(ITEM), (el) => el.dataset.taskId ?? "").filter(Boolean)
    const elOf = (id: string) => box.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
    const itemOf = (t: EventTarget | null) => (t instanceof Element && box.contains(t) ? (t.closest<HTMLElement>(ITEM)?.dataset.taskId ?? null) : null)
    const viewOf = (el: Element) => el.closest("[data-split-view]")?.getAttribute("data-split-view") ?? null
    const activeView = () => String(app.getState().split.active)
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
        return mine && open !== null && elOf(open) !== null
      }
      return viewOf(el) !== null && viewOf(el) === viewOf(box)
    }

    const reveal = (id: string) => {
      const el = elOf(id)
      if (!el) return
      el.scrollIntoView({ block: "nearest", inline: "nearest" })
      if (el.hasAttribute("tabindex")) el.focus({ preventScroll: true })
    }

    const go = (id: string | null, extend: boolean) => {
      if (!id) return
      const s = store.get()
      if (extend) {
        const from = s.anchor ?? s.highlighted ?? id
        store.addRun(rangeOf(idsIn(box), from, id), from)
      }
      store.highlight(id)
      reveal(id)
      // A task open in the panel follows the highlight.
      const open = panelTask()
      if (open && open !== id && elOf(open)) dispatch(openRightPanel({ taskUUID: id }))
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target as Element | null) || goArmed()) return
      const action = listKey(e)
      if (!action || !ours(e.target)) return
      const s = store.get()
      const current = (s.highlighted && elOf(s.highlighted) ? s.highlighted : null) ?? itemOf(e.target)
      switch (action.type) {
        case "move": {
          // On a board, up and down stay in the column; ← and → cross.
          const column = current ? elOf(current)?.closest("[data-column]") : null
          const next = stepIn(idsIn(column && box.contains(column) ? column : box), current, action.by)
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
        case "clear":
          if (s.selected.size > 0) {
            e.preventDefault()
            store.clear()
          } else store.highlight(null)
          return
        case "edit":
          if (!onEdit || e.repeat) return
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
    // a task and Shift-click a run, instead of opening it.
    const onFocusIn = (e: FocusEvent) => {
      const id = itemOf(e.target)
      if (id) store.highlight(id)
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
          store.addRun(rangeOf(idsIn(box), from, id), from)
        } else store.toggle(id)
      }
      store.highlight(id)
    }

    document.addEventListener("keydown", onKey)
    box.addEventListener("focusin", onFocusIn)
    box.addEventListener("mousedown", onMouseDown, true)
    box.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      box.removeEventListener("focusin", onFocusIn)
      box.removeEventListener("mousedown", onMouseDown, true)
      box.removeEventListener("click", onClick, true)
    }
  }, [enabled, containerRef, store, onEdit, dispatch, app])
}
