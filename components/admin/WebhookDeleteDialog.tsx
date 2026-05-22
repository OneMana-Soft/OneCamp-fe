"use client"

import React from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { AlertTriangle } from "@/lib/icons";

interface WebhookData {
  id: string
  name: string
  type: "incoming" | "outgoing"
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  webhook: WebhookData | null
}

export default function WebhookDeleteDialog({ open, onOpenChange, onConfirm, webhook }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Delete Webhook
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>Are you sure you want to delete <strong className="text-foreground">{webhook?.name}</strong>?</p>
            <p>This will:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Revoke the webhook token immediately</li>
              <li>Stop all {webhook?.type === "outgoing" ? "outgoing event deliveries" : "incoming message processing"}</li>
              <li>Preserve existing logs for audit purposes</li>
            </ul>
            <p className="font-medium text-foreground mt-3">This action cannot be undone.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete Webhook
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
