"use client"

// DocViewersDialog: "Viewed by" for a document. Thin wrapper over the generic,
// paginated ResourceViewersDialog.

import * as React from "react"
import { GetEndpointUrl } from "@/services/endPoints"
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
      viewersEndpoint={GetEndpointUrl.GetDocViewers}
      idParam="doc_uuid"
      resourceId={docId}
      noun="document"
    />
  )
}

export default DocViewersDialog
