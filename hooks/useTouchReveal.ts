"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type React from "react"

/** Where a tool's own menu or dialog opens: a tap or Escape there keeps the tools out. */
const TOOL_LAYERS = "[data-radix-popper-content-wrapper], [role='menu'], [role='dialog'], [role='listbox']"

function keyboardFocus(el: EventTarget | null): boolean {
  try {
    return el instanceof Element && el.matches(":focus-visible")
  } catch {
    return false
  }
}

/**
 * A row's hover tools, on a screen that cannot hover (INTERACTION_SPEC.md §6.5):
 * the one reveal, for HubRow's rows (hostProps and toggleProps) and for a
 * message (onPointerUp). The row is a reveal host (data-reveal, "tap" in a
 * dense list) and its tools carry data-tools (app/interaction.css).
 *
 * - `hostProps` go on the row: it says data-revealed while the tools show,
 *   keyboard focus in it shows them and keeps them while Tab walks through
 *   them, and focus leaving it (not into a tool's own menu) puts them away.
 * - `toggleProps` go on the row's Actions button (the ⋯ a touch screen shows):
 *   a tap shows the tools, another hides them.
 * - `onPointerUp` is the older way, for a message: a tap on the row itself
 *   shows them, unless it lands on a link, a button or a field.
 *
 * A tap anywhere else, or Escape, puts them away; only a touch or a pen
 * reveals by tapping, a mouse keeps hover.
 */
export function useTouchReveal() {
  const [revealed, setRevealed] = useState(false)
  const rowRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!revealed) return
    const away = (e: PointerEvent) => {
      const at = e.target as Element | null
      if (rowRef.current?.contains(at) || at?.closest?.(TOOL_LAYERS)) return
      setRevealed(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as Element | null)?.closest?.(TOOL_LAYERS)) setRevealed(false)
    }
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", escape)
    }
  }, [revealed])

  const onPointerUp = useCallback((e: React.PointerEvent<Element>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return
    if ((e.target as Element).closest?.("a, button, input, textarea, select, [contenteditable='true'], [role='button'], [role='menuitem']")) return
    rowRef.current = e.currentTarget
    setRevealed(true)
  }, [])

  const onFocus = useCallback((e: React.FocusEvent<Element>) => {
    if (!keyboardFocus(e.target)) return
    rowRef.current = e.currentTarget
    setRevealed(true)
  }, [])

  const onBlur = useCallback((e: React.FocusEvent<Element>) => {
    const to = e.relatedTarget as Element | null
    if (to && !e.currentTarget.contains(to) && !to.closest(TOOL_LAYERS)) setRevealed(false)
  }, [])

  const onToggle = useCallback((e: React.MouseEvent<Element>) => {
    e.preventDefault()
    e.stopPropagation()
    rowRef.current = e.currentTarget.closest("[data-reveal]") ?? e.currentTarget
    setRevealed((open) => !open)
  }, [])

  return {
    revealed,
    onPointerUp,
    hostProps: { "data-revealed": revealed ? "" : undefined, onFocus, onBlur },
    toggleProps: { "aria-expanded": revealed, onClick: onToggle },
  }
}
