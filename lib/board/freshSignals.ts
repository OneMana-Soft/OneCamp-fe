/**
 * The rule every board signal on a collaboration's awareness is read by (lib/board/signals: reactions, hands and
 * lowers; lib/board/hereNow: an editor's bring): each other tab's new one, once. Its own module, so Here now's first
 * load takes the rule without the signals it is used for (those come with the board's lazy signals piece).
 */
/** One signal another tab made: which tab, the signal's id, the relay's name for its person, and what it says. */
export interface Signal<T> {
  client: number
  id: string
  name?: string
  value: T
}

export type Raw = Record<string, unknown>
export const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v)
const nameOf = (state: unknown): string | undefined => {
  const name = (state as { user?: { name?: unknown } | null } | null)?.user?.name
  return typeof name === "string" ? name : undefined
}

/**
 * The signals in `field` that other tabs made and this one hasn't seen, each once: `seen` keeps their ids. A field holds
 * one signal ({ id, ... }) or a list of them. `read` says what a signal says, given its tab's whole state, or null; a
 * signal it can't read, or one with no id, is left out unseen. Called as the board opens, it marks what is there as
 * seen, so nothing made before a person came reaches them. Pure but for `seen`.
 */
export function freshSignals<T>(
  states: ReadonlyMap<number, unknown>,
  self: number,
  seen: Set<string>,
  field: string,
  read: (raw: Raw, state: unknown) => T | null,
): Signal<T>[] {
  const out: Signal<T>[] = []
  states.forEach((state, client) => {
    if (client === self || !isRaw(state)) return
    const at = state[field]
    for (const raw of Array.isArray(at) ? at : [at]) {
      if (!isRaw(raw) || typeof raw.id !== "string" || !raw.id || seen.has(raw.id)) continue
      const value = read(raw, state)
      if (value === null) continue
      seen.add(raw.id)
      out.push({ client, id: raw.id, name: nameOf(state), value })
    }
  })
  return out
}
