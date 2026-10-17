/**
 * Who is in a doc, read from its awareness states (B8). Every tab is an
 * awareness client with a number of its own; a person is found by that number,
 * never by their name (two people called Sam are two people, N50).
 *
 * Each tab says, in its own awareness state (PresenceOverlay publishes it):
 *   mode       "editing" or "viewing" (A2)
 *   idle       true after 2 minutes with no input there (keys, pointer, scroll)
 *   edited     when it last changed the doc, at most every 10 seconds
 *   following  the client it follows, so that one says where it is looking
 *   view       where it is looking, only while someone follows it
 * Times are read on this tab's clock, when a field is seen to change: two
 * machines' clocks never meet.
 */

import type { DocPresence, PresencePerson } from "./store"

export type AwarenessState = Record<string, unknown> & {
  user?: { id?: string; name?: string; hue?: string; kind?: string }
  mode?: unknown
  idle?: unknown
  edited?: unknown
  cursor?: unknown
  view?: unknown
  following?: unknown
}

/** What this tab remembers about each client between changes. */
interface Seen {
  /** When the client last did something this tab saw: its caret moved, it edited, it scrolled while followed. */
  active: Map<number, number>
  /** Its last `edited`, to tell a new edit from the same one said again. */
  edited: Map<number, unknown>
  /** Its last caret and view, to tell a move. */
  moved: Map<number, string>
}

export const newSeen = (): Seen => ({ active: new Map(), edited: new Map(), moved: new Map() })

/** The id a person goes by in the stack: their user id, as the session reads it (lib/collabSession). */
const personId = (s: AwarenessState): string | null => (s.user?.name ? String(s.user.id || s.user.name) : null)

/**
 * Notes what changed since the last look (`now` is this tab's clock), and
 * returns the last edit someone else made, if this look saw one.
 */
export function look(states: Map<number, AwarenessState>, self: number, seen: Seen, now: number): { userId: string; name: string; at: number } | null {
  let edit: { userId: string; name: string; at: number } | null = null
  for (const [client, s] of states) {
    const id = personId(s)
    if (!id) continue
    // Seen in an earlier look: what changes now happened while this tab watched.
    const known = seen.moved.has(client)
    const moved = JSON.stringify([s.cursor ?? null, s.view ?? null])
    if (known && seen.moved.get(client) !== moved) seen.active.set(client, now)
    seen.moved.set(client, moved)
    if (!seen.active.has(client)) seen.active.set(client, now - 1)
    if (s.edited !== undefined && s.edited !== null && seen.edited.get(client) !== s.edited) {
      seen.edited.set(client, s.edited)
      seen.active.set(client, now)
      // An edit already said when this tab first saw them isn't news: it happened before.
      if (known && client !== self) edit = { userId: id, name: s.user?.name ?? "", at: now }
    }
  }
  for (const client of [...seen.active.keys()]) {
    if (!states.has(client)) {
      seen.active.delete(client)
      seen.edited.delete(client)
      seen.moved.delete(client)
    }
  }
  return edit
}

/** People, by id: each with their clients (the one active last first), their mode, and whether every tab of theirs is idle. */
function peopleOf(states: Map<number, AwarenessState>, seen: Seen): Record<string, PresencePerson> {
  const out: Record<string, PresencePerson> = {}
  for (const [client, s] of states) {
    const id = personId(s)
    if (!id) continue
    const p = (out[id] ??= { clients: [], name: s.user?.name ?? "", idle: true })
    p.clients.push(client)
    if (s.idle !== true) p.idle = false
    if (s.mode === "editing") p.mode = "editing"
    else if (s.mode === "viewing" && p.mode !== "editing") p.mode = "viewing"
  }
  for (const p of Object.values(out)) p.clients.sort((a, b) => (seen.active.get(b) ?? 0) - (seen.active.get(a) ?? 0))
  return out
}

/** The presence a doc's stack and meta line read, from one look at its awareness. */
export function presenceOf(states: Map<number, AwarenessState>, self: number, seen: Seen, last: DocPresence["edit"], now: number): DocPresence {
  const edit = look(states, self, seen, now)
  const mine = states.get(self)
  return { people: peopleOf(states, seen), edit: edit ?? last, self: mine ? personId(mine) : null }
}

/** The clients following `client`: it says where it is looking while there are any. */
export function followersOf(states: Map<number, AwarenessState>, client: number): number[] {
  const out: number[] = []
  for (const [c, s] of states) if (c !== client && s.following === client) out.push(c)
  return out
}
