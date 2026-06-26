"use client"

// BoardVersionHistoryDialog: lists a board's snapshots (version history) and
// lets an editor/owner restore one. Snapshots are captured server-side on the
// persist path (periodic + on sharp shrink / mass-delete) so a wiped board can
// be recovered. Restoring rewrites the persisted state and takes effect when
// the board is next opened with no collaborators connected; that caveat is
// surfaced to the user.

import * as React from "react"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { BoardSnapshot, BoardSnapshotContributor, BoardSnapshotListResponse } from "@/types/board"
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

interface BoardVersionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  boardId: string
}

const REASON_META: Record<BoardSnapshot["reason"], { label: string; className: string }> = {
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

export function BoardVersionHistoryDialog({ open, onOpenChange, boardId }: BoardVersionHistoryDialogProps) {
  // Fetch only while open so closing the dialog drops the request.
  const endpoint = open && boardId ? `${GetEndpointUrl.GetBoardSnapshots}?board_uuid=${boardId}` : ""
  const { data, isLoading, mutate } = useFetch<BoardSnapshotListResponse>(endpoint)
  const { makeRequest, isSubmitting } = usePost()
  const [restoringId, setRestoringId] = React.useState<string | null>(null)

  const snapshots = data?.data ?? []

  const handleRestore = React.useCallback(
    (snapshotId: string) => {
      if (isSubmitting) return
      setRestoringId(snapshotId)
      makeRequest({
        apiEndpoint: PostEndpointUrl.RestoreBoardSnapshot,
        payload: { board_uuid: boardId, snapshot_id: snapshotId },
        showToast: true,
      })
        .then(() => {
          // The pre-restore state is itself snapshotted, so refresh the list.
          void mutate()
          onOpenChange(false)
        })
        .finally(() => setRestoringId(null))
    },
    [boardId, isSubmitting, makeRequest, mutate, onOpenChange],
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
            Restore the board to an earlier snapshot. A restore takes effect when the board is reopened
            with everyone disconnected, and is itself reversible.
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
              <span>No snapshots yet.</span>
              <span className="text-xs">Snapshots are saved automatically as the board is edited.</span>
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
  snapshot: BoardSnapshot
  restoring: boolean
  disabled: boolean
  onRestore: () => void
}) {
  const relative = useRelativeTime(snapshot.created_at)
  const meta = REASON_META[snapshot.reason] ?? REASON_META.interval
  const contributors = snapshot.contributors ?? []
  const contributorName = (c: BoardSnapshotContributor) =>
    (c.user_full_name || c.user_name || "Someone").trim()
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
                  <AvatarFallback className="text-[8px]">
                    {contributorName(c).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
          <span className="truncate text-xs text-muted-foreground">
            {namesSummary ? `Edited by ${namesSummary}` : `${snapshot.element_count} element${snapshot.element_count === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRestore}
        disabled={disabled}
        className="shrink-0 gap-1.5"
      >
        {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        Restore
      </Button>
    </div>
  )
}

export default BoardVersionHistoryDialog
