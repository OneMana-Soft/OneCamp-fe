"use client"

// DocViewersDialog: "Viewed by" for a document. Thin wrapper over the generic,
// paginated ResourceViewersDialog, with the doc's last 28 days above the list.

import { DocsGet } from "@/services/endpoints/docs"
import ResourceViewersDialog from "@/components/dialog/resourceViewersDialog"
import { destinationHue } from "@/lib/destinationHue"

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
      insightsEndpoint={DocsGet.GetDocInsights}
      hue={destinationHue("/app/doc")}
      idParam="doc_uuid"
      resourceId={docId}
      noun="doc"
    />
  )
}

export default DocViewersDialog
