// The doc graph as the server answers it: the page tree, the lists, the trash
// and places. Mirrors the backend's controllers/Doc/{docTreeController,
// docListController,placesController}.go. A title the viewer can't open never
// arrives: such a page comes as a count (hidden) or a redacted crumb, never by
// name.

import type { CampHue } from "@/lib/campHue"

/**
 * What a node of the tree is besides a page (docs F1, Docs & Files): a folder
 * holds pages, folders, files and links; a file and a link hold nothing
 * (D-30). No kind is a page: the server never writes "" or "page".
 */
export type DocNodeKind = "folder" | "file" | "link"

/** A colour a node wears: a camp hue, or null to take one away (D-31; the server writes no ""). */
export type DocColor = CampHue | null

/** A file node's current version, from doc_file_versions (its highest n). */
export interface DocFileFacts {
  name: string
  size_bytes: number
  mime: string
  /** How many versions it has. */
  versions: number
  /** The current version's attachment: GET /doc/getFile/{file's uuid}/{attachment_id} serves it. */
  attachment_id: string
}

/** One version of a file (GET /doc/files/{uuid}/versions), newest first. */
export interface DocFileVersion {
  /** 1 for the first upload, counting up. */
  n: number
  attachment_id: string
  name: string
  size_bytes: number
  mime: string
  /** What changed, as its uploader said it. */
  note?: string
  created_by?: DocGraphPerson
  created_at: string
}

export interface DocFileVersions {
  versions: DocFileVersion[]
}

/**
 * What GET /doc/getDocInfo says of a node that isn't a page (docs F1): the
 * doc's route draws it as itself and never opens the editor for it.
 */
export interface DocNodeFields {
  doc_node_kind?: DocNodeKind
  doc_color?: CampHue
  doc_link_url?: string
}

/** POST /doc/color: up to 200 nodes in one write, with edit on each. */
export interface DocColorRequest {
  doc_uuids: string[]
  color: DocColor
}

/** Who a row names: a doc's owner, who deleted it. */
export interface DocGraphPerson {
  user_uuid: string
  user_name?: string
  user_full_name?: string
  user_profile_object_key?: string
}

/** One page in the tree, in the tree's own shape (any kind of tree sends it). */
export interface TreeNodeJSON {
  kind: string
  /** Absent on a redacted page. */
  uuid?: string
  parent_uuid?: string
  position?: string
  /** Empty for a page nobody named yet: show a placeholder, never store one. */
  title?: string
  icon?: string
  has_children: boolean
  /** The viewer may change it: rename, move, add pages under it. */
  can_edit?: boolean
  /** A page the viewer can't open: no title, no id. */
  redacted?: boolean
  /** A doc's own: its privacy and when it last changed. */
  private?: boolean
  updated_at?: string
  /**
   * Who made that change (doc_updated_by): absent before anyone has, and from
   * a server that doesn't send it yet, where a row says the time alone.
   */
  updated_by?: DocGraphPerson
  /** A folder, a file or a link; absent on a page. */
  node_kind?: DocNodeKind
  /** The colour it was given, if any. */
  color?: CampHue
  /** A link's address: https, checked by the server. */
  link_url?: string
  /** A file's current version. */
  file?: DocFileFacts
}

/** Where a tree's top level comes from when no parent is named. */
export type DocSpace = "workspace" | "private" | "shared" | `project:${string}` | `team:${string}`

/** One level of the tree (GET /doc/children). */
export interface DocChildren {
  parent: string
  space?: string
  nodes: TreeNodeJSON[]
  /** Pages here the viewer can't open: counted, never named. */
  hidden: number
  /** Pages here the viewer can open, in all (nodes may be the first of them). */
  count: number
  next_cursor?: string
}

/** GET /doc/ancestors/{uuid}: the path down to a page, the top first. */
export interface DocAncestors {
  ancestors: TreeNodeJSON[]
  /** The path went deeper than the server walks (32 levels). */
  truncated: boolean
}

/** Where a moved page goes. No parent: the top of space. */
export interface DocMoveRequest {
  doc_uuid: string
  parent_uuid?: string
  /** The sibling it goes right after; absent: see place. */
  after_uuid?: string
  /** With no after_uuid: first, or last (the default). */
  place?: "first" | "last"
  space?: DocSpace
  /** Keep its own sharing, or take its new parent's. */
  access?: "keep" | "adopt"
}

/** Where a page is to go, before anyone says what becomes of its access. */
export type DocMoveTarget = Omit<DocMoveRequest, "access">


export interface DocMoveResult {
  doc_uuid: string
  parent_uuid: string
  space?: string
  /** What happened to its sharing: adopting can fall back to keeping it. */
  access: "keep" | "adopt"
}

