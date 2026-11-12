/**
 * "Start a call in..." on a board's Call (miro-27, calls with the board): where the board was called before, from its
 * own calls (lib/calls/boardCall: the server answers only the calls whose conversation the reader may open), and
 * where the search's picks start one. One person is their DM, several a group of them (made the chat's own way, Add
 * people: components/board/boardCallStart), a channel or a group itself. Pure.
 */

import type { BoardCalls, ConversationCallRef } from "@/lib/calls/boardCall"
import { callRefOf } from "@/lib/calls/callRef"
import type { SearchPlace } from "@/lib/search/userAndChannel"

export interface PastPlace {
  ref: ConversationCallRef
  /** When the latest call there with the board started. */
  at: string
}

/** The conversations the board was called in, each once, the latest call first. Pure. */
export function pastPlaces(calls: BoardCalls | null): PastPlace[] {
  if (!calls) return []
  const all = [...calls.live, ...calls.past].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  const seen = new Set<string>()
  const out: PastPlace[] = []
  for (const call of all) {
    const key = `${call.ref.kind}:${call.ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ref: call.ref, at: call.startedAt })
  }
  return out
}

/** Where the picks start a call: a conversation, people to make a group of, or null for none. Pure. */
export type CallStart = { ref: ConversationCallRef } | { people: string[] } | null

export function startOf(picked: SearchPlace[], selfUUID: string): CallStart {
  if (!selfUUID || picked.length === 0) return null
  const places = picked.filter((p) => p.type !== "user")
  if (places.length > 0) {
    if (picked.length !== 1) return null
    const p = places[0]
    return { ref: { kind: p.type === "channel" ? "channel" : "group", id: p.id } }
  }
  const people = [...new Set(picked.map((p) => p.id))].filter((id) => id !== selfUUID)
  if (people.length === 0) return null
  if (people.length === 1) {
    const ref = callRefOf("chat", people[0], selfUUID)
    return ref ? { ref: ref as ConversationCallRef } : null
  }
  return { people }
}
