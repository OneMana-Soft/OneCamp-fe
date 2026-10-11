"use client"

import { useEffect, useState } from "react"
import { Search } from "@/lib/icons"
import { onPaletteState, openPalette } from "@/lib/ui/palette"
import { useModKey } from "@/hooks/useModKey"

/**
 * The search pill (design v3, shell S4).
 *
 * The pill is the one way into ⌘K by click (data-palette-trigger), a button
 * and not a field: the top bar's 500px inline search and its own popover are
 * retired, and their results live in the palette. It stays pressed while the
 * palette it opened is up.
 */
export function SidebarSearchRow() {
  const mod = useModKey()
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => onPaletteState(setPaletteOpen), [])

  return (
    <div className="mb-2.5 mt-2 flex items-center gap-1.5">
      <button
        type="button"
        data-palette-trigger=""
        data-open={paletteOpen ? "true" : undefined}
        onClick={() => openPalette({ mode: "search" })}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        className="shell-pill min-w-0 flex-1"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Search</span>
        <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
          <span className="kbd">{mod}</span>
          <span className="kbd">K</span>
        </span>
      </button>
    </div>
  )
}
