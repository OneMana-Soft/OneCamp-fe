/**
 * Opening a doc before it is opened (docs programme A2, prefetch on intent).
 *
 * A pointer resting on a link to a doc, keyboard focus on it, or a touch,
 * gives notice a few hundred milliseconds before the click. That is enough to
 * fetch the doc's details into the cache the page reads (SWR) and to start its
 * live session on the tab's socket (lib/collabSession.ts), so the page finds
 * the doc's details ready and an editor already synced.
 *
 * This module is loaded on intent (IntentLink imports it with import()), never
 * with the page: it brings Yjs and the collaboration provider, which Home's
 * first load must not carry (app/firstLoad.test.ts).
 *
 * At most once a minute per doc; a session nobody opens closes after half a
 * minute (lib/collabSession.ts).
 */
"use client"

import axiosInstance from '@/lib/axiosInstance'
import { prefetchCollabSession } from '@/lib/collabSession'
import { appMutate, cachedData } from '@/lib/swrMutate'
import { GetEndpointUrl } from '@/services/endPoints'

/** Prefetches a doc's details and session; false when it was prefetched in the last minute. */
export function prefetchDoc(docId: string): boolean {
  // The same key DocView's useFetch reads. An answer already there (the page
  // got there first) is kept; only an empty entry is filled.
  const key = `${GetEndpointUrl.GetDocInfo}/${docId}`
  // A folder, a file or a link has no live copy (docs F1b): when the app
  // already knows that's what this is (its row said so), no session starts.
  if (!docId || cachedData<{ data?: { doc_node_kind?: string } }>(key)?.data?.doc_node_kind) return false
  if (!prefetchCollabSession(docId)) return false
  axiosInstance
    .get(key)
    .then((res) => appMutate(key, (current: unknown) => current ?? res.data, { revalidate: false }))
    .catch(() => {
      // Not readable, or offline: the page asks again and says so itself.
    })
  return true
}
