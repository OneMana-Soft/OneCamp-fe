import { describe, expect, it } from "vitest"

import { isScimTokenLive, scimBaseUrl, type ScimToken } from "./scimTokenService"

/**
 * Liveness for a SCIM credential, and the URL an operator pastes into their identity provider.
 *
 * Both are worth pinning for the same reason: their failures are silences. A credential the card draws
 * as healthy but the server rejects, or a URL with a doubled separator, produce a directory that has
 * quietly stopped provisioning — which surfaces as a new hire without an account rather than as an
 * error anybody sees.
 */

function token(overrides: Partial<ScimToken> = {}): ScimToken {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Okta production",
    token_prefix: "ocscim_a1b2c3d4",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("isScimTokenLive", () => {
  it("is live with no expiry and no revocation", () => {
    // The default for a directory connection: meant to run unattended for years.
    expect(isScimTokenLive(token())).toBe(true)
  })

  it("is dead once revoked", () => {
    expect(isScimTokenLive(token({ revoked_at: "2026-02-01T00:00:00Z" }))).toBe(false)
  })

  it("is dead once expired, even though revoked_at is null", () => {
    // THE CASE THIS FUNCTION EXISTS FOR. The server's list endpoint returns every row, and an expired
    // credential has no revoked_at — so a check that only looked at revocation would draw it as
    // healthy while the server rejected every request made with it.
    expect(isScimTokenLive(token({ expires_at: "2020-01-01T00:00:00Z" }))).toBe(false)
  })

  it("is live while its expiry is still in the future", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isScimTokenLive(token({ expires_at: future }))).toBe(true)
  })

  it("treats an expiry exactly now as past", () => {
    // Matches the server, whose query is `expires_at > NOW()`. Erring the other way would show a
    // credential as usable for the moment it stopped being accepted.
    expect(isScimTokenLive(token({ expires_at: new Date().toISOString() }))).toBe(false)
  })

  it("prefers revocation over an unexpired expiry", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isScimTokenLive(token({ revoked_at: "2026-02-01T00:00:00Z", expires_at: future }))).toBe(
      false,
    )
  })
})

describe("scimBaseUrl", () => {
  it("appends the SCIM root to a base that ends in a slash", () => {
    // The real shape of NEXT_PUBLIC_BACKEND_URL in the deployed env files.
    expect(scimBaseUrl("https://onecamp-backend.onemana.dev/")).toBe(
      "https://onecamp-backend.onemana.dev/scim/v2",
    )
  })

  it("matches the path the backend actually mounts", () => {
    // router.go mounts the SCIM sub-router at "/scim/v2". If these ever disagree, an operator follows
    // the instructions on the card exactly and the connection test still fails.
    expect(scimBaseUrl("https://example.dev")).toBe("https://example.dev/scim/v2")
  })

  it("returns an empty string when no backend URL is configured", () => {
    // The card omits its whole setup block in this case rather than offering a URL that cannot work.
    expect(scimBaseUrl("")).toBe("")
  })
})
