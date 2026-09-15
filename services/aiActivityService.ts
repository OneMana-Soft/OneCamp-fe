/**
 * Unified AI activity timeline — wraps GET /admin/ai/activity.
 *
 * One newest-first feed of what the AI did across the workspace: autonomous
 * agent runs and AI-attributable audit entries (web search, public-API/MCP
 * tool calls, AI config changes). Admin governance + debugging surface.
 */

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
}
