import type { AgentCard } from "@/services/agentService"

/**
 * The agent card in words. Every line answers a question a person asks of a
 * new participant in a channel: who is this for, what will it do on its own,
 * what can it touch, and has it been kept in bounds. Pure, so the phrasing is
 * tested rather than eyeballed.
 */

const firstName = (sponsor?: string) => sponsor?.trim().split(/\s+/)[0] || ""

/** "Priya" or "its sponsor" when the account could not be resolved. */
export function sponsorName(card: Pick<AgentCard, "sponsor">): string {
  return firstName(card.sponsor) || "its sponsor"
}

export function autonomyPhrase(autonomy: string): string {
  switch (autonomy) {
    case "auto":
      return "Acts on its own"
    case "plan":
      return "Proposes a plan, then waits for a yes"
    case "approval":
    default:
      // The safe reading of anything unknown: say it asks, not that it acts.
      return "Asks before it changes anything"
  }
}

/** Where it may act. Counts, not names: a reader may not see every channel. */
export function reachPhrase(card: Pick<AgentCard, "scoped_channels" | "scoped_projects" | "sponsor">): string {
  const parts: string[] = []
  if (card.scoped_channels > 0) parts.push(`${card.scoped_channels} ${card.scoped_channels === 1 ? "channel" : "channels"}`)
  if (card.scoped_projects > 0) parts.push(`${card.scoped_projects} ${card.scoped_projects === 1 ? "project" : "projects"}`)
  if (parts.length === 0) return `Anywhere ${sponsorName(card)} can act`
  return `Only in ${parts.join(" and ")}`
}

/** What it may do, labelled; none listed means its sponsor's full set. */
export function abilitiesPhrase(card: Pick<AgentCard, "tools" | "sponsor">, label: (tool: string) => string): string {
  if (!card.tools?.length) return `Anything ${sponsorName(card)} can do`
  const names = card.tools.map(label)
  if (names.length <= 4) return names.join(", ")
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
}

/** "12 runs · 5 changes · 2 refused", or a plain sentence when it was idle. */
export function weekPhrase(card: Pick<AgentCard, "runs" | "actions" | "refusals" | "window_days">): string {
  if (card.runs === 0 && card.actions === 0 && card.refusals === 0) {
    return `Has not run in the last ${card.window_days} days`
  }
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`
  const parts = [n(card.runs, "run", "runs"), n(card.actions, "change", "changes")]
  if (card.refusals > 0) parts.push(`${card.refusals} refused`)
  return parts.join(" · ")
}
