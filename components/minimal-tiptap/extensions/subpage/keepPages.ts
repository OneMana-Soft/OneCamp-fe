/**
 * Set on a transaction that takes sub-page blocks out of a doc but keeps their
 * pages where they are in the tree (leaving.ts): B1's Move to…, whose blocks
 * went to another doc, and an accepted edit proposal, whose agent rewrote the
 * text, not the tree. Such a page stays the doc's child, under "Pages inside".
 */
export const KEEP_PAGES = "keepPages"
