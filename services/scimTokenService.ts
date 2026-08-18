import axiosInstance from "@/lib/axiosInstance"
import { apiUrl } from "@/lib/utils/apiUrl"
import { PostEndpointUrl } from "@/services/endPoints"

/**
 * SCIM provisioning credentials.
 *
 * These authenticate a customer's identity provider — Okta, Azure AD, OneLogin — against /scim/v2, so
 * it can create accounts for joiners and deactivate leavers without anybody doing it by hand.
 *
 * A DIFFERENT KIND OF CREDENTIAL FROM AN API TOKEN, despite looking identical here. An api_token belongs
 * to a person and acts as them; the server refuses one whose owner is not an active user. A SCIM
 * credential belongs to the WORKSPACE and deliberately does not depend on any user still existing,
 * because deactivating users is its whole job: if it were owned by whoever set the integration up, the
 * day the directory offboarded that person every subsequent provisioning call would start failing, and
 * new joiners would silently stop getting accounts.
 */

/** One credential row. The secret itself is never returned — only its hash is stored. */
export interface ScimToken {
    id: string
    name: string
    /** First few characters of the secret, enough to tell two credentials apart in a list. */
    token_prefix: string
    /**
     * Who created it, for audit only, and NULLABLE on purpose: the column is ON DELETE SET NULL so
     * removing that user cannot take the workspace's directory integration down with them.
     */
    created_by?: string | null
    last_used_at?: string | null
    expires_at?: string | null
    revoked_at?: string | null
    created_at: string
    updated_at: string
}

/** Returned once, at creation. `plaintext` exists in this response and nowhere else, ever. */
export interface CreatedScimToken {
    token: ScimToken
    plaintext: string
}

export async function createScimToken(input: {
    name: string
    expires_in_days?: number
}): Promise<CreatedScimToken> {
    const res = await axiosInstance.post(PostEndpointUrl.CreateScimToken, input)
    return res.data?.data as CreatedScimToken
}

export async function revokeScimToken(id: string): Promise<void> {
    await axiosInstance.post(`${PostEndpointUrl.RevokeScimToken}/${id}/revoke`)
}

/** The SCIM root, relative to the API base. Matches the mount in the backend router. */
const SCIM_PATH = "scim/v2"

/**
 * The URL the identity provider is pointed at, or "" when this build has no backend URL configured.
 *
 * Derived rather than typed into the IdP by hand: getting it wrong produces a connection test that
 * fails with no indication of which half is at fault, and the base URL is something this app knows.
 *
 * The base carries a trailing slash in the deployed environment files, so joining is delegated to
 * apiUrl rather than done here — a second copy of that normalisation is what it exists to prevent.
 *
 * Takes the base explicitly with an env default so it is testable without an environment.
 */
export function scimBaseUrl(base?: string): string {
    return apiUrl(SCIM_PATH, base)
}

/**
 * Live means not revoked and not past its expiry — the same test the server applies on every request.
 *
 * Expiry is checked here as well as revocation because the server's list endpoint returns every row,
 * including expired ones, and an expired credential with no revoked_at would otherwise render as
 * healthy. An operator debugging a directory that has quietly stopped syncing needs this row to say so.
 */
export function isScimTokenLive(t: ScimToken): boolean {
    if (t.revoked_at) return false
    if (t.expires_at && new Date(t.expires_at).getTime() <= Date.now()) return false
    return true
}
