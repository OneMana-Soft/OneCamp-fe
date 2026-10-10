/**
 * Unified AI search — wraps POST /ai/search.
 *
 * One query, fanned out server-side across the user's workspace content and
 * their connected external accounts (Gmail, GitHub), returned grouped by
 * source. Everything is permission/owner-scoped on the backend; workspace hits
 * carry deep-link routing fields, external hits carry an absolute URL.
 */

import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

/**
 * A search is a read sent as a POST. Unflagged, a request that got no answer
 * raised the write's toast, "Couldn't reach the server. Your change wasn't
 * saved.", on a search. Every caller already treats a failure as no extra
 * results (the palette, the search page's answer and connected apps), and the
 * offline notice says the server can't be reached.
 */
const AS_A_READ = { suppressErrorToast: true } as Record<string, unknown>

export type UnifiedSource = "workspace" | "memory" | "gmail" | "github"

export interface UnifiedHit {
  source: UnifiedSource
  title: string
  snippet: string
  meta?: string
  url?: string // external deep-link (gmail/github)
  kind?: string // memory items: decision | commitment | question

  // Workspace deep-link routing (empty for external hits).
  content_type?: string
  content_uuid?: string
  channel_uuid?: string
  channel_name?: string
  project_uuid?: string
  chat_grp_id?: string
  chat_by_user_id?: string
  chat_to_user_id?: string
  post_uuid?: string
  task_uuid?: string
  doc_uuid?: string
}

export interface UnifiedSearchGroup {
  source: UnifiedSource
  label: string
  connected: boolean
  hits: UnifiedHit[]
  note?: string
}

interface UnifiedSearchResponse {
  enabled: boolean
  query: string
  groups: UnifiedSearchGroup[]
}

// signal lets a caller abandon a search that is no longer wanted — the user typed
// on, navigated away, or pressed Stop. Aborting also releases the server side:
// the handler's context is the request's, so a cancelled search stops fanning out
// instead of finishing work nobody will read.
export async function unifiedSearch(query: string, signal?: AbortSignal): Promise<UnifiedSearchResponse> {
  const res = await axiosInstance.post(PostEndpointUrl.AIUnifiedSearch, { query }, { signal, ...AS_A_READ })
  return (
    res.data?.data ?? {
      enabled: false,
      query,
      groups: [],
    }
  )
}

// isAbortedRequest reports whether a rejection is "we cancelled it", so a caller
// can stay silent instead of showing an error for something the user asked to
// stop. Covers both axios' own cancellation and a raw DOMException abort.
export function isAbortedRequest(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: string; name?: string; message?: string }
  return e.code === "ERR_CANCELED" || e.name === "AbortError" || e.name === "CanceledError"
}
