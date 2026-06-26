"use client"

// ResourceViewersDialog: generic "Viewed by" list for any resource (doc, board,
// ...). One row per distinct viewer with their most recent view time (Google
// Docs viewer-list model), paginated with a "Load more" so the list scales to
// large workspaces. Restricted to owner/editors server-side; the affordance is
// only shown to them. Board/doc dialogs are thin wrappers around this.

import * as React from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ResourceViewer } from "@/types/board"
import type { UserProfileInterface } from "@/types/user"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Eye, Loader2 } from "@/lib/icons"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import { useUserAvatar } from "@/hooks/useUserAvatar"

const PAGE_SIZE = 50

interface ResourceViewersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Full GET endpoint, e.g. GetEndpointUrl.GetBoardViewers. */
  viewersEndpoint: string
  /** Query param name carrying the resource id, e.g. "board_uuid". */
  idParam: string
  resourceId: string
  /** Noun shown in the empty/subtitle copy, e.g. "board" or "document". */
  noun?: string
}

export function ResourceViewersDialog({
  open,
  onOpenChange,
  viewersEndpoint,
  idParam,
  resourceId,
  noun = "item",
}: ResourceViewersDialogProps) {
  const [viewers, setViewers] = React.useState<ResourceViewer[]>([])
  const [total, setTotal] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const pageIndexRef = React.useRef(0)

  const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const currentUserUuid = selfProfile?.data?.user_uuid

  const fetchPage = React.useCallback(
    async (index: number) => {
      if (!resourceId) return
      setLoading(true)
      try {
        const url = `${viewersEndpoint}?${idParam}=${resourceId}&pageIndex=${index}&pageSize=${PAGE_SIZE}`
        const res = await axiosInstance.get(url)
        const body = res.data ?? {}
        const list = (body.data ?? []) as ResourceViewer[]
        setViewers((prev) => (index === 0 ? list : [...prev, ...list]))
        setTotal(typeof body.count === "number" ? body.count : list.length)
        setHasMore(!!body.has_more)
        pageIndexRef.current = index
      } catch {
        // Best-effort: leave whatever is already loaded.
      } finally {
        setLoading(false)
      }
    },
    [viewersEndpoint, idParam, resourceId],
  )

  // (Re)load from the first page whenever the dialog opens for a resource.
  React.useEffect(() => {
    if (!open || !resourceId) return
    setViewers([])
    setTotal(0)
    setHasMore(false)
    pageIndexRef.current = 0
    void fetchPage(0)
  }, [open, resourceId, fetchPage])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Viewed by {total > 0 ? total : ""}
          </DialogTitle>
          <DialogDescription>People who have opened this {noun}, most recent first.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {loading && viewers.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading viewers...
            </div>
          ) : viewers.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
              <Eye className="h-5 w-5" />
              <span>No views yet.</span>
            </div>
          ) : (
            <>
              {viewers.map((v) => (
                <ViewerRow key={v.user_uuid} viewer={v} isSelf={v.user_uuid === currentUserUuid} />
              ))}
              {hasMore && (
                <div className="pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={loading}
                    onClick={() => fetchPage(pageIndexRef.current + 1)}
                  >
                    {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ViewerRow({ viewer, isSelf }: { viewer: ResourceViewer; isSelf: boolean }) {
  const relative = useRelativeTime(viewer.last_viewed_at)
  const { src } = useUserAvatar(viewer.user_profile_object_key)
  const name = (viewer.user_full_name || viewer.user_name || "Someone").trim()

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/40">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={src} alt={name} className="object-cover" />
        <AvatarFallback className="text-[11px]">{name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {name}
          {isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
        </div>
        <div className="text-xs text-muted-foreground">Viewed {relative || "just now"}</div>
      </div>
    </div>
  )
}

export default ResourceViewersDialog
