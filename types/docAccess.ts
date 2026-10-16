// Who may do what with a doc, as the backend's Access Resolver answers it
// (controllers/Doc/docAccessController.go; docs programme A5).

/** How much someone may do: none < view < comment < edit < full. Full may also share. */
export type AccessLevel = "none" | "view" | "comment" | "edit" | "full"

/** A doc's lock: a soft one is the editor's guard; a hard one holds everyone below full at comment. */
export type DocLock = "" | "soft" | "hard"

/**
 * Where a level comes from, as a code (lib/docAccess.ts words it):
 * the owner, full access, a grant to them, to a team they're in, the doc's
 * space, the whole workspace, "everyone who can read may comment", or a hard
 * lock that holds them at comment.
 */
export type AccessReason =
  | "owner"
  | "full_access"
  | "shared_edit"
  | "shared_comment"
  | "shared_view"
  | "team_edit"
  | "team_comment"
  | "team_view"
  | "space"
  | "workspace"
  | "readers_comment"
  | "hard_lock"

/** A person as the sharing panel names them. */
export interface AccessPerson {
  user_uuid: string
  user_name?: string
  user_full_name?: string
  user_profile_object_key?: string | null
}

/** Someone the doc is shared with by name. */
export interface SharedPerson extends AccessPerson {
  level: AccessLevel
  /** When their access ends; absent for good. */
  until?: string
}

/** A team the doc is shared with. */
export interface SharedTeam {
  team_uuid: string
  team_name: string
  level: Exclude<AccessLevel, "none" | "full">
  members: number
  until?: string
}

/** An admin's recovery of the doc, which its owner and full access see. */
export interface AccessRecovery {
  id: string
  admin_uuid: string
  from_owner_uuid?: string
  to_owner_uuid: string
  reason: string
  created_at: string
}

/** The sharing panel: for people who may edit. */
export interface DocSharing {
  owner?: AccessPerson
  people: SharedPerson[]
  teams: SharedTeam[]
  /** The general audience: the whole workspace, or with private the doc's space; and its level. */
  general: { private: boolean; level: Exclude<AccessLevel, "none" | "full"> }
  /** What someone in the workspace with no grant of their own gets. */
  everyone: AccessLevel
  space?: { kind: "project" | "team"; uuid: string; name: string; members: number }
  lock?: { level: Exclude<DocLock, "">; by?: AccessPerson; at?: string }
  recoveries?: AccessRecovery[]
  open_requests?: number
}

/** GET /doc/access/{doc_uuid}: my level on a doc, why, and for editors its sharing. */
export interface DocAccess {
  doc_uuid: string
  level: AccessLevel
  owner: boolean
  lock: DocLock
  locked: boolean
  reasons?: AccessReason[]
  can_share: boolean
  can_lock_soft: boolean
  can_lock_hard: boolean
  /** Whether Request access would reach someone who can answer it (never the demo's own people). */
  can_request?: boolean
  sharing?: DocSharing
}

/** One grant in a change: to a person (the default) or a team. */
export interface AccessGrant {
  kind?: "user" | "team"
  uuid: string
  level?: Exclude<AccessLevel, "none">
  /** RFC 3339; absent for good. */
  until?: string
}

/** POST /doc/access/update and /doc/access/preview. */
export interface DocAccessChange {
  doc_uuid: string
  adds?: AccessGrant[]
  removes?: Pick<AccessGrant, "kind" | "uuid">[]
  /** level "none" makes it private; private with a level is for the doc's space only. */
  general?: { private?: boolean; level?: Exclude<AccessLevel, "full"> }
  apply_to_subpages?: boolean
  /** What making it private does to its links for people outside the workspace (D-8). Revoke by default. */
  guest_links?: "keep" | "revoke"
}

/** A level that moves: a person's, or everyone's in the workspace. */
export interface AccessEffect {
  user_uuid?: string
  from: AccessLevel
  to: AccessLevel
}

/** What a change does, or would do. */
export interface DocAccessExplanation {
  effects: AccessEffect[]
  everyone?: AccessEffect | null
  pages: number
  lose: number
  gain: number
  change: number
  /** "3 people lose access." */
  summary: string
  /** Set by an update that made the doc private. */
  guest_links_revoked?: number
}

/** A request for access, as a list shows it. */
export interface DocAccessRequest {
  id: string
  doc_uuid: string
  /** Only for the people who answer it. */
  doc_title?: string
  requester?: AccessPerson
  level_wanted: Exclude<AccessLevel, "none" | "full">
  note?: string
  status: "pending" | "approved" | "declined" | "withdrawn"
  level_granted?: AccessLevel
  created_at: string
  decided_at?: string
}

/** GET /doc/access/requests: the ones I answer, and my own. */
export interface DocAccessRequests {
  incoming: DocAccessRequest[]
  outgoing: DocAccessRequest[]
}
