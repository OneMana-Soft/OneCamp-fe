"use client"

import type { ReactNode } from "react"
import { Plus, X } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"
import { OverlaySheet } from "@/components/ui/overlaySheet"

/**
 * The channel list on a tablet (design v3, mobile T3; mock M7).
 *
 * The tablet's rail lists places, not channels, so a channel open on an iPad
 * had no list of the others beside it. Wide (1024 and up), the list is a 340px
 * sheet of its own beside the page, as every pane in v3 is a sheet with the
 * frame between. Compact (640 to 1023), it is an overlay that slides out from
 * the rail over the page, over a 20% scrim, the iPad's sidebar over content
 * in portrait: the shared OverlaySheet, so focus stays in it while it is
 * open, and a tap on the scrim, Esc or picking a channel closes it.
 *
 * Its rows are the sidebar's own (Starred, Channels) at touch density; the
 * current channel takes a list's selected look (brand-muted and a 2px edge),
 * since the sidebar's raised white chip would vanish on the sheet.
 */
export function TabletListPanel({
  mode,
  onClose,
  onAdd,
  children,
}: {
  mode: "docked" | "overlay"
  /** Closes the overlay (scrim, Esc), or hides the docked list. */
  onClose: () => void
  onAdd?: () => void
  children: ReactNode
}) {
  const body = (
    <>
      <header className="tablet-list-head">
        <h2 className="truncate text-heading text-ink">Channels</h2>
        <span className="flex-1" />
        {onAdd && (
          <button type="button" onClick={onAdd} aria-label="New channel" {...ix("icon")} className="shell-icon-btn">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label={mode === "overlay" ? "Close the channel list" : "Hide the channel list"} {...ix("icon")} className="shell-icon-btn">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <div className="tablet-list-body">{children}</div>
    </>
  )

  if (mode === "docked") {
    return (
      <aside aria-label="Channels" data-tablet-list="docked" className="tablet-list app-sheet">
        {body}
      </aside>
    )
  }
  return (
    <OverlaySheet open onClose={onClose} label="Channels" data-tablet-list="overlay" className="tablet-list app-sheet">
      {body}
    </OverlaySheet>
  )
}
