"use client"

import type { ReactNode } from "react"
import { useDispatch } from "react-redux"
import { OverlaySheet } from "@/components/ui/overlaySheet"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"

/**
 * The right panel as a sheet over the page: the ONE place it is drawn so.
 * The shared OverlaySheet keeps focus in it while it is open and gives it back
 * where it was when it closes; its scrim closes the panel, and Escape stays
 * the panel's own (escape="own": an editor's popup or a field first).
 *
 * `shape` places it: from the right over a tablet's or a narrow window's page
 * ("shell-panel-sheet shell-panel-over", marked `over`: LayoutContent), or on
 * a phone's bottom edge ("shell-panel-phone": TaskInPlace, asana-12 (a)).
 */
export function RightPanelSheet({ label, shape, over = false, children }: { label: string; shape: string; over?: boolean; children: ReactNode }) {
  const dispatch = useDispatch()
  return (
    <OverlaySheet
      open
      onClose={() => dispatch(closeRightPanel())}
      label={label}
      escape="own"
      data-right-panel=""
      data-right-panel-sheet=""
      data-panel-over={over ? "" : undefined}
      className={`app-sheet ${shape} flex flex-col overflow-hidden`}
    >
      {children}
    </OverlaySheet>
  )
}