/** POST /doc/move/preview: what a move would do to who can open the page. */
export interface DocMovePreview {
  /** False while the server can't work it out. */
  available: boolean
  /** Whether the mover may adopt at all: full access to the page. Without it, the move keeps its sharing. */
  can_adopt?: boolean
  lose: number
  gain: number
  /** What everyone in the workspace gets, before and after, when that moves. */
  everyone?: { from: string; to: string } | null
  /** The pages the adoption reaches: the page and the pages under it the mover has full access to. */
  pages?: number
  /** "3 people lose access." */
  summary: string
  /**
   * Only for a move into a project's or team's space, or out of one, which
   * changes who can open the page whatever its access: the space it goes
   * into, and the one it leaves (null: none).
   */
  space?: DocMoveSpace | null
  was?: DocMoveSpace | null
}

/** A project's or team's space, as a move's preview names it. */
export interface DocMoveSpace {
  kind: "project" | "team"
  uuid: string
  name: string
  /** How many people are in it. */
  members: number
}

export type DocListScope = "recent" | "mine" | "shared" | "workspace" | "starred" | "archived"
export type DocListSort = "edited" | "created" | "title"

/** One page above a list row: named, or one the viewer can't open. */
export interface DocCrumb {
  doc_uuid?: string
  doc_title?: string
  doc_icon?: string
  redacted?: boolean
}

/** One row of a doc list. */
export interface DocListItem {
  doc_uuid: string
  doc_title: string
  doc_icon?: string
  doc_snippet?: string
  doc_private?: boolean
  doc_created_at?: string
  doc_updated_at?: string
  /** Who made the last change, as a tree row's updated_by. */
  updated_by?: DocGraphPerson
  doc_archived_at?: string
  owner?: DocGraphPerson
  /** Up to three pages above it, the top first. */
  path: DocCrumb[]
  /** Recent: when the viewer last opened it. */
  viewed_at?: string
  /** What the viewer may do with it, by the Access Resolver: "view", "comment", "edit", "full". */
  level?: string
  /** A folder, a file or a link, as a tree row says it (node_kind and the rest). */
  doc_node_kind?: DocNodeKind
  doc_color?: CampHue
  doc_link_url?: string
  doc_file?: DocFileFacts
}

/** GET /doc/list: one page of a list, and how many the whole list holds. */
export interface DocList {
  scope: DocListScope
  docs: DocListItem[]
  /** Exact: the same filter as the pages. */
  count: number
  next_cursor?: string
}

/** POST /doc/createDoc. A title may be empty: "Untitled" is only a placeholder. */
export interface DocCreateRequest {
  doc_title?: string
  /**
   * Always sent, for a subpage too (its parent's: lib/docCache subpagePrivate).
   * A server without nested pages (v2.72) reads only this and the title, and
   * makes a doc it isn't told is private at the top, open to the whole
   * workspace. The server since makes a subpage as private as its parent,
   * whatever this says.
   */
  doc_private: boolean
  parent_uuid?: string
  space?: DocSpace
  template_id?: string
  after_uuid?: string
  place?: "first" | "last"
  /** A folder or a link; left out for a page. A file is made by uploading it (POST /doc/files). */
  node_kind?: Exclude<DocNodeKind, "file">
  /** A link's address, https only. */
  link_url?: string
  /**
   * The maker puts the page in its parent's body itself ("/page", "[["'s New
   * page), so the server adds no block for it. A page made from the sidebar or
   * Docs & Files leaves this out and takes a block at its parent's end (docs C7a).
   */
  placed?: boolean
}

/** One entry of the trash: a page deleted on its own, or the top of a subtree deleted with it. */
export interface DocTrashItem {
  doc_uuid: string
  doc_title: string
  doc_icon?: string
  deleted_at: string
  deleted_by?: DocGraphPerson
  /** The delete it went with; restoring any of it restores all of it. */
  batch_id?: string
  /** Subpages deleted with it. */
  subpages: number
  /** The viewer may delete it for good. */
  can_purge: boolean
  /** When it goes for good on its own. */
  purge_at?: string
}

export interface DocTrash {
  items: DocTrashItem[]
  count: number
  next_cursor?: string
}

export interface DocDeleteResult {
  batch_id: string
  count: number
  /** Pages under it that stayed because the person can't open them: they moved up to its parent. */
  kept?: number
}

export interface DocPurgeResult {
  purged: number
  /** Pages deleted with it that stayed in the trash because the person hasn't full access to them. */
  kept?: number
}

export interface DocRestoreResult {
  restored: number
  /** Where the restored page landed: its parent, or "" at the top. */
  parent_uuid: string
}

export interface DocDuplicateResult {
  doc_uuid: string
  count: number
}

/** A star or a pin. */
export type PlaceKind = "star" | "pin"

/** One of the viewer's places, with what's needed to show it. */
export interface Place {
  kind: PlaceKind
  resource_kind: string
  resource_uuid: string
  position: string
  title: string
  icon?: string
  href: string
}
