import { describe, expect, it } from "vitest"

import { SIGN_IN_LABELS, otherWayInHint } from "@/lib/auth/signInHints"

// When an email's account signs in another way, the password form says which,
// by the words on the button to press. It used to name "the OIDC SSO button",
// "the SAML 2.0 button" and "the Directory Login tab", none of which exist.

const allOff = { google: false, github: false, oidc: false, saml: false, ldap: false }

describe("the hint for an account that signs in another way", () => {
  it.each([
    ["google", { google: true }, SIGN_IN_LABELS.google],
    ["github", { github: true }, SIGN_IN_LABELS.github],
    ["oidc", { oidc: true }, SIGN_IN_LABELS.sso],
    ["saml", { saml: true }, SIGN_IN_LABELS.sso],
    ["oidc", { oidc: true, saml: true }, SIGN_IN_LABELS.oidc],
    ["saml", { oidc: true, saml: true }, SIGN_IN_LABELS.saml],
    ["ldap", { ldap: true }, SIGN_IN_LABELS.directoryTab],
  ])("%s names the control the page draws for it", (method, on, label) => {
    const hint = otherWayInHint(method, { ...allOff, ...on })
    expect(hint).toContain(`“${label}”`)
  })

  it("never names a protocol or a control that isn't there", () => {
    for (const method of ["google", "github", "oidc", "saml", "ldap"]) {
      const hint = otherWayInHint(method, { google: true, github: true, oidc: true, saml: true, ldap: true })
      expect(hint, method).not.toMatch(/SAML 2\.0|OIDC SSO|Directory Login/)
    }
  })

  it("says to ask an administrator when that way in is turned off here", () => {
    for (const method of ["google", "github", "oidc", "saml", "ldap"]) {
      const hint = otherWayInHint(method, allOff)
      expect(hint, method).toMatch(/turned off here/)
      expect(hint, method).toMatch(/Ask your administrator/)
      expect(hint, method).not.toMatch(/“/)
    }
  })

  it("says nothing for a way in it doesn't know", () => {
    expect(otherWayInHint("carrier-pigeon", { ...allOff, google: true })).toBe("")
  })
})
