"use client"

// Entity links: a task or project can link docs and boards. Reads use SWR
// (useFetch) so links are cached, deduped and revalidated like the rest of the
// app; mutations go through usePost and write their fresh, access-filtered
// result straight into the SWR cache, so add/remove need no refetch.

import { useCallback, useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"

export type LinkSourceType = "task" | "project"
export type LinkRefType = "doc" | "board"

export interface LinkedDoc {
  doc_uuid: string
  doc_title?: string
  doc_private?: boolean
  doc_read_access?: number
}

export interface LinkedBoard {
  board_uuid: string
  board_title?: string
  board_private?: boolean
  board_read_access?: number
  board_thumbnail_key?: string
}

interface LinksPayload {
  docs?: LinkedDoc[] | null
  boards?: LinkedBoard[] | null
}

// The backend envelope is { msg, data: { docs, boards } }; useFetch returns the
// raw envelope, while usePost unwraps to the inner `data`.
interface LinksEnvelope {
  data?: LinksPayload
}

export function useEntityLinks(sourceType: LinkSourceType, sourceUUID: string) {
  const { toast } = useToast()
  const { makeRequest, isSubmitting: mutating } = usePost()

  const key = sourceUUID ? `${GetEndpointUrl.GetSourceLinks}/${sourceType}/${sourceUUID}` : ""
  const { data, isLoading, isError, mutate } = useFetch<LinksEnvelope>(key)

  const docs = useMemo<LinkedDoc[]>(() => data?.data?.docs ?? [], [data])
  const boards = useMemo<LinkedBoard[]>(() => data?.data?.boards ?? [], [data])

  // A 401/403 from the (access-gated) read means the viewer isn't a member of
  // the source's project and may not manage links.
  const status = (isError as { response?: { status?: number } } | undefined)?.response?.status
  const forbidden = status === 401 || status === 403

  // Write a fresh links payload into the SWR cache without revalidating.
  const writeCache = useCallback(
    (payload?: LinksPayload) => {
      void mutate({ data: { docs: payload?.docs ?? [], boards: payload?.boards ?? [] } }, { revalidate: false })
    },
    [mutate],
  )

  // True only when the response actually carries a links payload. The
  // mutation endpoints normally return the fresh list, but their rare
  // error-fallback path returns just a message; in that case we must
  // revalidate rather than write empty arrays (which would wipe the list).
  const hasPayload = (res?: LinksPayload | null) =>
    !!res && (Array.isArray(res.docs) || Array.isArray(res.boards))

  const addLink = useCallback(
    async (refType: LinkRefType, refUUID: string) => {
      try {
        const res = await makeRequest<
          { source_type: string; source_uuid: string; ref_type: string; ref_uuid: string },
          LinksPayload
        >({
          apiEndpoint: PostEndpointUrl.AddEntityLink,
          payload: { source_type: sourceType, source_uuid: sourceUUID, ref_type: refType, ref_uuid: refUUID },
          showErrorToast: false,
        })
        if (hasPayload(res)) writeCache(res)
        else void mutate()
      } catch {
        toast({ title: "Could not link", description: "Please try again.", variant: "destructive" })
      }
    },
    [sourceType, sourceUUID, makeRequest, writeCache, mutate, toast],
  )

  const removeLink = useCallback(
    async (refType: LinkRefType, refUUID: string) => {
      // Optimistic removal for snappy UX; the response is authoritative.
      const optimistic: LinksPayload = {
        docs: refType === "doc" ? docs.filter((d) => d.doc_uuid !== refUUID) : docs,
        boards: refType === "board" ? boards.filter((b) => b.board_uuid !== refUUID) : boards,
      }
      void mutate({ data: optimistic }, { revalidate: false })
      try {
        const res = await makeRequest<
          { source_type: string; source_uuid: string; ref_type: string; ref_uuid: string },
          LinksPayload
        >({
          apiEndpoint: PostEndpointUrl.RemoveEntityLink,
          payload: { source_type: sourceType, source_uuid: sourceUUID, ref_type: refType, ref_uuid: refUUID },
          showErrorToast: false,
        })
        if (hasPayload(res)) writeCache(res)
        else void mutate() // confirm the optimistic change against the server
      } catch {
        toast({ title: "Could not unlink", description: "Please try again.", variant: "destructive" })
        void mutate() // revalidate from server to undo the optimistic change
      }
    },
    [sourceType, sourceUUID, docs, boards, mutate, makeRequest, writeCache, toast],
  )

  const hasLink = useCallback(
    (refType: LinkRefType, refUUID: string) =>
      refType === "doc" ? docs.some((d) => d.doc_uuid === refUUID) : boards.some((b) => b.board_uuid === refUUID),
    [docs, boards],
  )

  return { docs, boards, isLoading, mutating, forbidden, addLink, removeLink, hasLink, reload: mutate }
}
