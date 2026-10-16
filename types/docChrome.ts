// A doc's page chrome (docs programme B6), as the backend's
// controllers/Doc/docChromeController.go answers it: the look and lock a doc
// opens with, a change to its look, what links to it, and a doc in the trash
// as its page shows it.

/** A person a doc names: its owner, who locked or deleted it. */
export interface DocChromePerson {
  uid?: string
  user_uuid: string
  user_name?: string
  user_full_name?: string
  user_profile_object_key?: string | null
}

/**
 * What a doc opens with besides its body (GET /doc/getDocInfo): its look, its
 * lock and its owner. Every field is absent on a doc that never set it.
 */
export interface DocPageFields {
  /** One emoji, or "glyph:<name>" / "glyph:<name>:<colour>" (lib/docLook.ts). */
  doc_icon?: string
  /** "gallery:<name>", or "<doc uuid>/<file uuid>" for an image uploaded to a doc. */
  doc_cover_key?: string
  /** Where the cover sits, 0 (its top) to 100 (its bottom); 50 when absent. */
  doc_cover_offset?: number
  doc_full_width?: boolean
  doc_font?: "" | "serif" | "mono"
  doc_small_text?: boolean
  doc_lock_level?: "" | "soft" | "hard"
  doc_locked_at?: string
  doc_locked_by?: DocChromePerson
  /** Its owner: its maker until it was handed on. */
  doc_owner?: DocChromePerson
  /** 1 when the person has full access (the server's word, A5). */
  doc_full_access?: number
  /** How many live docs link here: "Linked from"'s row is kept for them. */
  doc_backlink_count?: number
}

/** POST /doc/look: a change to a doc's look. An absent field stays; "" takes it away. */
export interface DocLookChange {
  doc_uuid: string
  icon?: string
  cover?: string
  cover_offset?: number
  full_width?: boolean
  font?: "" | "serif" | "mono"
  small_text?: boolean
}

/** A doc that links to this one. */
export interface DocBacklink {
  doc_uuid: string
  doc_title: string
  doc_icon?: string
  doc_updated_at?: string
}

/** GET /doc/backlinks/{doc_uuid}: tasks, projects and docs together. */
export interface DocBacklinks {
  tasks: { task_uuid: string; task_name?: string; task_status?: string }[] | null
  projects: { project_uuid: string; project_name?: string; project_status?: string }[] | null
  docs: DocBacklink[]
  count: number
  /** More docs link here than were read (200): "200+ backlinks". */
  capped?: boolean
}

/** GET /doc/trashed/{doc_uuid}: a doc in the trash as its page shows it. */
export interface TrashedDocPage {
  doc_uuid: string
  doc_title: string
  doc_body: string
  doc_icon?: string
  doc_cover_key?: string
  doc_cover_offset?: number
  doc_full_width?: boolean
  doc_font?: string
  doc_small_text?: boolean
  deleted_at: string
  deleted_by?: DocChromePerson
  archived?: boolean
  /** Pages deleted with it. */
  subpages: number
  can_restore: boolean
  can_purge: boolean
  /** When it goes for good on its own. */
  purge_at?: string
}
