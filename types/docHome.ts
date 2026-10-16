// The docs home as the server answers it (docs programme B5): search in docs'
// bodies, and doc templates. Mirrors the backend's controllers/DocHome and the
// marketplace's doc kind (business/Marketplace/docTemplates.go). A doc the
// viewer can't open never arrives: a page above a result they can't open comes
// as a redacted crumb, with no title and no id.

import type { DocCrumb, DocGraphPerson } from "@/types/docGraph"

/** One doc a search found, as a list row shows it, with the passages it was found in. */
export interface DocSearchItem {
  doc_uuid: string
  /** Empty for a doc nobody named yet: show a placeholder, never store one. */
  doc_title: string
  doc_icon?: string
  doc_snippet?: string
  doc_private?: boolean
  doc_created_at?: string
  doc_updated_at?: string
  owner?: DocGraphPerson
  /** Up to three pages above it, the top first. */
  path: DocCrumb[]
  /** Passages of its body: text, with the words found in <mark>. */
  highlights: string[]
  /** Its title with the words found in <mark>, when the title matched. */
  title_highlight?: string
}

/** GET /doc/search: one page of a search's results. */
export interface DocSearchPage {
  query: string
  docs: DocSearchItem[]
  /** How many of the docs searched the viewer can open: exact. */
  count: number
  /** More docs matched than were searched (the best 200 are). */
  capped: boolean
  next_cursor?: string
}

/** A doc template's payload, as the marketplace stores it (a JSON string on the template). */
export interface DocTemplatePayload {
  /** The title a doc made from it starts with. */
  title: string
  /** The body (the editor's HTML): only on one template read on its own. */
  body?: string
  /** The body's opening, for a card: only in lists. */
  preview?: string
  /** One of OneCamp's own. */
  builtin: boolean
  /** Its tile: a camp hue and a glyph's name. */
  hue?: string
  glyph?: string
  category?: string
}
