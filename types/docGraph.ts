// The doc graph as the server answers it: the page tree, the lists, the trash
// and places. Mirrors the backend's controllers/Doc/{docTreeController,
// docListController,placesController}.go. A title the viewer can't open never
// arrives: such a page comes as a count (hidden) or a redacted crumb, never by
// name.

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
  doc_archived_at?: string
  owner?: DocGraphPerson
  /** Up to three pages above it, the top first. */
  path: DocCrumb[]
  /** Recent: when the viewer last opened it. */
  viewed_at?: string
  /** What the viewer may do with it, by the Access Resolver: "view", "comment", "edit", "full". */
  level?: string
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
  doc_private?: boolean
  parent_uuid?: string
  space?: DocSpace
  template_id?: string
  after_uuid?: string
  place?: "first" | "last"
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
