/**
 * Which rows ARRIVED, as opposed to were loaded (design v3 chat, C18).
 *
 * Live things arrive; history never moves. A row rises into place only when
 * it was appended at the end of the same conversation while the reader was
 * following that end, and only a few at a time: the first load, older
 * messages paged in above, a switch to another conversation, a jump, and a
 * reconnect's backlog all render still. More than three in one change is a
 * backlog, not a conversation happening.
 *
 * Decided from the list itself, between one render's items and the next, so
 * it never depends on how a row got into the store (MQTT, an optimistic send,
 * a resync): what matters is that it appeared at the end while you watched.
 */

export const MAX_ARRIVALS = 3

interface Keyed {
    key: string
    type: string
}

const NONE: ReadonlySet<string> = new Set()

export function arrivedKeys(prev: readonly Keyed[], next: readonly Keyed[], following: boolean): ReadonlySet<string> {
    if (!following || prev.length === 0 || next.length <= prev.length) return NONE
    // The same conversation, grown only at its end: what was first is still
    // first, and what was last is still there.
    if (prev[0].key !== next[0].key) return NONE
    const lastKey = prev[prev.length - 1].key
    let at = -1
    for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].key === lastKey) {
            at = i
            break
        }
    }
    if (at < 0) return NONE
    const added = next.slice(at + 1).filter((i) => i.type === "item")
    if (added.length === 0 || added.length > MAX_ARRIVALS) return NONE
    return new Set(added.map((i) => i.key))
}
