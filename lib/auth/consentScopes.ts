/**
 * What each scope an outside agent asks for lets it do, in words, for the
 * consent card (design v3, admin.md F9). The card shows the words at 14px and
 * the raw scope beside them in mono, so a person reads "Read tasks" and an
 * auditor still sees "tasks:read".
 *
 * Every scope the server can grant has its words here. CONSENT_SCOPES mirrors
 * the backend's ApiToken AllScopes (business/ApiToken/apiTokenBusiness.go);
 * consentScopes.test.ts fails when one has no label, so a new scope can't
 * reach the consent card as a bare identifier. A scope this build has never
 * heard of still gets a readable sentence rather than its raw name.
 */

export const CONSENT_SCOPES = [
  "tasks:read",
  "tasks:write",
  "projects:read",
  "projects:write",
  "docs:read",
  "docs:write",
  "messages:read",
  "messages:write",
  "calendar:write",
  "tables:read",
  "tables:write",
  "search:read",
  "data_sources:read",
  "attention:read",
] as const

export const SCOPE_HUMAN_LABELS: Record<string, string> = {
  "tasks:read": "Read tasks",
  "tasks:write": "Create and update tasks",
  "projects:read": "Read projects",
  "projects:write": "Create projects",
  "docs:read": "Read documents",
  "docs:write": "Create and edit documents",
  "messages:read": "Read messages",
  "messages:write": "Post messages",
  "calendar:write": "Add calendar events",
  "tables:read": "Read tables",
  "tables:write": "Add and change table rows",
  "search:read": "Search the workspace",
  "data_sources:read": "Read connected databases",
  "attention:read": "See what is waiting for you",
  // Asked for by older clients; granted as messages.
  "channels:read": "Read channels",
}

/** Whether a scope changes things (a write), for the sun "Changes things" tag. */
export function changesThings(scope: string): boolean {
  return scope.endsWith(":write")
}

/** The words for a scope: its label, or a sentence made from it ("Read data sources"). */
export function scopeWords(scope: string): string {
  const known = SCOPE_HUMAN_LABELS[scope]
  if (known) return known
  const [thing = scope, verb = ""] = scope.split(":")
  const noun = thing.replace(/_/g, " ")
  if (verb === "read") return `Read ${noun}`
  if (verb === "write") return `Change ${noun}`
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}
