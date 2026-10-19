"use client"

import { PanelResizeHandle } from "react-resizable-panels"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The seam between two sheets is the handle (design v3, shell V1 and V2): an
 * 8px gap where the frame and its glow show through, with a 3x28 grip that
 * fades in on hover. Double-click resets the panel beside it. The shell's
 * panes and a call's own page (MeetingSplit) share it.
 */
export function Seam({ hidden, onDragging, onReset, label }: { hidden?: boolean; onDragging?: (d: boolean) => void; onReset?: () => void; label: string }) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn("shell-seam", hidden && "hidden")}
      aria-label={label}
      onDoubleClick={onReset}
    >
      <i />
    </PanelResizeHandle>
  )
}
