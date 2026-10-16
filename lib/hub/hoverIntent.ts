"use client"

/**
 * Hover intent (hub.md P1): a card opens after the pointer rests 450ms on
 * what it is about, and closes 150ms after the pointer leaves both the trigger
 * and the card, so moving from a name into its card does not drop it. Never
 * on touch (a tap is a click there). The caller still opens it at once on a
 * click, and from the keyboard on Enter (or the key a trigger that opens on
 * Enter gives it: a task's chip shows its card on Space).
 */
import { useEffect, useMemo, useRef } from "react"

export const HOVER_OPEN_MS = 450
export const HOVER_CLOSE_MS = 150

// One hover card at a time, app-wide: who may close it, and whether the
// pointer is inside the card itself.
let closeCurrent: (() => void) | null = null
let insideCard = false
let pendingClose: ReturnType<typeof setTimeout> | null = null

function cancelClose() {
  if (pendingClose) clearTimeout(pendingClose)
  pendingClose = null
}

function scheduleClose() {
  cancelClose()
  pendingClose = setTimeout(() => {
    pendingClose = null
    if (insideCard) return
    const close = closeCurrent
    closeCurrent = null
    close?.()
  }, HOVER_CLOSE_MS)
}

/**
 * For the card a hover opened: spread on its content, so the pointer resting
 * in it keeps it open and leaving it starts the grace. A card opened by a
 * click is not closed by these.
 */
export const hoverCardProps = {
  onPointerEnter: () => {
    insideCard = true
    cancelClose()
  },
  onPointerLeave: () => {
    insideCard = false
    if (closeCurrent) scheduleClose()
  },
}

/** Forgets the hover-opened card, when it was closed or replaced some other way. */
export function forgetHoverCard(): void {
  cancelClose()
  closeCurrent = null
  insideCard = false
}

// The trigger the pointer is resting on, and its open timer.
let restTimer: ReturnType<typeof setTimeout> | null = null
let restingOn: Element | null = null

/** The pointer came to rest on `el`: open after HOVER_OPEN_MS unless it moves off. */
export function hoverEnter(el: HTMLElement, open: (el: HTMLElement) => void, close: () => void): void {
  cancelClose()
  if (restTimer) clearTimeout(restTimer)
  restingOn = el
  restTimer = setTimeout(() => {
    restTimer = null
    if (restingOn !== el) return
    open(el)
    closeCurrent = close
  }, HOVER_OPEN_MS)
}

/** The pointer left the trigger: no opening, and a card it opened closes after the grace. */
export function hoverLeave(): void {
  if (restTimer) clearTimeout(restTimer)
  restTimer = null
  restingOn = null
  if (closeCurrent) scheduleClose()
}

export interface HoverIntentProps {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
}

/**
 * `open(el)` shows the card against `el`; `close()` puts it away. Returns the
 * handlers to spread on the trigger. With `enabled` false it returns handlers
 * that do nothing, so a caller can spread them unconditionally. `key` is the
 * key that opens it from the keyboard: Enter, unless Enter does something else
 * there.
 */
export function useHoverIntent({ open, close, enabled = true, key = "Enter" }: { open: (el: HTMLElement) => void; close: () => void; enabled?: boolean; key?: string }): HoverIntentProps {
  const latest = useRef({ open, close })
  latest.current = { open, close }
  const mine = useRef<HTMLElement | null>(null)
  // A trigger that unmounts mid-rest must not open a card later.
  useEffect(() => () => {
    if (mine.current && restingOn === mine.current) hoverLeave()
  }, [])

  return useMemo<HoverIntentProps>(
    () => ({
      onPointerEnter: (e) => {
        if (!enabled || e.pointerType === "touch") return
        mine.current = e.currentTarget
        hoverEnter(e.currentTarget, (el) => latest.current.open(el), () => latest.current.close())
      },
      onPointerLeave: (e) => {
        if (!enabled || e.pointerType === "touch") return
        hoverLeave()
      },
      onKeyDown: (e) => {
        if (!enabled || e.key !== key) return
        hoverLeave()
        // Opened on purpose: leaving it does not close it.
        forgetHoverCard()
        latest.current.open(e.currentTarget)
      },
    }),
    [enabled, key],
  )
}
