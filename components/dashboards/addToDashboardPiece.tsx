"use client"

// Add to dashboard's one way in (B9-b4): Reports, the Display menu's saved
// views and the phone's saved views (addViewToDashboard) open the same
// dialog (AddToDashboard), whose code comes when it is first opened, or warmed
// as the pointer or the focus reaches a way in. Drawn inside the menu or drawer it is opened from,
// so that layer stays open beneath it and takes the focus back after.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { AddToDashboardProps } from "@/components/dashboards/AddToDashboard"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

function Failed({ onClose, retry }: AddToDashboardProps & { retry: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to a dashboard</DialogTitle>
          <DialogDescription>It couldn&apos;t load. Check the connection and try again.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={retry}>Try again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const Piece = lazyPiece(() => import("@/components/dashboards/AddToDashboard").then((m) => ({ default: m.AddToDashboard })), { failed: Failed })

/** Fetches Add to dashboard's code ahead of its first use. */
export const warmAddToDashboard = () => Piece.warm()

/** Add to dashboard, while it is open. */
export function AddToDashboardDialog(props: AddToDashboardProps) {
  return (
    <React.Suspense fallback={null}>
      <Piece {...props} />
    </React.Suspense>
  )
}
