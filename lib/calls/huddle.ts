import type { CallKind } from "@/lib/calls/callRef"

// A huddle's post (slack-06, business/Huddle): its facts are in post_system or chat_system.
export const HUDDLE_KIND = "huddle"

export interface HuddleFace {
  uuid: string
  name: string
}

export interface HuddleFacts {
  session: string
  started?: string
  ended?: string
  seconds: number
  came: HuddleFace[]
  people: number
  missed: boolean
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

/** A huddle post's facts, read; null for anything that isn't one. Pure. */
export function readHuddleFacts(system: string | undefined): HuddleFacts | null {
  let f: Record<string, unknown>
  try {
    f = JSON.parse(system || "")
  } catch {
    return null
  }
  if (!f || typeof f !== "object" || !str(f.session)) return null
  const came = Array.isArray(f.came) ? f.came.filter((c) => c && str(c.uuid)).map((c) => ({ uuid: str(c.uuid), name: str(c.name) || "Someone" })) : []
  return {
    session: str(f.session),
    started: str(f.started) || undefined,
    ended: str(f.ended) || undefined,
    seconds: typeof f.seconds === "number" && f.seconds > 0 ? f.seconds : 0,
    came,
    people: typeof f.people === "number" ? f.people : came.length,
    missed: f.missed === true,
  }
}

/** A row's conversation, from its actions' ids. Pure. */
export function conversationOf(c: { channelUUID?: string; groupUUID?: string; chatUUID?: string }): { kind: CallKind; id: string } | undefined {
  if (c.channelUUID) return { kind: "channel", id: c.channelUUID }
  if (c.groupUUID) return { kind: "group", id: c.groupUUID }
  return c.chatUUID ? { kind: "chat", id: c.chatUUID } : undefined
}
