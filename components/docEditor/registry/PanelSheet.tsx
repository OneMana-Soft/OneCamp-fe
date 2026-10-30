"use client"

import * as React from "react"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { panelFor, type EditionGate } from "./registry"
import { PanelOutlet } from "./slots"

/**
 * A registered doc panel on a phone, which has no side panel beside the page
 * (app/app/LayoutContent): a sheet of its own, titled as the panel is. It
 * hugs what it holds and grows to the sheet's most (the medium detent, as
 * ResponsiveSheet's). Loaded when one first opens there.
 */
export default function PanelSheet({ kind, docId, gate, onClose }: { kind: string; docId: string; gate: EditionGate; onClose(): void }) {
  const spec = panelFor(kind, gate)
  if (!spec) return null
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()} detent="medium">
      <DrawerContent data-doc-panel-sheet={kind} header={<DrawerTitle className="text-title-3 text-ink">{spec.title}</DrawerTitle>}>
        <PanelOutlet kind={kind} docId={docId} gate={gate} />
      </DrawerContent>
    </Drawer>
  )
}
