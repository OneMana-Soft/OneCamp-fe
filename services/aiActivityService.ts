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
  status?: string // succeeded | failed | running
  source?: string // trigger source / audit category
  at: string // RFC3339
  agent_id?: string
  run_id?: string
}
