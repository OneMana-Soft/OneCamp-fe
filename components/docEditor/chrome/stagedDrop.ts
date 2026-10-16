/**
 * A page dropped on a breadcrumb whose move would change who can open it
 * (PROGRAM §3.2: moving a page asks what to do about access). The crumb
 * stages the drop and opens Move to…, which takes it once, with the page and
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

/** Takes the drop staged for this doc's dialog, once. */
export function takeStagedDrop(openDocId: string): StagedDrop | null {
  const d = staged.get(openDocId) ?? null
  staged.delete(openDocId)
  return d
}
