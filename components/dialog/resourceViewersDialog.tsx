"use client"

// ResourceViewersDialog: generic "Viewed by" list for any resource (doc, board,
// ...). One row per distinct viewer with their most recent view time (Google
// Docs viewer-list model), paginated with a "Load more" so the list scales to
// large workspaces. Restricted to owner/editors server-side; the affordance is
// only shown to them. Board/doc dialogs are thin wrappers around this. A read
// that fails says so, with Try again, never "No views yet" (N46).

import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { displayNameOf } from "@/lib/personName"
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
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { RESOURCE_ROW, ResourceListEmpty, ResourceListSkeleton } from "@/components/dialog/resourceListParts"
import { ErrorState } from "@/components/ui/error-state"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
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

function ResourceViewersDialog({
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
  // A failed read is said as one (N46): it used to leave the list empty, and
  // the dialog said "No views yet" about a doc read by twelve people.
  const [load, setLoad] = React.useState<Load>({ state: "loading" })
  const pageIndexRef = React.useRef(0)
  // Only the newest read counts: a slow first page never lands over a resource opened since.
  const readRef = React.useRef(0)

  const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const currentUserUuid = selfProfile?.data?.user_uuid

  const fetchPage = React.useCallback(
    async (index: number) => {
      if (!resourceId) return
      const read = ++readRef.current
      setLoad({ state: "loading" })
      try {
        const url = `${viewersEndpoint}?${idParam}=${resourceId}&pageIndex=${index}&pageSize=${PAGE_SIZE}`
        // The dialog says a failure itself, in place.
        const res = await axiosInstance.get(url, { suppressErrorToast: true })
        if (read !== readRef.current) return
        const body = res.data ?? {}
        const list = (body.data ?? []) as ResourceViewer[]
        setViewers((prev) => (index === 0 ? list : [...prev, ...list]))
        setTotal(typeof body.count === "number" ? body.count : list.length)
        setHasMore(!!body.has_more)
        pageIndexRef.current = index
        setLoad({ state: "ready" })
      } catch (error) {
        if (read !== readRef.current) return
        setLoad({ state: "failed", error, page: index })
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

  const failedFirst = load.state === "failed" && load.page === 0
  const failedMore = load.state === "failed" && load.page > 0

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

        <div className="max-h-[60vh] overflow-y-auto">
          {failedFirst ? (
            <ErrorState compact subject={`who viewed this ${noun}`} detail={refusalOf(load.error)} onRetry={() => void fetchPage(0)} />
          ) : load.state === "loading" && viewers.length === 0 ? (
            <ResourceListSkeleton label="Loading viewers" />
          ) : viewers.length === 0 ? (
            <ResourceListEmpty icon={Eye} title="No views yet" description={`People who open this ${noun} show here, most recent first.`} />
          ) : (
            <>
              {viewers.map((v) => (
                <ViewerRow key={v.user_uuid} viewer={v} isSelf={v.user_uuid === currentUserUuid} />
              ))}
              {failedMore && (
                <div role="alert" className="flex items-center justify-between gap-2 px-2 pt-2 text-xs text-muted-foreground">
                  <span>{refusalOf(load.error) ?? "Couldn't load more viewers. Nothing has been lost."}</span>
                  <Button variant="ghost" size="sm" onClick={() => void fetchPage(pageIndexRef.current + 1)}>
                    Try again
                  </Button>
                </div>
              )}
              {hasMore && !failedMore && (
                <div className="pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={load.state === "loading"}
                    onClick={() => fetchPage(pageIndexRef.current + 1)}
                  >
                    {load.state === "loading" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
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

type Load = { state: "loading" } | { state: "ready" } | { state: "failed"; error: unknown; page: number }

/** The server's own reason for a refusal (no access, the doc gone), said in place of a guess about the connection. */
function refusalOf(error: unknown): string | undefined {
  const status = apiErrorStatus(error)
  return status && status < 500 ? apiErrorMessage(error) || undefined : undefined
}

function ViewerRow({ viewer, isSelf }: { viewer: ResourceViewer; isSelf: boolean }) {
  const relative = useRelativeTime(viewer.last_viewed_at)
  const { src } = useUserAvatar(viewer.user_profile_object_key)
  const name = displayNameOf(viewer) || "Someone"

  return (
    <div className={RESOURCE_ROW}>
      <IdentityMark variant="avatar" size={28} id={avatarSeed(viewer)} label={name} src={src} />
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
