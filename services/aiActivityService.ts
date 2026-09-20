/**
 * Unified AI activity timeline — wraps GET /admin/ai/activity.
 *
 * One newest-first feed of what the AI did across the workspace: autonomous
 * agent runs and AI-attributable audit entries (web search, public-API/MCP
 * tool calls, AI config changes). Admin governance + debugging surface.
 */

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { downloadBlob } from "@/lib/utils/download"

export type AIActivityKind = "agent_run" | "audit"

export interface AIActivityItem {
  kind: AIActivityKind
  title: string
  actor?: string
  summary: string
  /**
   * succeeded | failed | running | allowed | refused.
   *
   * "refused" is the permission system answering, not an error: the agent was
   * stopped because the person behind it could not have done the thing. It is
   * presented as such rather than beside real failures.
   */
  status?: string
  source?: string // trigger source / audit category
  at: string // RFC3339
  agent_id?: string
  run_id?: string

  /**
   * Where this sits in the audit chain, on the rows that came from it.
   *
   * The feed is the readable account of an event and the audit log is the
   * provable one; carrying the position and the hash pair is what makes them
   * one story rather than two. Both hashes or neither: a single fingerprint
   * demonstrates nothing, since anyone can hash a row they just wrote. The link
   * is the claim.
   *
   * Absent on an agent run, which is not a chain entry and has no position to
   * report.
   */
  seq?: number
  prev_hash?: string
  entry_hash?: string
  /**
   * Who started the run, as distinct from whose authority it carried:
   * "person", "schedule", "event", "handoff" or "eval". Read from the same
   * audit row an auditor reads, so a member's feed and the log agree about
   * whether anybody was there. Absent when the row never said.
   */
  initiator?: string
}

/** The kinds the server counts as nobody watching. Mirrors Initiator.Unattended on the server. */
export const UNATTENDED_INITIATORS = new Set(["schedule", "event", "handoff"])

/** A short, honest phrase for a row's initiator, or "" for a row that never said. */
export function initiatorLabel(initiator?: string): string {
  if (!initiator) return ""
  return UNATTENDED_INITIATORS.has(initiator) ? `${initiator}, nobody watching` : initiator
}

/**
 * downloadMyAIRecord saves the caller's own AI record as a file.
 *
 * Fetched through the authed client and saved locally rather than linked
 * directly, so it works wherever the session does and does not depend on a
 * cross-origin download carrying a cookie.
 *
 * What lands on disk is the rows, the recipe for recomputing each row's hash,
 * and what that does and does not prove. The point of the file is that it
 * still means something away from this workspace.
 */
export async function downloadMyAIRecord(): Promise<void> {
    const res = await axiosInstance.get(GetEndpointUrl.MyAIActivityProof, { responseType: "blob" })
    downloadBlob(res.data as BlobPart, "application/json", "onecamp-ai-record.json")
}
