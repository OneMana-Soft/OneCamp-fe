/**
 * What the sign-in page says for a refused sign-in: a short title that fits
 * the reason, the words for it, and how loud to say it.
 *
 * Every refusal used to be titled "Authentication Failed" in red, including
 * the ones that are nobody's fault: pressing Cancel, an invitation that ran
 * out, a sign-in left open too long. Those now read calmly; red is kept for a
 * sign-in that actually broke.
 *
 * An allowlist of the codes the server sends (through SignInErrorURL). Any
 * other code gets the general words, never the `message` it came with, so a
 * crafted link can't put text on the page.
 */

/** neutral: nothing went wrong. warning: something to do first. error: it broke. */
export type RefusalTone = "neutral" | "warning" | "error"

export interface SignInRefusal {
  title: string
  message: string
  tone: RefusalTone
}

const COULDNT = "Couldn't sign you in"

const REFUSALS: Record<string, SignInRefusal> = {
  // OAuth (Google/GitHub). A refusal names its reason; `unauthorized` is what
  // servers sent for every refusal before these codes existed.
  oauth_email_unverified: {
    title: "Email not verified",
    message: "Google or GitHub hasn't verified this email address. Verify it there, then sign in again.",
    tone: "warning",
  },
  oauth_not_invited: {
    title: "Not invited yet",
    message: "This email address isn't invited to this workspace. Ask your administrator to invite you, or to add your address to the sign-up allow-list.",
    tone: "warning",
  },
  oauth_failed: { title: COULDNT, message: "Signing in with Google or GitHub didn't finish. Please try again.", tone: "error" },
  invitation_expired: {
    title: "Invitation expired",
    message: "Your invitation has expired. Ask whoever invited you to send it again.",
    tone: "warning",
  },
  unauthorized: {
    title: "Not invited yet",
    message: "This account isn't invited to this workspace. Ask your administrator for an invitation.",
    tone: "warning",
  },
  // Any provider: an address written with characters outside ASCII, which is
  // matched to no account; cancelled there; or a sign-in that outlived its
  // state (taken too long, or opened twice).
  address_unsupported: {
    title: "Address not supported",
    message: "That account's email address has characters other than plain letters, digits and symbols, so it can't sign in here. Use an account whose address is written in plain letters, or ask your administrator.",
    tone: "warning",
  },
  signin_cancelled: { title: "Sign-in cancelled", message: "Sign-in was cancelled. Try again when you're ready.", tone: "neutral" },
  signin_expired: { title: "Sign-in expired", message: "That sign-in took too long or was already used. Start again.", tone: "neutral" },
  // OIDC
  oidc_disabled: {
    title: "Single sign-on is off",
    message: "Single sign-on is turned off on this workspace. Sign in another way, or ask your administrator to turn it on.",
    tone: "warning",
  },
  oidc_misconfigured: {
    title: "Single sign-on isn't set up",
    message: "Single sign-on isn't fully set up on this workspace yet. Sign in another way, or ask your administrator to finish setting it up.",
    tone: "error",
  },
  oidc_invalid_request: { title: COULDNT, message: "Your identity provider sent an incomplete sign-in. Try again.", tone: "error" },
  oidc_invalid_state: { title: "Sign-in expired", message: "That sign-in took too long or was already used. Start again.", tone: "neutral" },
  oidc_state_mint_failed: { title: COULDNT, message: "Single sign-on couldn't start. Try again in a minute.", tone: "error" },
  oidc_invalid_code: { title: COULDNT, message: "Your identity provider didn't confirm the sign-in. Try again.", tone: "error" },
  oidc_no_token: {
    title: COULDNT,
    message: "Your identity provider didn't send what this workspace needs to sign you in. Try again, and if it keeps happening, ask your administrator to check single sign-on.",
    tone: "error",
  },
  oidc_verification_failed: {
    title: COULDNT,
    message: "This workspace couldn't check your identity provider's answer. Try again, and if it keeps happening, ask your administrator to check single sign-on.",
    tone: "error",
  },
  oidc_invalid_claims: {
    title: COULDNT,
    message: "This workspace couldn't read your identity provider's answer. Try again, and if it keeps happening, ask your administrator to check single sign-on.",
    tone: "error",
  },
  oidc_no_email: {
    title: "No email address",
    message: "Your identity provider didn't share your email address, which this workspace knows you by. Ask your administrator to have it send email addresses.",
    tone: "error",
  },
  oidc_email_unverified: {
    title: "Email not verified",
    message: "Your identity provider reports this email as unverified. Verify it and try again.",
    tone: "warning",
  },
  // SAML
  saml_disabled: {
    title: "Single sign-on is off",
    message: "Single sign-on is turned off on this workspace. Sign in another way, or ask your administrator to turn it on.",
    tone: "warning",
  },
  saml_invalid: {
    title: COULDNT,
    message: "This workspace couldn't use your identity provider's answer. Try again, and if it keeps happening, ask your administrator to check single sign-on.",
    tone: "error",
  },
  saml_no_email: {
    title: "No email address",
    message: "Your identity provider didn't share an email address this workspace can use. Ask your administrator to have it send email addresses.",
    tone: "error",
  },
  // Shared
  provision_failed: {
    title: "Couldn't set up your account",
    message: "Your account couldn't be set up. Try again, and if it keeps happening, ask your administrator.",
    tone: "error",
  },
  seat_limit: {
    title: "No free seat",
    message: "This workspace is on OneCamp's free plan and has no room for another person. Ask your administrator to free a place or remove the limit.",
    tone: "warning",
  },
  plan_required: {
    title: "Single sign-on needs a licence",
    message: "Single sign-on needs a OneCamp licence, and this workspace is on the free plan. Sign in with your email, or ask your administrator.",
    tone: "warning",
  },
  session_failed: { title: COULDNT, message: "Your session couldn't start. Try again.", tone: "error" },
  db_error: { title: COULDNT, message: "This workspace couldn't finish the sign-in. Try again in a minute.", tone: "error" },
  resolution_failed: {
    title: COULDNT,
    message: "This workspace couldn't match the sign-in to an account. Try again, and if it keeps happening, ask your administrator.",
    tone: "error",
  },
}

const UNKNOWN: SignInRefusal = {
  title: COULDNT,
  message: "Sign-in failed. Please try again or contact your administrator.",
  tone: "error",
}

/** What to say for a refusal's code; the general words for a code not known. */
export function signInRefusal(code: string): SignInRefusal {
  return Object.prototype.hasOwnProperty.call(REFUSALS, code) ? REFUSALS[code] : UNKNOWN
}
