import { getGroupingId } from "@/lib/utils/getGroupingId"
import type { ConversationRef } from "@/lib/conversation/types"

/**
 * The Link Router (chat A1, PROGRAM.md CH13): the one rule for links to a
 * conversation and to a message in one, for every source (push taps, email,
 * search, Activity, Later, Home, the AI's citations, the desktop app), and its
 * inverse. parse(route(place)) is place, for every place. The server's copy of
 * the rule is business/Conversation Ref.Route (helpers.ChatPath).
 *
 *   a channel                 /app/channel/<channel uuid>[/<post>]
 *   a DM                      /app/chat/<the other person>[/<message>]
 *   a group                   /app/chat/group/<grouping id>[/<message>]
 *
 * With a message, the conversation opens at it with its thread. A DM's path
 * names the other person, so a DM's place needs who reads it to be built
 * from a path or a grouping id: until that's known there is no place, rather
 * than one with the wrong person.
 */

/** Where a conversation link opens: a conversation, and a message in it. */
export interface ConversationPlace {
  conversation: ConversationRef
  message?: string
}

/** A conversation's own pages under its path, never a message's id. */
const PAGES = new Set(["recording"])

/**
 * The conversation a grouping id names for who reads it: a DM's id is both
 * people's ids with a space between, a group's has none. Null for no id, or a
 * DM while the reader isn't known. Pure.
 */
export function chatRef(groupingId: string | null | undefined, viewer: string | null | undefined): ConversationRef | null {
  const id = (groupingId ?? "").trim()
  if (!id) return null
  const people = id.split(" ").filter(Boolean)
  if (people.length < 2) return { kind: "group", id: people[0] }
  if (!viewer) return null
  // A DM with yourself is a real one (notes to self): its other is you.
  const other = people.find((p) => p !== viewer) ?? people[0]
  return { kind: "dm", id: getGroupingId(people[0], people[1]), other }
}

/** The DM with other, for who reads it; null while the reader isn't known. Pure. */
export function dmWith(other: string, viewer: string | null | undefined): Extract<ConversationRef, { kind: "dm" }> | null {
  return other && viewer ? { kind: "dm", id: getGroupingId(viewer, other), other } : null
}

/** The path a place opens at. Pure. */
export function route(place: ConversationPlace): string {
  const c = place.conversation
  const base =
    c.kind === "channel" ? `/app/channel/${c.id}` :
    c.kind === "dm" ? `/app/chat/${c.other}` :
    `/app/chat/group/${c.id}`
  return place.message ? `${base}/${place.message}` : base
}

/** One path segment as an id: decoded, and never empty or a page's name. */
function idOf(segment: string | undefined): string | null {
  if (!segment) return null
  let id: string
  try {
    id = decodeURIComponent(segment)
  } catch {
    return null
  }
  return id && !id.includes("/") && !PAGES.has(id) ? id : null
}

/**
 * The place a path opens, or null when it isn't a conversation's (or a DM's
 * while the reader isn't known). A query or fragment is ignored. Pure.
 */
export function parse(path: string, viewer: string | null | undefined): ConversationPlace | null {
  const bare = path.split(/[?#]/)[0]
  const parts = bare.split("/").filter(Boolean)
  if (parts[0] !== "app") return null
  const message = (at: number) => {
    if (parts.length <= at) return {}
    if (parts.length > at + 1) return null
    const id = idOf(parts[at])
    return id ? { message: id } : null
  }
  if (parts[1] === "channel") {
    const id = idOf(parts[2])
    const m = message(3)
    return id && m ? { conversation: { kind: "channel", id }, ...m } : null
  }
  if (parts[1] !== "chat") return null
  if (parts[2] === "group") {
    const id = idOf(parts[3])
    const m = message(4)
    return id && m ? { conversation: { kind: "group", id }, ...m } : null
  }
  const other = idOf(parts[2])
  const m = message(3)
  if (!other || !m || !viewer) return null
  return { conversation: { kind: "dm", id: getGroupingId(viewer, other), other }, ...m }
}
