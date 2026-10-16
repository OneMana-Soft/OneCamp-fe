"use client"

/**
 * Reads, as a doc opens, whether its owner lets it into workspace exports, so
 * the doc's More menu offers the switch at once. Only the owner of a private
 * doc asks (after a hand-over, its new owner, as the server decides): the
 * doc's details and the profile are the page's own reads (DocView), shared
 * through their keys, so nothing else is fetched for any other doc. A
 * session-slot contribution: no UI of its own.
 */
import { useEffect } from "react"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { docInfoKey } from "@/lib/docCache"
import { GetEndpointUrl } from "@/services/endPoints"
import type { DocInfoResponse } from "@/types/doc"
import type { UserProfileInterface } from "@/types/user"
import { loadConsent } from "./consent"

export default function ConsentPrefetch({ docId }: { docId: string }) {
  const doc = useFetch<DocInfoResponse>(docInfoKey(docId), undefined, undefined, { suppressErrorToast: true } as never).data?.data
  const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data
  const owner = doc?.doc_owner?.user_uuid || doc?.doc_created_by?.user_uuid
  const ownsPrivate = !!doc?.doc_private && !!me?.user_uuid && owner === me.user_uuid
  useEffect(() => {
    if (ownsPrivate) void loadConsent(docId)
  }, [docId, ownsPrivate])
  return null
}
