/**
 * The reactions someone used last, newest first, kept in this browser. A
 * message's quick reactions are the most recent of them (MC-77, as Slack's
 * one-click reactions are): the toolbar's three and the phone sheet's six,
 * topped up from each surface's defaults until enough have been used. They
 * were always ✅ 👀 🙌, whatever you reached for.
 */

import { storedRecents } from "@/lib/utils/storedRecents"

/** One quick reaction: the emoji's id (what is sent), its character, and what it is called. */
export interface QuickReaction {
  readonly id: string
  readonly native: string
  readonly label: string
}

/** As many as the widest surface shows (the phone sheet's six). */
const recents = storedRecents<QuickReaction>("onecamp-recent-reactions", 6, {
  valid: (r): r is QuickReaction => {
    const q = r as QuickReaction | null
    return !!q && typeof q.id === "string" && !!q.id && typeof q.native === "string" && !!q.native && typeof q.label === "string"
  },
  same: (a, b) => a.id === b.id,
})

/** The reactions used last, newest first; none in a private window or before any. */
export const readRecentReactions = recents.read

/**
 * Remembers a reaction someone just used. A custom one has no character to
 * draw in a quick slot, so it isn't kept.
 */
export function noteReaction(reaction: { id: string; native?: string; name?: string; label?: string }): void {
  if (!reaction.id || !reaction.native) return
  recents.note({ id: reaction.id, native: reaction.native, label: reaction.label || reaction.name || reaction.id })
}

/**
 * The first `count` quick reactions: the recent ones, then the defaults, each
 * once. A recent one that is also a default keeps the default's name (✅ is
 * "Mark as done" in the toolbar, not "Check Mark Button"). Pure.
 */
export function quickReactions(recent: readonly QuickReaction[], defaults: readonly QuickReaction[], count: number): QuickReaction[] {
  const named = new Map(defaults.map((d) => [d.id, d]))
  const out: QuickReaction[] = []
  for (const r of [...recent.map((r) => named.get(r.id) ?? r), ...defaults]) {
    if (out.length === count) break
    if (!out.some((o) => o.id === r.id)) out.push(r)
  }
  return out
}
