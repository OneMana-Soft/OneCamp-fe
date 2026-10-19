import { chatPath } from "@/lib/routes/conversationRoute"
import { app_channel_path } from "@/types/paths"

/**
 * System lines: a message the server writes into a conversation about the
 * conversation itself ("Maya added Priya"), never a person's words
 * (business/Conversation systemLine.go). A row is one when its post_kind or
 * chat_kind is "system"; its post_system or chat_system holds the facts as
 * JSON, and its body holds the words, which is what the line shows: the
 * server named everyone in them when it wrote it. The facts say where a line
 * leads, and are never shown as they are.
 *
 * A line is never notified, counted unread, edited, deleted, replied to or
 * reacted to, so it's drawn as a line, without a message's actions.
 */

export const SYSTEM_KIND = "system"

/** The kinds the server writes today; a kind added later still draws as a line, without a link. */
type SystemLineKind =
  | "group.started"
  | "group.continued"
  | "group.renamed"
  | "history.shared"
  | "group.channel"
  | "channel.from_group"

/** A line's facts, as the server wrote them: people by their uuids. */
export interface SystemLineFacts {
  kind: SystemLineKind | (string & {})
  actor?: string
  targets?: string[]
  from?: string
  to?: string
  name?: string
  count?: number
}

/** Whether a row's kind is a system line's. Pure. */
export function isSystemLine(kind: string | null | undefined): boolean {
  return kind === SYSTEM_KIND
}

/** A line's facts, or null when there are none it can read. Never throws. Pure. */
export function readSystemLine(json: string | null | undefined): SystemLineFacts | null {
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.kind !== "string" || !r.kind) return null
  const text = (v: unknown) => (typeof v === "string" && v ? v : undefined)
  return {
    kind: r.kind,
    actor: text(r.actor),
    targets: Array.isArray(r.targets) ? r.targets.filter((t): t is string => typeof t === "string" && t !== "") : undefined,
    from: text(r.from),
    to: text(r.to),
    name: text(r.name),
    count: typeof r.count === "number" && Number.isFinite(r.count) ? r.count : undefined,
  }
}

/** Where a line leads, in its words. */
export interface SystemLineLink {
  href: string
  label: string
}

/**
 * Where a line leads the person reading it, or null when nowhere:
 *   - the conversation people were added from leads to the group it continues in;
 *   - a group opened for a new set leads back to the one it continues, for
 *     the people who were in it (those added weren't, and can't open it);
 *   - a group made into a private channel leads to the channel.
 * A DM's id is both people's ids, so its link needs who is reading; until
 * that's known it leads nowhere rather than to the wrong person. Pure.
 */
export function systemLineLink(facts: SystemLineFacts | null, viewerUUID: string | null | undefined): SystemLineLink | null {
  if (!facts) return null
  switch (facts.kind) {
    case "group.continued": {
      const href = facts.to ? chatPath(facts.to, viewerUUID) : null
      return href ? { href, label: "Open the new conversation" } : null
    }
    case "group.started": {
      if (!facts.from || !viewerUUID || facts.targets?.includes(viewerUUID)) return null
      const href = chatPath(facts.from, viewerUUID)
      return href ? { href, label: "See the earlier conversation" } : null
    }
    case "group.channel":
      return facts.to ? { href: `${app_channel_path}/${facts.to}`, label: facts.name ? `Open #${facts.name}` : "Open the channel" } : null
    default:
      return null
  }
}
