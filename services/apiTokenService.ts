import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { AdminPost } from "@/services/endpoints/admin"

// API token client. Tokens authenticate the public /v1 API as the creating
// user with a member's powers at most, never an admin's, narrowed to the
// granted scopes. The plaintext secret is returned only once, at creation.

export interface ApiToken {
  id: string
  name: string
  token_prefix: string
  scopes: string // raw JSON array string
  created_by: string
  last_used_at?: string | null
  expires_at?: string | null
  revoked_at?: string | null
  created_at: string
  updated_at: string
}

export interface CreatedToken {
  token: ApiToken
  plaintext: string // shown once; never retrievable again
}

export function parseScopes(t: ApiToken): string[] {
  try {
    const v = JSON.parse(t.scopes || "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Human labels for scope strings (kept in sync with the backend AllScopes).
const SCOPE_LABELS: Record<string, string> = {
  "tasks:read": "Read tasks",
  "tasks:write": "Create and update tasks",
  "projects:read": "Read projects",
  "projects:write": "Create projects",
  "docs:read": "Read documents",
  "docs:write": "Create documents and add to them",
  "messages:read": "Read and summarise messages",
  "messages:write": "Post messages",
  "calendar:write": "Create calendar events",
  "tables:read": "Read tables",
  "tables:write": "Write table rows",
  "data_sources:read": "Read connected data sources",
  "attention:read": "See what is waiting for you (unread, approvals)",
  "search:read": "Search the workspace and apps",
}

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] || scope
}

export async function createApiToken(input: {
  name: string
  scopes: string[]
  expires_in_days?: number
}): Promise<CreatedToken> {
  // The dialog says a failure under the field it is about.
  const res = await axiosInstance.post(AdminPost.CreateApiToken, input, OWN_ERRORS)
  return res.data?.data as CreatedToken
}

export async function revokeApiToken(id: string): Promise<void> {
  await axiosInstance.post(`${AdminPost.RevokeApiToken}/${id}/revoke`)
}
