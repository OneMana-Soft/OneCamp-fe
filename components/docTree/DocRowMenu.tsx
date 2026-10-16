"use client"

// A doc's "⋯" menu, wherever the doc is a row (the sidebar's tree, the docs
// home, a project's docs): Add a page inside, Star, Rename, Duplicate, Copy
// link and Move to trash, alone and last in the danger tone. What a viewer
// can't do isn't offered. On a phone the same items open as a sheet, from the
// "⋯" or a long press on the row.

import * as React from "react"
import { useDispatch, useSelector } from "react-redux"
import { usePathname, useRouter } from "next/navigation"

import { Copy, Link2, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "@/lib/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useMedia } from "@/context/MediaQueryContext"
import { copyDocLink } from "@/components/docEditor/docLink"
import { returnFocusOnlyForKeys } from "@/lib/ui/inputModality"
import { cn } from "@/lib/utils/helpers/cn"
import type { RootState } from "@/store/store"
import { app_doc_path } from "@/types/paths"
import { duplicate, rename, starDoc, trash, unstarDoc, type DocRef } from "@/components/docTree/docActions"

export interface DocRowMenuProps {
  doc: DocRef
  /** The viewer may change it: rename, add pages inside, move it to the trash. */
  canEdit: boolean
  /** Makes a page inside it; absent where pages can't go inside (a search result). */
  onAddInside?: () => void
  /** The trigger's classes: the tree's 20px button, a list row's 28px one. */
  className?: string
  /**
   * A stop of its own in the tab order: in a list, after its row's link. A
   * tree has one tab stop and opens the menu with ⇧F10 instead.
   */
  focusable?: boolean
  /** Opened from outside (a long press, ⇧F10). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface Item {
  id: string
  label: string
  icon: React.ElementType
  run: () => void
  danger?: boolean
}

/** The menu's items, in order, for what the viewer may do. */
function useItems({ doc, canEdit, onAddInside }: Pick<DocRowMenuProps, "doc" | "canEdit" | "onAddInside">): Item[] {
  const dispatch = useDispatch()
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const starred = useSelector((s: RootState) => s.users.userSidebar.userStarred?.find((p) => p.resource_uuid === doc.id))
  const items: Item[] = []
  if (canEdit && onAddInside) items.push({ id: "add", label: "Add a page inside", icon: Plus, run: onAddInside })
  items.push(
    starred
      ? { id: "star", label: "Remove from starred", icon: Star, run: () => void unstarDoc(dispatch, doc, starred) }
      : { id: "star", label: "Star", icon: Star, run: () => void starDoc(dispatch, doc) },
  )
  if (canEdit) items.push({ id: "rename", label: "Rename", icon: Pencil, run: () => rename(dispatch, doc) })
  items.push({ id: "duplicate", label: "Duplicate", icon: Copy, run: () => void duplicate(doc, (href) => router.push(href)) })
  items.push({ id: "link", label: "Copy link", icon: Link2, run: () => void copyDocLink(doc.id) })
  if (canEdit) {
    const onItsPage = pathname.startsWith(`${app_doc_path}/${doc.id}`)
    items.push({ id: "trash", label: "Move to trash", icon: Trash2, danger: true, run: () => void trash(dispatch, doc, { onItsPage, go: (href) => router.push(href) }) })
  }
  return items
}

export function DocRowMenu({ doc, canEdit, onAddInside, className, focusable = false, open, onOpenChange }: DocRowMenuProps) {
  const { isMobile } = useMedia()
  const items = useItems({ doc, canEdit, onAddInside })
  const [ownOpen, setOwnOpen] = React.useState(false)
  const isOpen = open ?? ownOpen
  const setOpen = onOpenChange ?? setOwnOpen
  const label = `More for ${doc.title.trim() || "Untitled"}`
  const main = items.filter((i) => !i.danger)
  const danger = items.filter((i) => i.danger)

  const trigger = (
    <button
      type="button"
      aria-label={label}
      tabIndex={focusable ? 0 : -1}
      data-doc-row-menu=""
      onClick={(e) => {
        // The row opens the doc; the button only opens its menu.
        e.stopPropagation()
        e.preventDefault()
        if (isMobile) setOpen(true)
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm text-ink-3 outline-none hover:bg-[var(--press)] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-[var(--press)] data-[state=open]:text-ink",
        className ?? "size-5",
      )}
    >
      <MoreHorizontal className="size-3.5" aria-hidden="true" />
    </button>
  )

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer detent="menu" open={isOpen} onOpenChange={setOpen}>
          <DrawerContent data-doc-row-sheet="">
            <DrawerTitle className="truncate px-4 pb-1 pt-3 text-ui-sm font-medium text-ink-2">{doc.title.trim() || "Untitled"}</DrawerTitle>
            <div className="flex flex-col px-2 pb-3">
              {[...main, ...danger].map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    i.run()
                  }}
                  className={cn("flex h-12 items-center gap-3 rounded-lg px-3 text-left text-body active:bg-press", i.danger ? "text-danger-ink" : "text-ink")}
                >
                  <i.icon className="size-5 shrink-0" aria-hidden="true" />
                  {i.label}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <DropdownMenu modal={false} open={isOpen} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={6} className="w-52" onCloseAutoFocus={returnFocusOnlyForKeys} onClick={(e) => e.stopPropagation()}>
        {main.map((i) => (
          <DropdownMenuItem key={i.id} onSelect={i.run} className="gap-2">
            <i.icon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            {i.label}
          </DropdownMenuItem>
        ))}
        {danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map((i) => (
          <DropdownMenuItem key={i.id} onSelect={i.run} className="gap-2 text-danger-ink focus:text-danger-ink">
            <i.icon className="size-4 shrink-0" aria-hidden="true" />
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
