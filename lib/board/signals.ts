/**
 * A board's signals on its collaboration's awareness (miro-24): reactions that rise from the sender's face, raised
 * hands in a queue, and an editor's word to lower one. Each tab keeps its latest in its own state, and the others read
 * what is new. A member's fields pass the relay (the collaboration service's presenceGuard.js keeps all but a reader's
 * presenting and bring); a guest's don't. The hands up are presence's (presence/people reads each person's, and
 * presence/hands queues them), so the faces and Here now show them as they show who is here. Pure but for
 * the `seen` sets, so they are tested.
 */
import { stampedEditor } from "@/components/docEditor/presence/stamp"
import { HAND_FIELD, REACT_FIELD, raisedAtOf } from "@/components/docEditor/presence/fields"
import { isReaction, type Reaction } from "@/lib/reactions/set"
import { freshSignals, isRaw, type Raw, type Signal } from "@/lib/board/freshSignals"

export { HAND_FIELD, REACT_FIELD, freshSignals, type Signal }
export const LOWER_FIELD = "lower"
/** A tab's reactions, and an editor's lowers, ride as its last few, so updates the network folds together lose none. */
export const REACTIONS_KEPT = 3

/** A field's last REACTIONS_KEPT signals with one more, keeping only the ones `whole` reads as such. Pure. */
function keptWith<T extends { id: string }>(prev: unknown, next: T, whole: (raw: Raw) => boolean): T[] {
  const kept = (Array.isArray(prev) ? prev : []).filter((r): r is T => isRaw(r) && typeof r.id === "string" && whole(r))
  return [...kept, next].slice(-REACTIONS_KEPT)
}

/** This tab's reactions with one more: its last REACTIONS_KEPT, each { id, emoji }. Pure. */
export const nextReactions = (prev: unknown, emoji: Reaction, id: string): { id: string; emoji: Reaction }[] =>
  keptWith(prev, { id, emoji }, (r) => isReaction(r.emoji))

/** This editor's words to lower hands with one more, for `client`'s tab: its last REACTIONS_KEPT, each { id, client }. Pure. */
export const nextLowers = (prev: unknown, client: number, id: string): { id: string; client: number }[] =>
  keptWith(prev, { id, client }, (r) => typeof r.client === "number")

/** The reactions other tabs sent that this one hasn't shown, each once, and only an emoji in the set. Anyone may react. */
export const reactionsIn = (states: ReadonlyMap<number, unknown>, self: number, seen: Set<string>): Signal<Reaction>[] =>
  freshSignals(states, self, seen, REACT_FIELD, (raw) => (isReaction(raw.emoji) ? raw.emoji : null))

/** The hands other tabs raised that this one hasn't heard of, each once (an editor's toast says so). Pure but for `seen`. */
export const handsRaised = (states: ReadonlyMap<number, unknown>, self: number, seen: Set<string>): Signal<number>[] =>
  freshSignals(states, self, seen, HAND_FIELD, raisedAtOf)

/**
 * An editor's word to lower this tab's hand, each once: only from a state the relay stamps an editor's, and only one
 * meant for this tab. A viewer's tab may claim anything, but never the stamp. Pure but for `seen`.
 */
export const lowersFor = (states: ReadonlyMap<number, unknown>, self: number, seen: Set<string>): Signal<true>[] =>
  freshSignals(states, self, seen, LOWER_FIELD, (raw, state) => (stampedEditor(state) && raw.client === self ? true : null))
