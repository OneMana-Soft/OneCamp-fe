"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useSheetMode } from "@/components/ui/overlayMode"
import { ChevronDown, FileText, Folder, Link2, Plus, Upload } from "@/lib/icons"
import { busyWith } from "@/lib/ui/busyWith"
import { returnFocusOnlyForKeys } from "@/lib/ui/inputModality"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * "New doc", one click as it always was, and "▾" beside it for the rest of
 * what Docs & Files holds (docs F1b; DOCS-LEAD-2's ruling b): Page, Folder,
 * Upload files and Link. The two halves are one button to the eye, the
 * primary's orange split by a hairline. On a phone "▾" opens a sheet, a
 * finger's height a row.
 */
export function NewSplitButton({
  onPage,
  onFolder,
  onUpload,
  onLink,
  running = null,
  own,
  className,
}: {
  onPage: () => void
  onFolder: () => void
  onUpload: () => void
  onLink: () => void
  /** What this tab is making, by its key (useCreateDoc's busy): ▾ waits while anything is. */
  running?: string | null
  /** The key the primary makes its page under: it is busy while that page is made. */
  own: string
  className?: string
}) {
  const phone = useSheetMode()
  const [open, setOpen] = React.useState(false)
  const items = [
    { id: "page", label: "Page", icon: FileText, run: onPage },
    { id: "folder", label: "Folder", icon: Folder, run: onFolder },
    { id: "upload", label: "Upload files", icon: Upload, run: onUpload },
    { id: "link", label: "Link", icon: Link2, run: onLink },
  ]
  const more = (
    <Button
      size="sm"
      aria-label="More to add"
      disabled={running != null}
      data-new-more=""
      onClick={phone ? () => setOpen(true) : undefined}
      className="relative w-7 rounded-l-none px-0 shadow-none after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-white/[.28]"
    >
      <ChevronDown className={cn("size-3.5 transition-transform duration-[160ms] ease-[var(--ease-out)]", open && "rotate-180")} aria-hidden="true" />
    </Button>
  )
  return (
    <div role="group" aria-label="New" className={cn("inline-flex items-center", className)} data-new-split="">
      <Button size="sm" onClick={onPage} {...busyWith(running, own)} className="gap-1.5 rounded-r-none">
        <Plus className="size-3.5" aria-hidden="true" />
        New doc
      </Button>
      {phone ? (
        <>
          {more}
          <Drawer detent="menu" open={open} onOpenChange={setOpen}>
            <DrawerContent data-new-sheet="">
              <DrawerTitle className="px-4 pb-1 pt-3 text-ui-sm font-medium text-ink-2">Add</DrawerTitle>
              <div className="flex flex-col px-2 pb-3">
                {items.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      i.run()
                    }}
                    className="flex h-12 items-center gap-3 rounded-lg px-3 text-left text-body text-ink active:bg-press"
                  >
                    <i.icon className="size-5 shrink-0" aria-hidden="true" />
                    {i.label}
                  </button>
                ))}
              </div>
            </DrawerContent>
          </Drawer>
        </>
      ) : (
        <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>{more}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-48" onCloseAutoFocus={returnFocusOnlyForKeys}>
            {items.map((i) => (
              <DropdownMenuItem key={i.id} onSelect={i.run} className="gap-2">
                <i.icon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                {i.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
