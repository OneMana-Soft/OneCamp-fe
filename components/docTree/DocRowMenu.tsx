"use client"

// A doc's "⋯" menu, wherever the doc is a row (the sidebar's tree, the docs
// home, a project's docs): Add a page inside, Star, Rename, Duplicate, Copy
// link and Move to trash, alone and last in the danger tone. What a viewer
// can't do isn't offered. On a phone the same items open as a sheet, from the
// "⋯" or a long press on the row.
//
// Docs & Files (docs F1b) gives each kind its own: a file its preview, its
// download, a new version and its versions; a folder an upload and a link
// inside it; a link opens in a new tab and copies its address, and holds
// nothing, so it has no "Add a page inside". Every kind takes a colour (a
// submenu of named colours on a computer, the colour sheet on a phone) and
// Move to…, the keyboard's and the finger's drag. On a phone, Select starts
// choosing rows.
//
// The items come in groups, a rule between each (design review, 21 Oct):
// what opening it does, Select, what its kind holds (versions, or what goes
// inside), organising it, and the trash. The phone's sheet names the item
// at its top, mark and name, since the sheet hides the row; Colour shows
// the item's own colour, round, as its row's dot is.

import * as React from "react"
import { useDispatch, useSelector } from "react-redux"
import { usePathname } from "next/navigation"
import { useAppRouter } from "@/lib/navigation/appRouter"

import { ArrowRightToLine, CheckSquare, Copy, Download, ExternalLink, Eye, History, Link2, MoreHorizontal, Pencil, Plus, Replace, Star, Trash2, Upload } from "@/lib/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { OverlayBody } from "@/components/ui/overlay"
import { useSheetMode } from "@/components/ui/overlayMode"
import { HUE_CHOICES } from "@/components/ui/campSwatches"
import { NodeMark } from "@/components/docFiles/NodeMark"
import { MenuCheck, menuCheckState } from "@/components/ui/menuCheck"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { copyDocLink } from "@/components/docEditor/docLink"
import { copyLinkAddress, downloadVersion, openLink, setColour } from "@/components/docFiles/fileActions"
import { warmNodeDialogs } from "@/components/docFiles/useNodeDialogs"
import { holdsChildren } from "@/lib/docs/docNode"
import type { CampHue } from "@/lib/campHue"
import { focusHandOff } from "@/lib/ui/focusHandOff"
import { cn } from "@/lib/utils/helpers/cn"
import type { RootState } from "@/store/store"
import type { DocFileFacts, DocNodeKind } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"
import { duplicate, rename, starDoc, trash, unstarDoc, type DocRef } from "@/components/docTree/docActions"

/** What a row is besides a page (docs F1). Absent: a page. */
export interface RowNode {
  kind?: DocNodeKind
  color?: CampHue | null
  linkUrl?: string
  file?: DocFileFacts
}

/** What only the row's surface can do: a file's preview, a dialog, choosing the row. */
export interface RowActs {
  preview?: () => void
  versions?: () => void
  replace?: () => void
  move?: () => void
  /** A phone's colour: the colour sheet (a menu can't hold the swatches there). */
  colourSheet?: () => void
  upload?: () => void
  addLink?: () => void
  /** A phone's Select: start choosing rows, this one first. */
  select?: () => void
}

