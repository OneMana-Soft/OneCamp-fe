"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { PanelResizeHandle, disableGlobalCursorStyles } from "react-resizable-panels"
import { cn } from "@/lib/utils/helpers/cn"

// The panels' own resize cursor is a rule for every element, added and taken
// away as a seam is hovered, dragged and stopped at a limit: the whole page
// restyled each time (fluid-21). A seam wears its cursor itself, and once a
// drag takes the pointer off it a surface over the page wears it and takes the
// pointer. Not on the press: the release would land on the surface, and a
// double-click would never reach the seam.
disableGlobalCursorStyles()

/**
 * The seam between two sheets is the handle (design v3, shell V1 and V2): an
 * 8px gap where the frame and its glow show through, with a 3x28 grip that
 * fades in on hover. Double-click resets the panel beside it, or evens the
 * views. The shell's panes and a call's own page (MeetingSplit) share it.
 * `order`: its place among the views (CSS order).
 */
export function Seam({ hidden, onDragging, onReset, label, order }: { hidden?: boolean; onDragging?: (d: boolean) => void; onReset?: () => void; label: string; order?: number }) {
  // Pressed, with the pointer still on the seam ("on") or gone off it ("off").
  const [held, setHeld] = useState<"on" | "off">()
  const grip = useRef<HTMLElement>(null)
  useEffect(() => {
    if (held !== "on") return
    const off = (e: PointerEvent) => {
      if (!grip.current?.parentElement?.contains(e.target as Node)) setHeld("off")
    }
    window.addEventListener("pointermove", off, true)
    return () => window.removeEventListener("pointermove", off, true)
  }, [held])
  return (
    <PanelResizeHandle
      onDragging={(d) => {
        setHeld(d ? "on" : undefined)
        onDragging?.(d)
      }}
      className={cn("shell-seam", hidden && "hidden")}
      aria-label={label}
      onDoubleClick={onReset}
      style={order === undefined ? undefined : { order }}
    >
      <i ref={grip} />
      {held === "off" && createPortal(<div className="shell-seam-surface" />, document.body)}
    </PanelResizeHandle>
  )
}
