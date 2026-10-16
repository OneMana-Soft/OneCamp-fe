import { initiatorLabel, type AIActivityItem } from "@/services/aiActivityService"

/**
 * Who acted, for one entry of the agents record (hub.md AI14).
 *
 * THE RECORD NAMED NO AGENT (11 Oct). Every row on the demo read "An agent
 * acted as you", because the row only knew the family of the action
 * ("agent.", "mcp."...). The data says more than that:
 *
 *   - an agent run carries the agent's name as its title;
 *   - an audit row will carry `agent_name` once the server passes it on (it
 *     holds the agent's id in the row's metadata today and drops it);
 *   - a row may carry `agent_id`, which names the agent when it is one of the
 *     reader's own (the /agents list);
 *   - the governance drill's rows ("agent.drill.*") are the drill, which drives
 *     the permission check directly with no model and no named agent, so they
 *     are named as the drill, never as somebody's agent;
 *   - "ai." rows are the assistant itself, OneCamp AI.
 *
 * Only what none of these names stays "An agent", and an agent run whose
 * agent has gone reads "An agent (removed)".
 */
export type RecordActorKind = "agent" | "assistant" | "drill" | "tool" | "app"

export interface RecordActor {
  name: string
  kind: RecordActorKind
  /** True when the name is a real name rather than a family ("An agent"). */
  named: boolean
  /** A key for the agent's identity colour and square. */
  key: string
  /** The row is a practice run of the governance drill. */
  drill: boolean
}

const FAMILY: [prefix: string, name: string, kind: RecordActorKind][] = [
  ["mcp.", "A connected tool", "tool"],
  ["api.", "An app with your key", "app"],
  ["agent.", "An agent", "agent"],
]

export const ASSISTANT_NAME = "OneCamp AI"
export const DRILL_NAME = "The governance drill"

export function isDrill(it: Pick<AIActivityItem, "title">): boolean {
  return Boolean(it.title?.startsWith("agent.drill."))
}

export function recordActor(it: AIActivityItem, agentNames?: ReadonlyMap<string, string>): RecordActor {
  const drill = isDrill(it)
  const byId = it.agent_id ? agentNames?.get(it.agent_id) : undefined
  if (it.kind === "agent_run") {
    const name = it.agent_name?.trim() || it.title?.trim() || byId
    if (name) return { name, kind: "agent", named: true, key: it.agent_id || name, drill }
    return { name: "An agent (removed)", kind: "agent", named: false, key: it.agent_id || "agent", drill }
  }
  const sent = it.agent_name?.trim() || byId
  if (sent) return { name: sent, kind: "agent", named: true, key: it.agent_id || sent, drill }
  if (drill) return { name: DRILL_NAME, kind: "drill", named: true, key: "drill", drill }
  if (it.title?.startsWith("ai.")) return { name: ASSISTANT_NAME, kind: "assistant", named: true, key: "onecamp-ai", drill }
  const hit = FAMILY.find(([prefix]) => it.title?.startsWith(prefix))
  if (hit) return { name: hit[1], kind: hit[2], named: false, key: hit[0], drill }
  return { name: ASSISTANT_NAME, kind: "assistant", named: true, key: "onecamp-ai", drill }
}

/**
 * The evidence's "Started by" and "Source" (hub.md AI15), in words: the rows
 * said "person" and "agent", the audit row's own codes. Unknown codes are
 * shown as they are, so nothing the server says is hidden.
 */
const STARTED_BY: Record<string, string> = {
  person: "A person",
  schedule: "A schedule, nobody watching",
  event: "An event, nobody watching",
  handoff: "A handoff from another agent, nobody watching",
  eval: "An evaluation run",
}
export function startedByWords(initiator?: string): string {
  if (!initiator) return ""
  return STARTED_BY[initiator] ?? initiatorLabel(initiator)
}

const SOURCE: Record<string, string> = {
  agent: "An agent",
  human: "A person",
  system: "OneCamp itself",
  mcp: "A connected tool",
  api: "An app with your key",
}
export function sourceWords(source?: string): string {
  if (!source) return ""
  return SOURCE[source] ?? source
}
