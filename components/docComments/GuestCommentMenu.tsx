"use client"

import * as React from "react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useSheetMode } from "@/components/ui/overlayMode"
import { MoreHorizontal, Trash2 } from "@/lib/icons"
import { returnFocusOnlyForKeys } from "@/lib/ui/inputModality"

/**
 * The quiet "⋯" beside Reply: Remove in danger ink, in a menu on a desk and
 * in a sheet on a phone, held either way (components/ui/overlayMode). Remove
 * itself still asks to confirm.
 */
export function GuestCommentMenu({ name, onRemove }: { name: string; onRemove: () => void }) {
  const sheet = useSheetMode()
  const [open, setOpen] = React.useState(false)
  const trigger = (
    <button
      type="button"
      aria-label={`More for ${name}'s comment`}
      data-touch-target=""
      onClick={() => {
        if (sheet) setOpen(true)
      }}
      className="inline-flex size-7 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-[var(--press)] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-[var(--press)] data-[state=open]:text-ink"
    >
      <MoreHorizontal className="size-4" aria-hidden="true" />
    </button>
  )
  if (sheet) {
    return (
      <>
        {trigger}
        <Drawer detent="menu" open={open} onOpenChange={setOpen}>
          <DrawerContent data-guest-comment-sheet="">
            <DrawerTitle className="truncate px-4 pb-1 pt-3 text-ui-sm font-medium text-ink-2">{`${name}'s comment`}</DrawerTitle>
            <div className="flex flex-col px-2 pb-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onRemove()
                }}
                className="flex h-12 items-center gap-3 rounded-lg px-3 text-left text-body text-danger-ink active:bg-press"
              >
                <Trash2 className="size-5 shrink-0" aria-hidden="true" />
                Remove
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={returnFocusOnlyForKeys}>
        <DropdownMenuItem variant="destructive" onSelect={onRemove} className="gap-2">
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
