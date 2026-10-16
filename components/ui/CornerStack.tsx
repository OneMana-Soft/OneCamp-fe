"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * The two bottom corners (design v3, shell T4). Floating cards used to place
 * themselves, each with its own offset maths: the demo prompt moved by a
 * hard-coded 30vw when the right panel opened, the PWA prompt sat on the
 * devtools layer, the keyboard tip at 16px from the window and the timer at
 * the middle. Now each is a CornerCard, and one host per side owns where they
 * go: 16px inside the sheet's edge, 8px apart, on the corner layer (under
 * menus, popovers and dialogs; app/globals.css lists every layer).
 *
 *   left   the running timer, the keyboard tip, the PWA prompt
 *   right  the demo prompt and the slash-command cards, with toasts above
 *
 * The shell says where the sheet's edges are, on <html>: --shell-left-inset
 * (the sidebar and its gutter) and --shell-right-inset (8px, or the right
 * panel's width and its seams while it is open). Read from CSS, so a card
 * never measures the panel, and nothing here re-renders when it moves.
 *
 * Both stacks sit a composer's height up from the bottom (--corner-lift): at
 * the bottom edge, where every message box in the product ends, the demo
 * prompt once covered the composer's send button. On a phone they sit above
 * the tab bar the same way, between 16px gutters.
 *
 * The right host's top is published as --corner-right-h, so the toasts'
 * viewport stacks above whatever this corner holds.
 */

export type CornerSide = "left" | "right"

const HOST_ATTR = "data-corner-stack"

function ensureHost(side: CornerSide): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`[${HOST_ATTR}="${side}"]`)
  if (existing) return existing
  const host = document.createElement("div")
  host.setAttribute(HOST_ATTR, side)
  host.className = `corner-stack corner-stack-${side}`
  document.body.appendChild(host)
  if (side === "right") followRightHost(host)
  return host
}

/**
 * Keeps --corner-right-h at how far above the window's bottom (less the
 * toasts' own 24px) the right stack reaches, or 0 while it is empty.
 */
function followRightHost(host: HTMLElement) {
  const root = document.documentElement
  const update = () => {
    const rect = host.getBoundingClientRect()
    const reach = rect.height > 0 ? Math.max(0, Math.round(window.innerHeight - rect.top + 8 - 24)) : 0
    root.style.setProperty("--corner-right-h", `${reach}px`)
  }
  update()
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(update).observe(host)
  window.addEventListener("resize", update)
}

/**
 * A card in one of the corners. Lower `order` sits nearer the bottom. It
 * draws its own surface (r12, the pop surface at e3, 14–16px in; use
 * cornerCardClass), and comes in from 12px below over 240ms.
 */
export function CornerCard({
  side,
  order = 0,
  className,
  style,
  children,
}: {
  side: CornerSide
  order?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(ensureHost(side)), [side])
  if (!host) return null
  return createPortal(
    <div data-corner-card="" className={cn("corner-card", className)} style={{ order, ...style }}>
      {children}
    </div>,
    host,
  )
}

/** A corner card's surface: r12 on the pop surface at e3, 16px in. */
export const cornerCardClass = "rounded-xl bg-pop p-4 text-ink shadow-e3"
