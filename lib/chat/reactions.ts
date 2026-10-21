/**
 * Reactions like Slack's (chat B25, PROGRAM.md D-M7): a person reacts to a
 * message with several emoji, each once, up to 23 of them, and a message
 * holds up to 50 different emoji. The server holds the same rule
 * (business/Reaction) and says it in words when a cap is reached; this is
 * the same rule on screen, so a click that can't be added says so at once.
 *
 * One rule for every surface that draws reactions: a channel's, a DM's and a
 * group's messages and their replies, on a computer and on a phone. Each
 * surface had its own copy of the old rule (one reaction a person, found and
 * replaced), so this replaces seven.
 */

import type { GroupedReaction } from "@/types/reaction"

/** How many emoji one person may add to one message. */
export const MAX_REACTIONS_PER_PERSON = 23
/** How many different emoji one message may hold. */
export const MAX_DISTINCT_REACTIONS = 50

/** One emoji's reactions on a message: who reacted (each person once, in order) and the reader's own. */
export interface ReactionGroup {
  /** Who reacted with it, each person once, in the order they first did. */
  names: string[]
  /** The reader's reactions with it: one, or more where an add from before made copies. */
  mine: string[]
}

/**
 * A message's reactions by emoji, in the order each emoji first appeared: who
 * reacted with it and which are the reader's. A reaction with no emoji is
 * left out; a person who holds an emoji twice (an add from before this) is
 * counted once. Pure.
 */
export function groupReactions(
  reactions: readonly GroupedReaction[] | null | undefined,
  selfId: string | undefined,
  nameOf: (r: GroupedReaction) => string,
): Map<string, ReactionGroup> {
  const groups = new Map<string, ReactionGroup>()
  const seen = new Map<string, Set<string>>()
  for (const r of reactions ?? []) {
    const emoji = r?.reaction_emoji_id
    if (!emoji) continue
    let g = groups.get(emoji)
    if (!g) {
      g = { names: [], mine: [] }
      groups.set(emoji, g)
      seen.set(emoji, new Set())
    }
    const who = r.reaction_added_by?.user_uuid ?? ""
    if (selfId && who === selfId && r.uid) g.mine.push(r.uid)
    const people = seen.get(emoji)!
    const name = nameOf(r)
    // Each person once; one with no id (a row the server answered oddly) by their name.
    const key = who || `name:${name}`
    if (!name || people.has(key)) continue
    people.add(key)
    g.names.push(name)
  }
  return groups
}

/** What a click on an emoji does. */
export type ReactionChoice =
  /** Take back the reader's reaction with it. Naming one is enough: the server takes back every copy. */
  | { kind: "remove"; reactionId: string }
  /** Add it; first when it is the reader's first reaction on the message. */
  | { kind: "add"; first: boolean }
  /** It can't be added: a cap is reached. */
  | { kind: "refuse"; title: string; description: string }

/** What a click on emojiId does, given the message's reactions. Pure. */
export function chooseReaction(groups: ReadonlyMap<string, ReactionGroup>, emojiId: string): ReactionChoice {
  const mine = groups.get(emojiId)?.mine ?? []
  if (mine.length > 0) return { kind: "remove", reactionId: mine[0] }
  let count = 0
  for (const g of groups.values()) if (g.mine.length > 0) count++
  if (count >= MAX_REACTIONS_PER_PERSON) {
    return { kind: "refuse", title: "That's the most reactions you can add", description: `You can add up to ${MAX_REACTIONS_PER_PERSON} reactions to one message.` }
  }
  if (!groups.has(emojiId) && groups.size >= MAX_DISTINCT_REACTIONS) {
    return { kind: "refuse", title: "This message is full of reactions", description: `It already has ${MAX_DISTINCT_REACTIONS} different reactions. Add one of those instead.` }
  }
  return { kind: "add", first: count === 0 }
}

/** The emoji the reader has reacted with. Pure. */
export function reactedWith(groups: ReadonlyMap<string, ReactionGroup>): Set<string> {
  const out = new Set<string>()
  for (const [emoji, g] of groups) if (g.mine.length > 0) out.add(emoji)
  return out
}

/** The groups as each emoji's names, the shape the reaction row draws. Pure. */
export function namesByEmoji(groups: ReadonlyMap<string, ReactionGroup>): { [emojiId: string]: string[] } {
  const out: { [emojiId: string]: string[] } = {}
  for (const [emoji, g] of groups) if (g.names.length > 0) out[emoji] = g.names
  return out
}
