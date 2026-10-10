"use client"

// BoardVersionHistoryDialog: lists a board's snapshots (version history) and
// lets an editor/owner restore one. Snapshots are captured server-side on the
// persist path (periodic + on sharp shrink / mass-delete) so a wiped board can
// be recovered. Restoring rewrites the persisted state and takes effect when
// the board is next opened with no collaborators connected; that caveat is
// surfaced to the user.

import { displayNameOf } from "@/lib/personName"
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
import { History, RotateCcw, Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { Faces, RESOURCE_ROW, ResourceListEmpty, ResourceListSkeleton, VersionReason } from "@/components/dialog/resourceListParts"
import { useRelativeTime } from "@/hooks/useRelativeTime"

interface BoardVersionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  boardId: string
}

const REASON_META: Record<BoardSnapshot["reason"], { label: string; warning: boolean }> = {
  mass_delete: {
    label: "Before large deletion",
    warning: true,
  },
  manual: {
    label: "Before a restore",
    warning: false,
  },
  interval: {
    label: "Auto-saved",
    warning: false,
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

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <ResourceListSkeleton label="Loading versions" />
          ) : snapshots.length === 0 ? (
            <ResourceListEmpty icon={History} title="No versions yet" description="A version is kept as it is edited, every so often and before a large deletion." />
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
    displayNameOf(c) || "Someone"
  const namesSummary =
    contributors.length === 0
      ? ""
      : contributors.length <= 2
        ? contributors.map(contributorName).join(", ")
        : `${contributors.slice(0, 2).map(contributorName).join(", ")} +${contributors.length - 2}`

  return (
    <div className={cn(RESOURCE_ROW, "justify-between gap-3")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{relative || "Just now"}</span>
          <VersionReason label={meta.label} warning={meta.warning} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <Faces people={contributors.map((c) => ({ user_uuid: c.user_uuid, name: contributorName(c) }))} size={16} />
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
