// The words for who may do what with a doc (docs programme A5): a level's
// label, and the sentence for each reason the Access Resolver gives
// (types/docAccess.ts). The sharing panel (B6) and the request-access page say
// them; nothing here talks to the server.

import type { AccessLevel, AccessReason, DocAccess } from "@/types/docAccess"

/** A level as the sharing panel's menu names it. */
export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  none: "No access",
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  full: "Full access",
}

/** The reasons, strongest first: the one a sentence leads with. */
const REASON_ORDER: AccessReason[] = [
  "owner",
  "full_access",
  "shared_edit",
  "team_edit",
  "space",
  "workspace",
  "shared_comment",
  "team_comment",
  "readers_comment",
  "shared_view",
  "team_view",
]

/** Says one reason to the person it is about. space is the space's name, when known. */
export function accessReasonText(reason: AccessReason, names: { space?: string } = {}): string {
  switch (reason) {
    case "owner":
      return "You own this doc."
    case "full_access":
      return "You have full access to it."
    case "shared_edit":
      return "It's shared with you to edit."
    case "shared_comment":
      return "It's shared with you to comment."
    case "shared_view":
      return "It's shared with you to view."
    case "team_edit":
      return "A team you're in can edit it."
    case "team_comment":
      return "A team you're in can comment on it."
    case "team_view":
      return "A team you're in can view it."
    case "space":
      return names.space ? `It's in ${names.space}, which you're in.` : "It's in a space you're in."
    case "workspace":
      return "Everyone in the workspace can open it."
    case "readers_comment":
      return "Everyone who can read it can comment."
    case "hard_lock":
      return "It's locked, so you can comment but not edit."
  }
}

/**
 * The sentence that says why someone has the access they have: the strongest
 * reason, and the lock when a hard lock holds them below it. Empty for no
 * access, which names nothing of the doc.
 */
export function explainDocAccess(access: Pick<DocAccess, "level" | "reasons" | "locked">, names: { space?: string } = {}): string {
  if (access.level === "none" || !access.reasons?.length) return ""
  const lead = REASON_ORDER.find((r) => access.reasons?.includes(r))
  const parts = lead ? [accessReasonText(lead, names)] : []
  if (access.reasons.includes("hard_lock")) parts.push(accessReasonText("hard_lock"))
  return parts.join(" ")
}
