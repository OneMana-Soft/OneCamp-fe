/**
 * The words on each way in, and the hint that points at one.
 *
 * When an email's account signs in another way (Google, GitHub, single sign-on,
 * the company directory), the password form says which, by the words on the
 * control to press. The hint used to be written separately from the buttons and
 * named "the OIDC SSO button", "the SAML 2.0 button" and "the Directory Login
 * tab", none of which existed. The buttons and the tabs read their words from
 * here, so a hint can only name a control the page draws.
 */

export const SIGN_IN_LABELS = {
  google: "Continue with Google",
  github: "Continue with GitHub",
  /** Single sign-on, when the workspace has one kind of it. */
  sso: "Continue with single sign-on",
  /** When it has both kinds, each button says which. */
  oidc: "Single sign-on (OIDC)",
  saml: "Single sign-on (SAML)",
  accountTab: "OneCamp account",
  directoryTab: "Company directory",
} as const

/** Which ways in this workspace has turned on, as /auth/providers says. */
export interface WaysIn {
  google: boolean
  github: boolean
  oidc: boolean
  saml: boolean
  ldap: boolean
}

const off = (way: string) => `This email signs in with ${way}, which is turned off here. Ask your administrator.`

/**
 * What to say under the password when the server answers that this email signs
 * in another way (`auth_method`). Empty for a way it doesn't know.
 */
export function otherWayInHint(method: string, on: WaysIn): string {
  switch (method) {
    case "google":
      return on.google ? `This email signs in with Google. Use “${SIGN_IN_LABELS.google}” above.` : off("Google")
    case "github":
      return on.github ? `This email signs in with GitHub. Use “${SIGN_IN_LABELS.github}” above.` : off("GitHub")
    case "oidc":
      if (!on.oidc) return off("single sign-on")
      return `This email signs in with your company's single sign-on. Use “${on.saml ? SIGN_IN_LABELS.oidc : SIGN_IN_LABELS.sso}” above.`
    case "saml":
      if (!on.saml) return off("single sign-on")
      return `This email signs in with your company's single sign-on. Use “${on.oidc ? SIGN_IN_LABELS.saml : SIGN_IN_LABELS.sso}” above.`
    case "ldap":
      return on.ldap
        ? `This email signs in with your company directory. Use the “${SIGN_IN_LABELS.directoryTab}” tab above.`
        : off("your company directory")
    default:
      return ""
  }
}
