// The awareness fields of following, raised hands and reactions (presence/people), in a leaf of their own: a route that
// only reads them (a board's lib/board/hereNow, lib/board/signals and components/board/boardSignalsLater) brings these
// words, not the people rules.

/** The client this tab follows, or null: that one says where it is looking while anyone does (presence/sayWhereIAm). */
export const FOLLOWING_FIELD = "following"
/** Where this tab is looking, said only while someone follows it. */
export const VIEW_FIELD = "view"
/** A raised hand (a board's, miro-24): { id, raisedAt } by the raiser's own clock while it is up, null once lowered. */
export const HAND_FIELD = "hand"

/** A tab's last few reactions (a board's, miro-24): [{ id, emoji }], newest last (lib/board/signals). */
export const REACT_FIELD = "react"

/** When a hand went up, or null for anything that isn't one: a hand has an id and a finite raisedAt. Pure. */
export function raisedAtOf(hand: unknown): number | null {
  const h = hand as { id?: unknown; raisedAt?: unknown } | null | undefined
  return h && typeof h.id === "string" && h.id && typeof h.raisedAt === "number" && Number.isFinite(h.raisedAt) ? h.raisedAt : null
}
