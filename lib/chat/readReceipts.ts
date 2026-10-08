// Read receipts in DMs and group chats: who has seen the conversation, up to
// when (GET /dm/seen/{user} and /groupChat/seen/{grp}). The server decides
// whether they show at all (the workspace, the person, the size) and says so
// in `on`; this file turns them into the line under your latest message.

import { nameList } from "@/lib/utils/format/nameList"
import { GetEndpointUrl } from "@/services/endPoints"

export interface SeenBy {
  user_uuid: string
  /** The conversation is seen up to this moment. */
  seen_at: string
}

export interface Receipts {
  on: boolean
  seen: SeenBy[]
}

/** A conversation: a DM, by the other person, or a group chat, by its id. */
export type ChatTarget = { kind: "dm"; otherUUID: string } | { kind: "group"; grpId: string }

/** Where a conversation's receipts are read and marked (GET and POST share it). */
export function receiptsKey(t: ChatTarget): string {
  return t.kind === "dm" ? `${GetEndpointUrl.DmSeen}/${t.otherUUID}` : `${GetEndpointUrl.GroupChatSeen}/${t.grpId}`
}

/**
 * The key a live receipt updates. A DM's grouping id is two people's ids with
 * a space between; in a DM, whoever saw it is the other person.
 */
export function receiptsKeyForEvent(grpId: string, userUUID: string): string {
  return grpId.includes(" ") ? receiptsKey({ kind: "dm", otherUUID: userUUID }) : receiptsKey({ kind: "group", grpId })
}

/** Receipts with one person's mark moved up to at; a mark never moves back. */
export function withSeen(r: Receipts, userUUID: string, at: string): Receipts {
  const was = r.seen.find((s) => s.user_uuid === userUUID)
  if (was && Date.parse(was.seen_at) >= Date.parse(at)) return r
  return { ...r, seen: [...r.seen.filter((s) => s.user_uuid !== userUUID), { user_uuid: userUUID, seen_at: at }] }
}

const time = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })

/**
 * The line under your latest message, or null when there's none to show:
 * receipts are off, the latest message isn't yours, or nobody has seen it.
 * In a DM it's "Seen"; in a group, who ("Seen by Maya and Jonas"), or
 * "Seen by everyone" once all the others have. The title says when.
 */
export function seenLine(
  r: Receipts | undefined,
  latest: { mine: boolean; createdAt: string } | undefined,
  opts: { dm: boolean; others: number; nameOf: (uuid: string) => string },
): { text: string; title: string } | null {
  if (!r?.on || !latest?.mine) return null
  const sent = Date.parse(latest.createdAt)
  const who = r.seen
    .filter((s) => Date.parse(s.seen_at) > sent)
    .sort((a, b) => Date.parse(a.seen_at) - Date.parse(b.seen_at))
  if (who.length === 0) return null
  const title = who.map((s) => `${opts.nameOf(s.user_uuid)} · ${time(s.seen_at)}`).join("\n")
  if (opts.dm) return { text: "Seen", title: `Seen ${time(who[0].seen_at)}` }
  if (opts.others > 1 && who.length >= opts.others) return { text: "Seen by everyone", title }
  return { text: `Seen by ${nameList(who.map((s) => opts.nameOf(s.user_uuid)))}`, title }
}
