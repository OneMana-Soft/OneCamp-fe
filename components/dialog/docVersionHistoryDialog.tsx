"use client"

// DocVersionHistoryDialog: lists a document's snapshots and lets an
// editor/owner restore one. Mirrors the board version-history dialog. Restoring
// rewrites the persisted body and takes effect on the next fresh load (no
// connected collaborators); that caveat is surfaced to the user.

import * as React from "react"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { DocSnapshot, DocSnapshotContributor, DocSnapshotListResponse } from "@/types/doc"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { History, Clock, RotateCcw, Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useRelativeTime } from "@/hooks/useRelativeTime"

interface DocVersionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  docId: string
}

const REASON_META: Record<DocSnapshot["reason"], { label: string; className: string }> = {
  mass_delete: {
    label: "Before large deletion",
    className: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
  },
  manual: {
    label: "Before a restore",
    className: "bg-primary/10 text-primary border border-primary/20",
  },
  interval: {
    label: "Auto-saved",
    className: "bg-muted text-muted-foreground border border-border",
  },
}

export function DocVersionHistoryDialog({ open, onOpenChange, docId }: DocVersionHistoryDialogProps) {
  const endpoint = open && docId ? `${GetEndpointUrl.GetDocSnapshots}?doc_uuid=${docId}` : ""
  const { data, isLoading, mutate } = useFetch<DocSnapshotListResponse>(endpoint)
  const { makeRequest, isSubmitting } = usePost()
  const [restoringId, setRestoringId] = React.useState<string | null>(null)

  const snapshots = data?.data ?? []

  const handleRestore = React.useCallback(
    (snapshotId: string) => {
      if (isSubmitting) return
      setRestoringId(snapshotId)
      makeRequest({
        apiEndpoint: PostEndpointUrl.RestoreDocSnapshot,
        payload: { doc_uuid: docId, snapshot_id: snapshotId },
        showToast: true,
      })
        .then(() => {
          void mutate()
          onOpenChange(false)
        })
        .finally(() => setRestoringId(null))
    },
    [docId, isSubmitting, makeRequest, mutate, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Version history
          </DialogTitle>
          <DialogDescription>
            Restore the document to an earlier version. A restore takes effect when the document is
            reopened with everyone disconnected, and is itself reversible.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span>No versions yet.</span>
              <span className="text-xs">Versions are saved automatically as the document is edited.</span>
            </div>
          ) : (
            snapshots.map((snap) => (
              <SnapshotRow
                key={snap.id}
                snapshot={snap}
                restoring={restoringId === snap.id}
                disabled={isSubmitting}
                onRestore={() => handleRestore(snap.id)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SnapshotRow({
  snapshot,
  restoring,
  disabled,
  onRestore,
}: {
  snapshot: DocSnapshot
  restoring: boolean
  disabled: boolean
  onRestore: () => void
}) {
  const relative = useRelativeTime(snapshot.created_at)
  const meta = REASON_META[snapshot.reason] ?? REASON_META.interval
  const contributors = snapshot.contributors ?? []
  const contributorName = (c: DocSnapshotContributor) => (c.user_full_name || c.user_name || "Someone").trim()
  const namesSummary =
    contributors.length === 0
      ? ""
      : contributors.length <= 2
        ? contributors.map(contributorName).join(", ")
        : `${contributors.slice(0, 2).map(contributorName).join(", ")} +${contributors.length - 2}`

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{relative || "Just now"}</span>
          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", meta.className)}>
            {meta.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {contributors.length > 0 && (
            <div className="flex -space-x-1.5">
              {contributors.slice(0, 3).map((c) => (
                <Avatar key={c.user_uuid} className="h-4 w-4 ring-2 ring-background" title={contributorName(c)}>
                  <AvatarFallback className="text-[8px]">{contributorName(c).charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
          <span className="truncate text-xs text-muted-foreground">
            {namesSummary ? `Edited by ${namesSummary}` : "Auto-saved version"}
          </span>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onRestore} disabled={disabled} className="shrink-0 gap-1.5">
        {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        Restore
      </Button>
    </div>
  )
}

export default DocVersionHistoryDialog
