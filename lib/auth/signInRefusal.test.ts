import { describe, expect, it } from "vitest"
import { signInRefusal } from "@/lib/auth/signInRefusal"

// Every code the server sends through SignInErrorURL (backend services/Auth),
// from the OAuth, OIDC and SAML handlers.
const CODES = [
  "oauth_email_unverified", "oauth_not_invited", "oauth_failed", "invitation_expired", "unauthorized",
  "address_unsupported", "signin_cancelled", "signin_expired",
  "oidc_disabled", "oidc_misconfigured", "oidc_invalid_request", "oidc_invalid_state", "oidc_state_mint_failed",
  "oidc_invalid_code", "oidc_no_token", "oidc_verification_failed", "oidc_invalid_claims", "oidc_no_email",
  "oidc_email_unverified", "saml_disabled", "saml_invalid", "saml_no_email",
  "provision_failed", "seat_limit", "plan_required", "session_failed", "db_error", "resolution_failed",
]

describe("signInRefusal", () => {
  it("gives every code a short title of its own, never the old blanket one", () => {
    for (const code of CODES) {
      const r = signInRefusal(code)
      expect(r.message, code).not.toBe(signInRefusal("not-a-code").message)
      expect(r.title, code).not.toMatch(/authentication failed/i)
      expect(r.title.length, code).toBeLessThanOrEqual(32)
    }
  })

  it("titles the ones people meet most for what happened", () => {
    expect(signInRefusal("invitation_expired").title).toBe("Invitation expired")
    expect(signInRefusal("signin_cancelled").title).toBe("Sign-in cancelled")
    expect(signInRefusal("oauth_not_invited").title).toBe("Not invited yet")
    expect(signInRefusal("seat_limit").title).toBe("No free seat")
    expect(signInRefusal("oauth_failed").title).toBe("Couldn't sign you in")
  })

  it("says nothing is wrong when nothing is", () => {
    for (const code of ["signin_cancelled", "signin_expired", "oidc_invalid_state"]) {
      expect(signInRefusal(code).tone, code).toBe("neutral")
    }
    for (const code of ["invitation_expired", "oauth_not_invited", "unauthorized", "seat_limit"]) {
      expect(signInRefusal(code).tone, code).toBe("warning")
    }
  })

  it("answers a code it doesn't know, or one that names something on Object, generally", () => {
    for (const code of ["something_new", "constructor", "__proto__", "toString"]) {
      expect(signInRefusal(code)).toEqual({
        title: "Couldn't sign you in",
        message: "Sign-in failed. Please try again or contact your administrator.",
        tone: "error",
      })
    }
  })
})
