import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { MentionPlace } from "@/lib/conversation/mentionPlace"
import { clockTime, dateTimeFormat } from "@/lib/utils/date/clock"

/**
 * The "@" list's server part for a conversation (chat P3, D-M9;
 * business/Reach MentionablesIn): who is in it, those who wrote lately first,
 * the writer's teams with how many of each are in it, the broadcasts and why
 * they notify no one here, and the zones its people set. Read once a
 * conversation and thread kind, for half a minute, as the list's keys come.
 */

export type Broadcast = "here" | "channel" | "everyone"

export interface TeamOffer {
  team_uuid: string
  name: string
  members: number
  here: number
}

export interface Mentionables {
  /** The writer, offered last. */
  me?: string
  recent: string[] | null
  members: string[] | null
  count: number
  teams: TeamOffer[] | null
  broadcasts: { name: Broadcast; count: number }[] | null
  why?: string
  /** The channel's name, for "Not in #launch". */
  name?: string
  zones?: Record<string, string>
}

const TTL_MS = 30_000
const cache = new Map<string, { at: number; answer: Promise<Mentionables | null> }>()

const keyOf = (p: MentionPlace) => `${p.kind}:${p.id}:${p.thread ? 1 : 0}`

/** The place's mentionables, or null when they can't be read (the list then offers people only). */
export function mentionablesOf(place: MentionPlace, now: number = Date.now()): Promise<Mentionables | null> {
  const key = keyOf(place)
  const hit = cache.get(key)
  if (hit && now - hit.at < TTL_MS) return hit.answer
  const answer = axiosInstance
    .get<{ data: Mentionables }>(
      `/conversations/${place.kind}/${encodeURIComponent(place.id)}/mentionables${place.thread ? "?thread=1" : ""}`,
      OWN_ERRORS,
    )
    .then((res) => res.data?.data ?? null)
    .catch(() => {
      cache.delete(key)
      return null
    })
  cache.set(key, { at: now, answer })
  return answer
}

/** Forgets every place's mentionables (tests). */
export function forgetMentionables() {
  cache.clear()
}

/** The words a broadcast row reads. */
export const BROADCAST_WORDS: Record<Broadcast, string> = {
  here: "Notify everyone here now",
  channel: "Notify everyone in this channel",
  everyone: "Notify everyone in the workspace channel",
}

/** A person as the list ranks them. */
export interface Ranked<P> {
  person: P
  /** In the conversation (false: "Not in #x"); undefined when the list can't say. */
  here?: boolean
}

/**
 * D-M9's order for the people matched: those in the conversation, the most
 * recently active first (then as matched), then those who aren't, and the
 * writer last. Agents are the caller's to place. Pure.
 */
export function rankPeople<P extends { user_uuid: string }>(matched: P[], m: Mentionables | null, me: string | undefined): Ranked<P>[] {
  if (!m) return matched.map((person) => ({ person }))
  const members = new Set((m.members ?? []).map((id) => id.toLowerCase()))
  const complete = (m.members?.length ?? 0) >= m.count
  const recent = new Map((m.recent ?? []).map((id, i) => [id.toLowerCase(), i]))
  const rank = (p: P) => {
    const id = p.user_uuid.toLowerCase()
    if (me && id === me.toLowerCase()) return 3e6
    if (members.has(id)) return recent.get(id) ?? 1e6
    return complete ? 2e6 : 1e6 + 1
  }
  return matched
    .map((person, i) => ({ person, i, r: rank(person) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ person }) => {
      const id = person.user_uuid.toLowerCase()
      return { person, here: members.has(id) ? true : complete ? false : undefined }
    })
}

/** "12:31 AM where they are" when it's night there (22:00 to 07:00), in the reader's own clock (lib/utils/date/clock); else "". Pure but for the locale. */
export function nightFor(zone: string | undefined, now: Date = new Date()): string {
  if (!zone) return ""
  let hour: number
  try {
    // The hour there, to decide night: not a time anyone reads.
    hour = Number(dateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now))
  } catch {
    return ""
  }
  if (!Number.isFinite(hour) || (hour >= 7 && hour < 22)) return ""
  return `${clockTime(now, { timeZone: zone })} where they are`
}

/** The people part of the "@" list in D-M9's order, and what each row says. */
export interface PeopleOrder<P> {
  /** In the conversation (recent first), then agents, then those who aren't, then the writer. */
  head: P[]
  agents: P[]
  others: P[]
  mine: P[]
  /** Who isn't in the conversation: "Not in #launch". */
  notHere: Set<string>
  /** "12:31 AM where they are", by uuid, when it's night there. */
  night: Record<string, string>
}

/** Orders matched people for the "@" list (D-M9). Pure but for the clock. */
export function orderPeople<P extends { user_uuid: string; is_bot?: boolean }>(
  matched: P[], m: Mentionables | null, now: Date = new Date(),
): PeopleOrder<P> {
  const ranked = rankPeople(matched.filter((p) => !p.is_bot), m, m?.me)
  const me = m?.me?.toLowerCase()
  const isMe = (p: P) => !!me && p.user_uuid.toLowerCase() === me
  const night: Record<string, string> = {}
  for (const { person } of ranked) {
    const words = nightFor(m?.zones?.[person.user_uuid.toLowerCase()] ?? m?.zones?.[person.user_uuid], now)
    if (words) night[person.user_uuid] = words
  }
  return {
    head: ranked.filter((r) => r.here !== false && !isMe(r.person)).map((r) => r.person),
    agents: matched.filter((p) => p.is_bot),
    others: ranked.filter((r) => r.here === false && !isMe(r.person)).map((r) => r.person),
    mine: ranked.filter((r) => isMe(r.person)).map((r) => r.person),
    notHere: new Set(ranked.filter((r) => r.here === false).map((r) => r.person.user_uuid)),
    night,
  }
}
