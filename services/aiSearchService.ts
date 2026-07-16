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

export interface UnifiedSearchResponse {
  enabled: boolean
  query: string
  groups: UnifiedSearchGroup[]
}

export async function unifiedSearch(query: string): Promise<UnifiedSearchResponse> {
  const res = await axiosInstance.post(PostEndpointUrl.AIUnifiedSearch, { query })
  return (
    res.data?.data ?? {
      enabled: false,
      query,
      groups: [],
    }
  )
}

/**
 * A grounded, cited AI answer synthesized over the same unified-search corpus.
 * Each citation is a real, permission-scoped hit the caller can click through
 * to (workspace routing fields, or an external url). Marker [n] in `answer`
 * maps to the citation with `index === n`.
 */
export interface SearchCitation {
  index: number
  source: UnifiedSource
  title: string
  snippet?: string
  meta?: string
  url?: string
  kind?: string

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

export interface UnifiedAnswerResponse {
  enabled: boolean
  query: string
  answer: string
  citations: SearchCitation[]
  note?: string
  provider?: string
}

export async function unifiedSearchAnswer(query: string): Promise<UnifiedAnswerResponse> {
  const res = await axiosInstance.post(PostEndpointUrl.AIUnifiedSearchAnswer, { query })
  return (
    res.data?.data ?? {
      enabled: false,
      query,
      answer: "",
      citations: [],
    }
  )
}