export interface DocRowMenuProps {
  doc: DocRef
  /** The viewer may change it: rename, add pages inside, move it to the trash. */
  canEdit: boolean
  /** Makes a page inside it; absent where pages can't go inside (a search result). */
  onAddInside?: () => void
  /** What it is besides a page. */
  node?: RowNode
  act?: RowActs
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

/** The menu's groups, in order, a rule between each. */
type Group = "open" | "select" | "holds" | "organise" | "danger"

interface Item {
  id: string
  label: string
  icon: React.ElementType
  /** Drawn in place of the icon (Colour: the row's own swatch). */
  glyph?: React.ReactNode
  run: () => void
  group: Group
}

/** The menu's items, in order, for what the viewer may do with this kind. */
function useItems({ doc, canEdit, onAddInside, node, act, sheet }: Pick<DocRowMenuProps, "doc" | "canEdit" | "onAddInside" | "node" | "act"> & { sheet: boolean }): Item[] {
  const dispatch = useDispatch()
  const router = useAppRouter()
  const pathname = usePathname() ?? ""
  const starred = useSelector((s: RootState) => s.users.userSidebar.userStarred?.find((p) => p.resource_uuid === doc.id))
  const kind = node?.kind
  const items: Item[] = []
  // What opening it would do, first.
  if (kind === "file" && act?.preview) items.push({ id: "preview", label: "Preview", icon: Eye, run: act.preview, group: "open" })
  if (kind === "file" && node?.file) {
    const file = node.file
    items.push({ id: "download", label: "Download", icon: Download, run: () => void downloadVersion(doc.id, file), group: "open" })
  }
  if (kind === "link" && node?.linkUrl) {
    const url = node.linkUrl
    items.push({ id: "open", label: "Open link", icon: ExternalLink, run: () => openLink(url), group: "open" })
  }
  if (sheet && act?.select) items.push({ id: "select", label: "Select", icon: CheckSquare, run: act.select, group: "select" })
  // What its kind holds: what goes inside a page or a folder, a file's versions.
  if (canEdit && onAddInside && holdsChildren(kind)) items.push({ id: "add", label: "Add a page inside", icon: Plus, run: onAddInside, group: "holds" })
  if (canEdit && kind === "folder" && act?.upload) items.push({ id: "upload", label: "Upload files here", icon: Upload, run: act.upload, group: "holds" })
  if (canEdit && kind === "folder" && act?.addLink) items.push({ id: "link-in", label: "Add a link here", icon: Link2, run: act.addLink, group: "holds" })
  if (canEdit && kind === "file" && act?.replace) items.push({ id: "replace", label: "Replace with a new version…", icon: Replace, run: act.replace, group: "holds" })
  if (kind === "file" && act?.versions) items.push({ id: "versions", label: "See all versions", icon: History, run: act.versions, group: "holds" })
  items.push(
    starred
      ? { id: "star", label: "Remove from starred", icon: Star, run: () => void unstarDoc(dispatch, doc, starred), group: "organise" }
      : { id: "star", label: "Star", icon: Star, run: () => void starDoc(dispatch, doc), group: "organise" },
  )
  if (canEdit) items.push({ id: "rename", label: "Rename", icon: Pencil, run: () => rename(dispatch, doc), group: "organise" })
  // A computer's colour is a submenu (ColourItems); a phone's opens its sheet,
  // so only the phone's says "…".
  if (canEdit) items.push({ id: "colour", label: sheet ? "Colour…" : "Colour", icon: Pencil, glyph: <SwatchGlyph hue={node?.color} />, run: () => act?.colourSheet?.(), group: "organise" })
  if (canEdit && act?.move) items.push({ id: "move", label: "Move to…", icon: ArrowRightToLine, run: act.move, group: "organise" })
  if (kind !== "link") items.push({ id: "duplicate", label: "Duplicate", icon: Copy, run: () => void duplicate(doc, (href) => router.push(href)), group: "organise" })
  if (kind === "link" && node?.linkUrl) {
    const url = node.linkUrl
    items.push({ id: "link", label: "Copy address", icon: Link2, run: () => void copyLinkAddress(url), group: "organise" })
  } else items.push({ id: "link", label: "Copy link", icon: Link2, run: () => void copyDocLink(doc.id), group: "organise" })
  if (canEdit) {
    const onItsPage = pathname.startsWith(`${app_doc_path}/${doc.id}`)
    items.push({ id: "trash", label: "Move to trash", icon: Trash2, run: () => void trash(dispatch, doc, { onItsPage, go: (href) => router.push(href) }), group: "danger" })
  }
  return items
}

/** The items in their groups, in order, leaving out the empty ones. Pure. */
export function groupsOf<T extends { group: Group }>(items: T[]): T[][] {
  const order: Group[] = ["open", "select", "holds", "organise", "danger"]
  return order.map((g) => items.filter((i) => i.group === g)).filter((g) => g.length > 0)
}

/**
 * Colour's glyph in a menu: the item's own colour, round as its row's dot;
 * with none, the colour sheet's "No colour", a line across, so it never
 * reads as a box to tick beside Select.
 */
function SwatchGlyph({ hue, className }: { hue: CampHue | null | undefined; className?: string }) {
  return (
    <span aria-hidden="true" data-colour-glyph={hue ?? "none"} className={cn("inline-flex shrink-0 items-center justify-center", className)}>
      <span
        className={cn(
          "relative flex size-3.5 items-center justify-center overflow-hidden rounded-full",
          hue ? [HUE_CLASS[hue], "bg-hue"] : "bg-sunken inset-ring-[1.5px] inset-ring-line-3",
        )}
      >
        {hue ? null : <span className="absolute h-[1.5px] w-[80%] -rotate-45 rounded-sm bg-line-3" />}
      </span>
    </span>
  )
}

/**
 * The colours as menu choices, each named with its swatch, the current one
 * checked (a check, not a radio's circle). A pick colours the rows at once.
 */
export function ColourItems({ ids, current, title }: { ids: string[]; current?: CampHue | null; title?: string }) {
  return (
    <DropdownMenuGroup>
      {HUE_CHOICES.map((c) => {
        const on = (current ?? null) === c.hue
        return (
          <DropdownMenuItem
            key={c.name}
            role="menuitemradio"
            {...menuCheckState(on)}
            data-colour-choice={c.hue ?? "none"}
            // As a radio's: the colour it has already is no change.
            onSelect={() => {
              if (!on) setColour(ids, c.hue ?? null, title)
            }}
            className="pl-8"
          >
            <MenuCheck checked={on} className="absolute left-2" />
            <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-[4px]", c.hue ? [HUE_CLASS[c.hue], "bg-hue"] : "inset-ring-[1.5px] inset-ring-line-3")} />
            {c.name}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenuGroup>
  )
}

export function DocRowMenu({ doc, canEdit, onAddInside, node, act, className, focusable = false, open, onOpenChange }: DocRowMenuProps) {
  // A sheet on a phone, held either way (components/ui/overlayMode).
  const sheet = useSheetMode()
  const items = useItems({ doc, canEdit, onAddInside, node, act, sheet })
  const [ownOpen, setOwnOpen] = React.useState(false)
  const isOpen = open ?? ownOpen
  const setOpen = onOpenChange ?? setOwnOpen
  // The dialogs its items open (Move to…, a colour, a new version) come as it opens.
  React.useEffect(() => {
    if (isOpen) warmNodeDialogs()
  }, [isOpen])
  const title = doc.title.trim() || "Untitled"
  const label = `More for ${title}`
  const groups = groupsOf(items)

  // Where the focus goes as the menu or its sheet closes (lib/ui/focusHandOff):
  // after a key, unless the item chosen already put it somewhere, to the row
  // in a tree, whose "⋯" is out of the tab order and hidden again once the
  // menu lets the row go (F8), else to the "⋯"; after a pointer it stays put.
  // The sheet's dialog has no trigger of its own to give it to.
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [handOff] = React.useState(() =>
    focusHandOff(() => triggerRef.current?.closest<HTMLElement>('[role="treeitem"]') ?? triggerRef.current),
  )

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label={label}
      tabIndex={focusable ? 0 : -1}
      data-doc-row-menu=""
      data-touch-target=""
      onClick={(e) => {
        // The row opens the doc; the button only opens its menu.
        e.stopPropagation()
        e.preventDefault()
        if (sheet) setOpen(true)
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

  if (sheet) {
    // The item as its row draws it: the sheet covers the row.
    const mark = { id: doc.id, kind: node?.kind, color: node?.color, icon: node?.kind ? undefined : doc.icon, linkUrl: node?.linkUrl, file: node?.file ? { name: node.file.name, mime: node.file.mime } : undefined }
    const sheetRow = (i: Item) => (
      <button
        key={i.id}
        type="button"
        onClick={() => {
          setOpen(false)
          i.run()
        }}
        className={cn("flex h-12 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-body active:bg-press", i.group === "danger" ? "text-danger-ink" : "text-ink")}
      >
        {i.glyph ? <span className="flex size-5 shrink-0 items-center justify-center">{i.glyph}</span> : <i.icon className="size-5 shrink-0" aria-hidden="true" />}
        {i.label}
      </button>
    )
    // The trash, alone and last, is pinned in the sheet's footer: on a phone
    // too short for the whole menu (375x667) it stays in reach while the rest
    // scrolls, set apart by the footer's hairline (overlay.css #4); where the
    // menu fits it reads as its last group (design review, 22 Oct). Its rule
    // and rows sit where the body's do: the footer's padding is given back.
    const danger = groups.find((g) => g[0].group === "danger")
    const rest = groups.filter((g) => g !== danger)
    const tail = danger ? (
      <div role="group" data-sheet-group="danger" className="-mx-2 -mb-1 -mt-3 flex flex-col">
        {rest.length ? <div aria-hidden="true" data-tail-rule="" className="mx-3 my-1 h-px shrink-0 bg-line" /> : null}
        {danger.map(sheetRow)}
      </div>
    ) : null
    return (
      <>
        {trigger}
        <Drawer detent="menu" open={isOpen} onOpenChange={setOpen}>
          {/* A tap in the sheet is the sheet's: through the portal it would
              reach the row under it too, and open the doc (as the computer's
              menu stops its clicks). Its name is pinned over the items, which
              scroll under it. */}
          <DrawerContent
            data-doc-row-sheet=""
            onCloseAutoFocus={handOff.onCloseAutoFocus}
            footer={tail}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            header={
              <div data-row-sheet-name="" className="flex max-w-full items-center justify-center gap-2">
                <NodeMark node={mark} size={20} />
                <DrawerTitle className="min-w-0 truncate text-title-3 text-ink">{title}</DrawerTitle>
              </div>
            }
          >
            <OverlayBody className={cn("mx-0 flex flex-col p-0 px-2", !tail && "pb-3")}>
              {rest.map((g, at) => (
                <div key={g[0].group} role="group" data-sheet-group={g[0].group} className="flex flex-col">
                  {at > 0 ? <div aria-hidden="true" className="mx-3 my-1 h-px shrink-0 bg-line" /> : null}
                  {g.map(sheetRow)}
                </div>
              ))}
            </OverlayBody>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <DropdownMenu modal={false} open={isOpen} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={6} className="w-60" onCloseAutoFocus={handOff.onCloseAutoFocus} onClick={(e) => e.stopPropagation()}>
        {groups.map((g, at) => (
          <React.Fragment key={g[0].group}>
            {at > 0 ? <DropdownMenuSeparator /> : null}
            {g.map((i) =>
              i.id === "colour" ? (
                <DropdownMenuSub key={i.id}>
                  <DropdownMenuSubTrigger className="gap-2">
                    <span className="flex size-4 shrink-0 items-center justify-center">{i.glyph}</span>
                    {i.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44" sideOffset={4}>
                    <ColourItems ids={[doc.id]} current={node?.color} title={doc.title} />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem key={i.id} onSelect={i.run} className={cn("gap-2", i.group === "danger" && "text-danger-ink focus:text-danger-ink")}>
                  <i.icon className={cn("size-4 shrink-0", i.group !== "danger" && "text-ink-3")} aria-hidden="true" />
                  {i.label}
                </DropdownMenuItem>
              ),
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
