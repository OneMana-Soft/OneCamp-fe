"use client"

import * as React from "react"

import { ColourItems } from "@/components/docTree/DocRowMenu"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import { useSheetMode } from "@/components/ui/overlayMode"
import { ArrowRightToLine, X } from "@/lib/icons"

/** The camp hues round a wheel, in the swatches' order (components/ui/campSwatches). */
const HUE_WHEEL = "conic-gradient(var(--camp-moss) 0 60deg, var(--camp-sun) 0 120deg, var(--camp-lake) 0 180deg, var(--camp-sky) 0 240deg, var(--camp-dusk) 0 300deg, var(--camp-berry) 0)"

/**
 * What a selection of rows can have done to it at once (docs F1b): a colour
 * and Move to…. On a computer, a bar floating under the rows (the table's
 * bulk bar's form: arrow keys along it, Escape lets go); the colours are a
 * menu of their names. On a phone, a footer pinned over the tab bar, each
 * action a finger's height, with Done.
 */
export function BulkBar({ ids, onMove, onColourSheet, onClear }: { ids: string[]; onMove: () => void; onColourSheet: () => void; onClear: () => void }) {
  const phone = useSheetMode()
  const n = ids.length
  const count = `${n} selected`

  if (phone) {
    return (
      <div
        role="toolbar"
        aria-label="Selected items"
        data-bulk-bar="phone"
        className="content-rise fixed inset-x-0 bottom-0 z-[var(--z-popover)] flex items-center gap-2 bg-pop px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 shadow-e4"
      >
        <span className="min-w-0 flex-1 truncate text-ui font-medium tabular-nums text-ink">{count}</span>
        <Button variant="secondary" className="h-11" disabled={n === 0} onClick={onColourSheet}>
          Colour
        </Button>
        <Button variant="secondary" className="h-11" disabled={n === 0} onClick={onMove}>
          Move to…
        </Button>
        <Button className="h-11" onClick={onClear}>
          Done
        </Button>
      </div>
    )
  }

  if (n === 0) return null
  return (
    <div className="pointer-events-none sticky bottom-4 z-[6] mt-3 flex justify-center" data-bulk-bar="">
      <FloatingBar label="Selected items" className="pointer-events-auto" onEscape={onClear}>
        <span className="px-2 text-ui-sm font-medium tabular-nums text-ink">{count}</span>
        <FloatingBarDivider />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <FloatingBarButton label="Colour">
              {/* The six hues to pick from, round as a row's colour dot: an
                  empty square beside the rows' checks read as one more box to
                  tick (design review, 21 Oct). */}
              <span aria-hidden="true" data-colour-glyph="pick" className="size-3.5 shrink-0 rounded-full" style={{ background: HUE_WHEEL }} />
              <span>Colour</span>
            </FloatingBarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" sideOffset={8} className="w-44">
            <ColourItems ids={ids} />
          </DropdownMenuContent>
        </DropdownMenu>
        <FloatingBarButton label="Move to…" onClick={onMove}>
          <ArrowRightToLine />
          <span>Move to…</span>
        </FloatingBarButton>
        <FloatingBarDivider />
        <FloatingBarButton label="Clear the selection" onClick={onClear}>
          <X />
        </FloatingBarButton>
      </FloatingBar>
    </div>
  )
}

export default BulkBar
