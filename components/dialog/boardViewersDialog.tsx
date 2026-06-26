"use client"

// BoardViewersDialog: "Viewed by" for a board. Thin wrapper over the generic,
// paginated ResourceViewersDialog.

import * as React from "react"
import { GetEndpointUrl } from "@/services/endPoints"
import ResourceViewersDialog from "@/components/dialog/resourceViewersDialog"

interface BoardViewersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  boardId: string
}

export function BoardViewersDialog({ open, onOpenChange, boardId }: BoardViewersDialogProps) {
  return (
    <ResourceViewersDialog
      open={open}
      onOpenChange={onOpenChange}
      viewersEndpoint={GetEndpointUrl.GetBoardViewers}
      idParam="board_uuid"
      resourceId={boardId}
      noun="board"
    />
  )
}

export default BoardViewersDialog
