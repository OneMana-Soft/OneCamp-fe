import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

// API token client. Tokens authenticate the public /v1 API as the creating
// user, narrowed to the granted scopes. The plaintext secret is returned only
// once, at creation.

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
export const SCOPE_LABELS: Record<string, string> = {
  "tasks:read": "Read tasks",
  "tasks:write": "Create / update tasks",
  "projects:read": "Read projects",
  "projects:write": "Create projects",
  "docs:read": "Read documents",
  "docs:write": "Create documents",
  "messages:read": "Read / summarize messages",
  "messages:write": "Post messages",
  "calendar:write": "Create calendar events",
  "tables:read": "Read tables",
  "tables:write": "Write table rows",
}

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] || scope
}

export async function createApiToken(input: {
  name: string
  scopes: string[]
  expires_in_days?: number
}): Promise<CreatedToken> {
  const res = await axiosInstance.post(PostEndpointUrl.CreateApiToken, input)
  return res.data?.data as CreatedToken
}

export async function revokeApiToken(id: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.RevokeApiToken}/${id}/revoke`)
}
