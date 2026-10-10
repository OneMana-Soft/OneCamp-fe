import type { FlatItem } from "@/types/virtual"

/**
 * Which messages continue the one above them: the same person, writing again
 * within five minutes. A continued message is drawn without its avatar and
 * name (the time shows on hover), the way a conversation reads in Slack or
 * Linear, so a burst of short messages reads as one turn instead of a column
 * of repeated headers.
 *
 * Pure and list-level: a row cannot know what is above it, and the answer
 * changes only when the list does (a live insert, older messages loading, a
 * delete). Reactions and edits change a message but never its author or time,
 * so they never change the grouping.
 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000

export interface Groupable {
  /** Who wrote it: a user's uuid. */
  author: string | null | undefined
  /** When: an ISO string, or epoch seconds as the API sometimes sends. */
  at: string | number | null | undefined
  /**
   * Bots never group: one bot account speaks for many people (the Guests and
   * Slack relays post as one bot for each person they carry), and an agent's
   * replies are each a result worth its own header.
   */
  isBot?: boolean
  /**
   * Draws its own header whatever came before: a reply quotes another message
   * and a forward carries one, and both read wrongly without the name above.
   */
  standalone?: boolean
}

function millis(at: Groupable["at"]): number {
  if (at === null || at === undefined || at === "") return NaN
  return typeof at === "number" ? at * 1000 : Date.parse(at)
}

/** Whether `cur` continues `prev`. Anything unreadable starts a new group. */
export function continuesFrom(prev: Groupable | null | undefined, cur: Groupable): boolean {
  if (!prev || !prev.author || !cur.author) return false
  if (prev.author !== cur.author) return false
  if (prev.isBot || cur.isBot || cur.standalone) return false
  const a = millis(prev.at)
  const b = millis(cur.at)
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  const gap = b - a
  return gap >= 0 && gap <= GROUP_WINDOW_MS
}

/** One flag per message in a plain list (a thread's replies). */
export function continuedFlags<T>(list: readonly T[], toGroupable: (t: T) => Groupable): boolean[] {
  const out: boolean[] = []
  let prev: Groupable | null = null
  for (const item of list) {
    const cur = toGroupable(item)
    out.push(continuesFrom(prev, cur))
    prev = cur
  }
  return out
}

/**
 * The same for a conversation's flat list, where a day's heading sits between
 * messages: a message under a heading always starts a group.
 */
export function withContinuation<T>(items: FlatItem<T>[], toGroupable: (t: T) => Groupable): FlatItem<T>[] {
  let prev: Groupable | null = null
  return items.map((item) => {
    if (item.type !== "item" || item.data === undefined) {
      prev = null
      return item
    }
    const cur = toGroupable(item.data)
    const continued = continuesFrom(prev, cur)
    prev = cur
    return continued ? { ...item, continued } : item
  })
}
