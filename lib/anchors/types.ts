/**
 * Anchors: where an anchored thread or an edit proposal is pinned (docs
 * programme, PROGRAM.md §4 #18; A8 builds lib/anchors).
 *
 * An anchor is resolved against the live Yjs doc. It never re-attaches on its
 * own (D-9): when its text is deleted, or the doc was rebuilt or restored into a
 * new lineage, it is detached and keeps its quote ("Original text was changed"),
 * and only an exact match of the quote is offered back, as "Reattach here", for
 * someone to choose.
 *
 * The JSON matches the API's Anchor (business/Thread).
 */

/** What a thread or proposal is pinned to. */
export type AnchorKind = 'yrange' | 'block' | 'message' | 'time' | 'cell' | 'none'

export interface Anchor {
  kind: AnchorKind
  /** Yjs relative positions, encoded then base64 (standard, padded), for a 'yrange'. */
  start?: string
  end?: string
  /** The block, for 'block'; the block a range began in, for 'yrange'. */
  block_id?: string
  /** The doc lineage the positions belong to: another lineage detaches. */
  lineage?: string
  /** The text it was started on, kept when it is detached. */
  quote?: string
  /** The kind's own detail: a message id, a time in milliseconds, a row and field. */
  meta?: Record<string, unknown>
}

/** Why an anchor no longer holds. */
export type DetachReason = 'deleted' | 'lineage'

/**
 * An anchor resolved against the live doc. A collapsed range is detached.
 * 'pending' is "can't tell yet" (the doc hasn't synced, or the editor isn't
 * bound): never show a pending anchor as detached. 'page' is the whole page
 * (kind 'none', or a kind that lives outside the doc): nothing to draw.
 */
export type ResolvedAnchor =
  | { state: 'attached'; from: number; to: number }
  | { state: 'detached'; reason: DetachReason; quote: string }
  | { state: 'pending' }
  | { state: 'page' }

/** Where an exact match of a detached anchor's quote sits now: offered, never applied. */
export interface ReattachCandidate {
  from: number
  to: number
}
