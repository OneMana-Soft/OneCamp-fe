/**
 * Who reviews a proposal: the handlers its producer gives the one review bar
 * (docs programme A9, used by B9's AI bar). The bar is drawn once per editor
 * (ReviewBarSlot.tsx); a producer that shows a proposal says, by its id, what
 * the bar names it ("AI · qwen3 4B, on your server"), what Try again and a
 * refinement do, and what happens after an accept (B9 records an AI edit).
 * A proposal no producer claims gets the bar's own accept and discard.
 */

import type { ProposalReviewBarProps } from "./ProposalReviewBar"

export type Reviewer = Omit<ProposalReviewBarProps, "editor">

const reviewers = new Map<string, Reviewer>()
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version++
  for (const l of [...listeners]) l()
}

/** Gives a proposal's handlers to the review bar; the returned function takes them back. */
export function setReviewer(proposalId: string, reviewer: Reviewer): () => void {
  reviewers.set(proposalId, reviewer)
  changed()
  return () => {
    if (reviewers.get(proposalId) !== reviewer) return
    reviewers.delete(proposalId)
    changed()
  }
}

/** A proposal's handlers, when its producer gave some. */
export function reviewerFor(proposalId: string | null | undefined): Reviewer | undefined {
  return proposalId ? reviewers.get(proposalId) : undefined
}

export function subscribeReviewers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Moves whenever a reviewer is given or taken back. */
export function reviewersVersion(): number {
  return version
}
