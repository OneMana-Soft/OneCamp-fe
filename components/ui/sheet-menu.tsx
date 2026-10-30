"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { DrawerClose } from "@/components/ui/drawer"

/*
 * An options menu's parts (design v3, mobile C7), for a sheet in menu mode
 * (detent="menu"). They sit apart from components/ui/drawer because only
 * menus use them: the app's first load opens sheets, never a menu, so it
 * doesn't carry them (app/firstLoad.test).
 */

/**
 * A group of a sheet's rows: an r14 card on the sheet, iOS's inset-grouped
 * look, so a menu reads as a tray of cards and not a list on a slab. A menu
 * has at most three: what is used most, what manages, and what destroys,
 * which is alone and last.
 *
 * The group that holds what destroys says so (data-holds-danger), from its
 * rows' own tone (DrawerItem's destructive), so no caller has to. On a short
 * phone (375x667) the last group scrolled out of reach under a menu's 60dvh
 * cap, and with it Move to trash; app/phone.css now keeps that group at the
 * sheet's foot while the rest scrolls (DESIGN-BUILD-5, 22 Oct 2026). It is
 * read after every draw, so a row that comes or goes is followed.
 */
export const SheetGroup = ({ className, label, ...props }: React.HTMLAttributes<HTMLDivElement> & { label?: string }) => {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const group = ref.current
    if (group) group.toggleAttribute("data-holds-danger", group.querySelector(DANGER_ROW) !== null)
  })
  return <div role="group" aria-label={label} data-sheet-group="" className={cn("sheet-group", className)} {...props} ref={ref} />
}
SheetGroup.displayName = "SheetGroup"

/** A destructive row of a group: one of its rows, or one a wrapper holds (phone.css C7 draws both). */
const DANGER_ROW = ':scope > [data-tone="danger"], :scope > * > [data-tone="danger"]'

/** The Cancel card under a menu's groups: a thumb's-reach way out (iOS's action sheet). */
export const SheetCancel = ({ label = "Cancel", className }: { label?: string; className?: string }) => (
  <DrawerClose asChild>
    <button type="button" data-sheet-cancel="" data-press="row" className={cn("sheet-cancel mb-2", className)}>
      {label}
    </button>
  </DrawerClose>
)
SheetCancel.displayName = "SheetCancel"
