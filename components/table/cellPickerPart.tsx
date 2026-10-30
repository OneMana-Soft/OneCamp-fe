"use client"

import * as React from "react"
import { Loader2 } from "@/lib/icons"
import { lazyView } from "@/lib/lazy/lazyView"

/**
 * The grid's cell pickers (cellPickers.tsx): one chunk, loaded the first time
 * a select's, a date's or a link's picker opens, and warmed once the table is
 * drawn (warmCellPickers), so a picker opens at once.
 */
export const cellPickers = lazyView(() => import("@/components/table/cellPickers"))

/**
 * Tables B1's cells that draw more than text (people's faces, a long text's
 * box, a rating's stars, a row's own facts): a chunk of its own, asked for by
 * the first one drawn; each shows its text until it lands.
 */
export const kindCells = lazyView(() => import("@/components/table/kindCells"))

type Pickers = typeof import("@/components/table/cellPickers")

/**
 * A cell whose picker is the combobox (SA-3), in the pickers' chunk: until it
 * is first opened, only its trigger is drawn, as LazyPopover's cells are; the
 * first click draws the chunk's combobox round the same trigger, open. One
 * root (Combobox), so a phone's sheet mode opens it as it opens the menu.
 */
export function ComboboxCell({
  trigger,
  picker,
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  picker: (m: Pickers, open: boolean, setOpen: (open: boolean) => void) => React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [armed, setArmed] = React.useState(false)
  if (!armed) {
    return React.cloneElement(trigger, {
      onClick: (e: React.MouseEvent) => {
        trigger.props.onClick?.(e)
        setArmed(true)
        setOpen(true)
      },
    })
  }
  return <cellPickers.View fallback={trigger} render={(m) => picker(m, open, setOpen)} />
}

/** Starts loading the pickers: the table is drawn and the page is idle. */
export const warmCellPickers = () => void cellPickers.prefetch()

/** A picker while its chunk is on its way: a moment, the first time. */
export function PickerLoading() {
  return (
    <div className="content-float flex h-10 w-64 items-center gap-2 rounded-xl px-3 text-meta text-ink-3 shadow-e3" role="status">
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Opening…
    </div>
  )
}
