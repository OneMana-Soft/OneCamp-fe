"use client"

import React from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { RefreshCw, AlertTriangle } from "@/lib/icons";

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  repoCount: number
  isSubmitting: boolean
}

export default function GitHubDisconnectDialog({ open, onOpenChange, onConfirm, repoCount, isSubmitting }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md border-destructive/20">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Disconnect GitHub Integration
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2 text-sm text-muted-foreground">
            <p>Are you sure you want to completely disconnect GitHub?</p>
            <div className="bg-destructive/10 text-destructive p-3 rounded-md border border-destructive/20">
              <p className="font-semibold text-destructive mb-1 text-xs uppercase tracking-wider">This action will:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Remove all <strong className="font-semibold">{repoCount}</strong> linked repositories</li>
                <li>Clear GitHub metadata from all tasks</li>
                <li>Revoke the OAuth token</li>
                <li>Stop receiving GitHub webhook events</li>
              </ul>
            </div>
            <p className="font-medium text-foreground mt-2">This action cannot be undone.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
            {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Disconnect GitHub
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
