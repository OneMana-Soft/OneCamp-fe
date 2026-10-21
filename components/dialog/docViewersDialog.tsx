"use client"

// DocViewersDialog: "Viewed by" for a document. Thin wrapper over the generic,
// paginated ResourceViewersDialog.

import { DocsGet } from "@/services/endpoints/docs"
import ResourceViewersDialog from "@/components/dialog/resourceViewersDialog"

interface DocViewersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  docId: string
}

export function DocViewersDialog({ open, onOpenChange, docId }: DocViewersDialogProps) {
  return (
    <ResourceViewersDialog
      open={open}
      onOpenChange={onOpenChange}
      viewersEndpoint={DocsGet.GetDocViewers}
      idParam="doc_uuid"
      resourceId={docId}
      noun="doc"
    />
  )
}

export default DocViewersDialog
