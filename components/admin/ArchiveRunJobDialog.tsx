"use client"

import React, { useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { AlertTriangle, RefreshCw } from "@/lib/icons";
import { PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  entityLabel: string
  entityType?: string
}

export default function ArchiveRunJobDialog({ open, onOpenChange, onConfirm, entityLabel, entityType }: Props) {
  const [isRunning, setIsRunning] = useState(false)
  const { toast } = useToast()

  const handleConfirm = async () => {
    setIsRunning(true)
    try {
      await onConfirm()
    } catch (err: any) {
      const msg = err?.response?.status === 429 ? "Rate limit exceeded — try again later" : err?.response?.data?.error || "Failed to start archive job"
      toast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!isRunning) onOpenChange(o) }}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" /> Run Archive Job
          </AlertDialogTitle>
          <AlertDialogDescription>
            <p>This will archive all <strong className="text-foreground">{entityLabel}</strong> items that are older than the configured retention period.</p>
            <p className="mt-2">Archived items are soft-deleted and can be restored later. The job runs asynchronously in the background.</p>
            {(entityType === "posts" || entityType === "chats") && (
              <p className="mt-2 text-xs text-muted-foreground">
                Any AI memory (decisions, commitments, questions) captured from
                these items is also archived, so it stops surfacing in AI search
                and briefings. Restoring brings it back.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRunning}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isRunning} className="gap-1.5">
            {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {isRunning ? "Running..." : "Run Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
