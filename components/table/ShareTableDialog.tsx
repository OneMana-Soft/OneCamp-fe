"use client"

/**
 * A table's Share dialog: a read-only link for people outside the workspace,
 * as the share dialog's "Anyone with the link" card (GuestLinkSection card,
 * D19) in its shell (D18: the title, the body, then the footer with Copy link
 * and Done), as a doc's and a board's are. A chunk of its own (lazyParts
 * SharePart), dialog and all, loaded as the pointer or the focus reaches
 * Share: the table's first screen carried the dialog's 11 KB for a button
 * most never press.
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GuestLinkSection } from "@/components/guest/GuestLinkSection"
import { ShareFooter } from "@/components/dialog/shareParts"

export function ShareTableDialog({ tableId, tableName, canShare, onClose }: { tableId: string; tableName: string; canShare: boolean; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[480px]" data-share-dialog="table">
        <DialogHeader className="px-5 pb-0 pt-5 pr-12 text-start">
          <DialogTitle className="truncate text-title-3 text-ink">Share “{tableName}”</DialogTitle>
          <DialogDescription className="text-ui-sm text-ink-2">Give people outside your workspace a read-only link to this table.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[min(70dvh,560px)] flex-col overflow-y-auto px-5 pb-5 pt-4">
          <GuestLinkSection card resourceType="table" resourceId={tableId} canShare={canShare} />
        </div>
        <ShareFooter onDone={onClose} />
      </DialogContent>
    </Dialog>
  )
}
