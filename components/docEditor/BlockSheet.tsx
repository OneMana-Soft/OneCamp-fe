"use client"

import * as React from "react"
import type { Editor } from "@tiptap/core"
import type { LucideIcon } from "lucide-react"
import { Check, ChevronLeft, ChevronRight } from "@/lib/icons"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { SheetCancel, SheetGroup } from "@/components/ui/sheet-menu"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { useEditionGate } from "@/components/docEditor/registry/gate"
import { useRegistryVersion } from "@/components/docEditor/registry/slots"
import type { BlockMenuRequest } from "@/components/minimal-tiptap/extensions/block-commands/menuRequest"
import { selectedBlocks } from "@/components/minimal-tiptap/extensions/block-selection/blockSelection"
import { blocksOf, chosenLabel, menuRows, type MenuRow } from "./blockMenuRows"

/**
 * THE BLOCK SHEET (B1; small-details M5, M6; perf 5.3): what a 500 ms
 * long-press on a block opens on a phone. The block menu's actions (the
 * registry surface `blockMenu`), as a sheet's rows in their groups: Turn into
 * and Text direction open their lists in the sheet; Move up and Move down
 * keep it open, so a block can be walked several places; Delete is alone and
 * last. On a phone this is how blocks move (there is no handle to drag).
 */

/** What a screen reader hears for each group of rows. */
const GROUP_LABEL: Record<string, string> = { style: "Style", block: "Block", move: "Move", comment: "Comment", ai: "Ask AI", delete: "Delete" }

/** Actions after which the sheet stays, following its block. */
const KEEP_OPEN = new Set(["block.moveUp", "block.moveDown"])

export default function BlockSheet({ editor, docId, request, onClose }: { editor: Editor; docId: string; request: BlockMenuRequest; onClose(refocus: boolean): void }) {
  const gate = useEditionGate()
  useRegistryVersion()
  const [req, setReq] = React.useState(request)
  const [list, setList] = React.useState<"turn" | "dir" | null>(null)

  // A move keeps the sheet, now standing for the blocks where they went.
  const done = React.useCallback(
    (refocus: boolean, actionId?: string) => {
      if (!actionId || !KEEP_OPEN.has(actionId)) return onClose(refocus)
      setTimeout(() => {
        const chosen = selectedBlocks(editor.state)
        if (chosen) setReq((r) => ({ ...r, blocks: chosen.map((b) => b.pos) }))
        else onClose(false)
      }, 0)
    },
    [editor, onClose],
  )
  const rows = React.useMemo(() => menuRows(editor, docId, gate, req, done), [editor, docId, gate, req, done])
  const blocks = blocksOf(editor, req) ?? []

  const groups: MenuRow[][] = []
  for (const row of rows.main) {
    const last = groups[groups.length - 1]
    if (last && last[0].group === row.group) last.push(row)
    else groups.push([row])
  }
  const item = (row: MenuRow) => (
    <DrawerItem
      key={row.id}
      icon={row.icon as LucideIcon | undefined}
      label={row.label}
      destructive={row.danger}
      onClick={() => (row.list ? setList(row.list) : row.run())}
      trailing={row.list ? <ChevronRight aria-hidden="true" className="size-4 text-ink-3" /> : row.checked ? <Check aria-label="Current" className="size-4 text-ink-2" /> : undefined}
    />
  )

  return (
    <Drawer detent="menu" open onOpenChange={(open) => !open && onClose(false)}>
      <DrawerContent data-block-sheet="">
        <div className="w-full pb-2">
          <DrawerTitle className="px-4 pb-1 pt-2 text-meta font-medium text-ink-3">{list === "turn" ? "Turn into" : list === "dir" ? "Text direction" : chosenLabel(editor, blocks, gate)}</DrawerTitle>
          <DrawerDescription className="sr-only">Actions for the block you held</DrawerDescription>
          {list ? (
            <>
              <SheetGroup label="Back">
                <DrawerItem icon={ChevronLeft as LucideIcon} label="Back" onClick={() => setList(null)} />
              </SheetGroup>
              <SheetGroup label={list === "turn" ? "Turn into" : "Text direction"}>{rows[list].map(item)}</SheetGroup>
            </>
          ) : (
            groups.map((g) => (
              <SheetGroup key={g[0].group} label={GROUP_LABEL[g[0].group] ?? "Actions"}>
                {g.map(item)}
              </SheetGroup>
            ))
          )}
          <SheetCancel />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
