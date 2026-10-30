"use client"

import { forwardRef } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils/helpers/cn"

/** A line's place on the page: its top edge's y, where it starts, how long it is. */
export type DropLineAt = { top: number; left: number; width: number }

/**
 * WHERE A DRAGGED THING WILL LAND, the one line every drag draws: the layer's
 * 2px accent line with its ring (app/interaction.css [data-drop-line],
 * INTERACTION_SPEC §5.1). It takes no space and nothing points at it.
 *
 * - In a positioned box, by its class: a board's gap between two cards
 *   (components/kanbanComponents/TaskBoard), which moves with the cards.
 * - `floating`, over the page in a portal, for a list's gap between two rows
 *   (components/task/listReorder): hidden until placeDropLine puts it at a
 *   point, which a drag does on every move without a render, so a held row
 *   costs no frame.
 * - `at` a point, for one drawn where it is known when it renders. Null draws
 *   nothing.
 */
export const DropLine = forwardRef<HTMLSpanElement, { className?: string; at?: DropLineAt | null; floating?: boolean }>(function DropLine({ className, at, floating = false }, ref) {
  if (at === null) return null
  const over = floating || !!at
  const line = (
    <span
      ref={ref}
      aria-hidden="true"
      data-drop-line=""
      className={cn("pointer-events-none absolute inset-x-1 z-10 block", over && "z-50", className)}
      // Centred on the gap's edge: the line is 2px tall.
      style={over ? { position: "fixed", right: "auto", ...(at ? { top: at.top - 1, left: at.left, width: at.width } : { display: "none" }) } : undefined}
    />
  )
  return over ? (typeof document === "undefined" ? null : createPortal(line, document.body)) : line
})

/** Puts a floating line at a point, or hides it (null), straight on the element: a drag calls it on every move. */
export function placeDropLine(el: HTMLElement | null, at: DropLineAt | null): void {
  if (!el) return
  if (!at) {
    el.style.display = "none"
    return
  }
  el.style.top = `${at.top - 1}px`
  el.style.left = `${at.left}px`
  el.style.width = `${at.width}px`
  el.style.display = ""
}
