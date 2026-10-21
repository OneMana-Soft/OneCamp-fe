"use client"

import { useCallback } from "react"
import { useDispatch, useSelector } from "react-redux"
import { openInSplit, selectSplitOn } from "@/store/slice/splitActions"
import type { Pane } from "@/lib/split"

// Opening beside, apart from the shell's wiring (hooks/useSplitView).

const NONE: Pane[] = []
/** The panes beside, or none before the shell adds split view's state. */
export const selectPanes = (s: { split?: { panes: Pane[] } }) => s.split?.panes ?? NONE

/** Where a view's keyboard focus goes: its composer or editor, else the view itself. */
export function focusView(view: number) {
  const el = document.querySelector<HTMLElement>(`[data-split-view="${view}"]`)
  if (!el) return
  const target = el.querySelector<HTMLElement>('[contenteditable="true"], textarea:not([disabled]), input:not([type="hidden"]):not([disabled])')
  ;(target ?? el).focus({ preventScroll: true })
}

/**
 * Opens something beside the page on a plain click (the call buttons do this,
 * so a call runs beside the conversation). Returns false, leaving the click
 * alone, for a modified click (a new tab) or where the shell shows no views
 * side by side (selectSplitOn: a phone, a tablet), so the page opens.
 */
export function useOpenBeside() {
  const dispatch = useDispatch()
  const on = useSelector(selectSplitOn)
  return useCallback(
    (pane: Pane, e?: { button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault?: () => void }) => {
      if (!on || (e && ((e.button !== undefined && e.button !== 0) || e.metaKey || e.ctrlKey || e.shiftKey))) return false
      e?.preventDefault?.()
      dispatch(openInSplit(pane))
      return true
    },
    [on, dispatch],
  )
}
