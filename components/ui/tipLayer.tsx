"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { onEscape } from "@/lib/keys/onEscape"

/**
 * The app's light labels (data-tip): one chip, drawn at the page's end, for
 * every control that names itself with data-tip. A list of 200 rows carries
 * no tooltip components (work.md W01), and a message's toolbar none either
 * (actionTip.ts), as when CSS drew each label as the control's ::after; but a
 * ::after sits inside whatever clips the control, and was cut by it (18 Oct
 * 2026, measured in Chromium, Firefox and WebKit): a board column's status
 * label by the board's scroller, a card's priority by the card, the top row's
 * check by the list, the composer's first tool by the conversation. Drawn
 * here, nothing around a control clips its label, and the label keeps to the
 * window, flipping when there is no room on its side.
 *
 * Where it sits and how long it waits come from the control's classes, the
 * markers the call sites already wear: work-tip (above, after 400 ms), or
 * actionTip.ts's (below after 200 ms, tip-above, tip-end, tip-start,
 * tip-wide, tip-time). Under the pointer only (a finger has no hover); with
 * keyboard focus too, except work-tip's, as before; a time label (tip-time)
 * also while its row's keyboard stop has the focus. It hides on a press, a
 * scroll, Escape, and while the control's own menu is open. It is for sight:
 * the control's accessible name is its own (aria-label).
 */

const SEL = '[data-tip]:not([data-tip=""])'
const GAP = 6
const EDGE = 8

export type Side = "top" | "bottom"
export type Align = "center" | "start" | "end"
export interface Placement {
  side: Side
  align: Align
  wide: boolean
}

export function placementOf(el: Element): Placement {
  const c = el.classList
  return {
    side: c.contains("work-tip") || c.contains("tip-above") ? "top" : "bottom",
    align: c.contains("tip-end") ? "end" : c.contains("tip-start") ? "start" : "center",
    wide: c.contains("tip-wide"),
  }
}

export const delayOf = (el: Element) => (el.classList.contains("work-tip") ? 400 : 200)

/** Its own menu is open: the label would cover it. */
const busy = (el: Element) => el.getAttribute("data-state") === "open" || el.getAttribute("aria-expanded") === "true"

/** Where the chip goes: on its side, flipped when the window has no room there, and held 8 px inside the window. */
export function positionTip(anchor: { left: number; top: number; right: number; bottom: number }, size: { width: number; height: number }, p: Placement, view: { width: number; height: number }) {
  const w = size.width
  const h = size.height
  let left = p.align === "start" ? anchor.left : p.align === "end" ? anchor.right - w : (anchor.left + anchor.right) / 2 - w / 2
  left = Math.max(EDGE, Math.min(left, view.width - EDGE - w))
  let side = p.side
  if (side === "top" && anchor.top - GAP - h < EDGE) side = "bottom"
  else if (side === "bottom" && anchor.bottom + GAP + h > view.height - EDGE && anchor.top - GAP - h >= EDGE) side = "top"
  const top = side === "top" ? anchor.top - GAP - h : anchor.bottom + GAP
  return { left, top, side }
}

/** A time label shown by its row's keyboard stop (actionTip.ts TIME_TIP): the name line holding the focus, or the gutter that has it. */
function timeTipFor(focused: Element): Element | null {
  const group = focused.closest(".group\\/name") ?? (focused.matches(".group\\/gutter") ? focused : null)
  return group?.querySelector(`.tip-time${SEL}`) ?? null
}

interface Shown extends Placement {
  text: string
  anchor: DOMRect
}

export default function TipLayer() {
  const [tip, setTip] = useState<Shown | null>(null)
  const current = useRef<Element | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current)
      current.current = null
      setTip(null)
    }
    const show = (el: Element, delay: number) => {
      window.clearTimeout(timer.current)
      current.current = el
      const open = () => {
        if (current.current !== el || !el.isConnected || busy(el)) return
        const text = el.getAttribute("data-tip")
        if (text) setTip({ text, anchor: el.getBoundingClientRect(), ...placementOf(el) })
      }
      if (delay > 0) timer.current = window.setTimeout(open, delay)
      else open()
    }
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return
      const el = (e.target as Element | null)?.closest?.(SEL) ?? null
      if (el === current.current) return
      hide()
      if (el && !busy(el)) show(el, delayOf(el))
    }
    const out = (e: PointerEvent) => {
      const el = current.current
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) hide()
    }
    const focus = (e: FocusEvent) => {
      const t = e.target as Element | null
      if (!t?.matches?.(":focus-visible")) return
      const el = t.matches(SEL) && !t.classList.contains("work-tip") ? t : timeTipFor(t)
      if (el && !busy(el)) show(el, 0)
    }
    // Escape hides it and goes on (lib/keys/escape): a label is no layer of the page's.
    const offEscape = onEscape("overlay", () => {
      hide()
      return false
    })
    const opts = { capture: true, passive: true } as const
    document.addEventListener("pointerover", over, opts)
    document.addEventListener("pointerout", out, opts)
    document.addEventListener("pointerdown", hide, opts)
    document.addEventListener("focusin", focus, opts)
    document.addEventListener("focusout", hide, opts)
    window.addEventListener("scroll", hide, opts)
    window.addEventListener("blur", hide)
    return () => {
      window.clearTimeout(timer.current)
      document.removeEventListener("pointerover", over, opts)
      document.removeEventListener("pointerout", out, opts)
      document.removeEventListener("pointerdown", hide, opts)
      document.removeEventListener("focusin", focus, opts)
      document.removeEventListener("focusout", hide, opts)
      offEscape()
      window.removeEventListener("scroll", hide, opts)
      window.removeEventListener("blur", hide)
    }
  }, [])

  return tip ? createPortal(<TipChip tip={tip} />, document.body) : null
}

function TipChip({ tip }: { tip: Shown }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number; side: Side } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAt(positionTip(tip.anchor, { width: r.width, height: r.height }, tip, { width: window.innerWidth, height: window.innerHeight }))
  }, [tip])
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-tip-layer=""
      data-side={at?.side ?? tip.side}
      className="tip-chip"
      data-wide={tip.wide || undefined}
      style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden" }}
    >
      {tip.text}
    </div>
  )
}
