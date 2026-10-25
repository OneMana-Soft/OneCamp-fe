/**
 * A page dropped on a breadcrumb whose move would change who can open it
 * (PROGRAM §3.2: moving a page asks what to do about access). The crumb
 * stages the drop and opens Move to…, which reads it as it opens (useHandoff), with the page and
 * where it goes already chosen, and asks: under a page, keep its access or
 * use the new parent's; to the top of Docs, whether to move it at all.
 */
export interface StagedDrop {
  /** The page dragged (any page, not only the one open). */
  page: { uuid: string; title?: string }
  /** Where it was dropped: a page, or (uuid null) the top of Docs. */
  target: { uuid: string | null; title: string; icon?: string }
}

const staged = new Map<string, StagedDrop>()

/** Stages a drop for the Move to… dialog of the doc that is open. */
export function stageDrop(openDocId: string, drop: StagedDrop) {
  staged.set(openDocId, drop)
}

/** The drop staged for this doc's dialog, as it opens (useHandoff). */
export function peekStagedDrop(openDocId: string): StagedDrop | null {
  return staged.get(openDocId) ?? null
}

/** The dialog showing it has it: it is no longer staged. */
export function releaseStagedDrop(drop: StagedDrop): void {
  for (const [doc, d] of staged) if (d === drop) staged.delete(doc)
}
