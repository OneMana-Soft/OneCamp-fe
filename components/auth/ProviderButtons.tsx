"use client"

// The sign-in methods a workspace has turned on, as buttons.
//
// The sign-in page and the sign-up page offer the same ones: an invitation
// admits its address through Google, GitHub or single sign-on as well as by
// password, so someone accepting one can pick the account they already use
// rather than make up a password. Which are on comes from /auth/providers.
//
// Design v3 (admin.md F2): secondary lg buttons (raised at e1, 40px, 14/510)
// with the provider's own full-colour 18px mark. Google and GitHub sit side by
// side in a 2-up grid when both are on (Clerk's layout); everything else takes
// the full width. The buttons are the grid's children, so the page lays them
// out in `.auth-providers` beside its passkey and directory buttons.

import { Building2, LoaderCircle } from "@/lib/icons"
import { authControl } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import authService from "@/services/auth/AuthService"
import { SIGN_IN_LABELS } from "@/lib/auth/signInHints"
import { cn } from "@/lib/utils/helpers/cn"

/** Google's mark in its own four colours (a brand mark is the one place a logo keeps its colours). */
export function GoogleMark() {
  return (
    <svg className="auth-mark" viewBox="0 0 24 24" aria-hidden="true" data-provider-mark="google">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

/** GitHub's mark, in ink (it is a one-colour mark). */
export function GitHubMark() {
  return (
    <svg className="auth-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-provider-mark="github">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"
      />
    </svg>
  )
}

/** A provider button: secondary lg, the width of its grid cell. */
export const providerButton = cn(authControl, "text-sm")

interface OAuthButtonsProps {
  google: boolean
  github: boolean
  disabled: boolean
  /** Shows a spinner in place of the marks while a sign-in is under way. */
  busy?: boolean
  onGoogle: () => void
  onGithub: () => void
}

/**
 * Continue with Google and Continue with GitHub, for those that are on. Side
 * by side, each says only its provider's name, and its accessible name is
 * still the whole "Continue with …" (the words a hint points at).
 */
export function OAuthButtons({ google, github, disabled, busy, onGoogle, onGithub }: OAuthButtonsProps) {
  const both = google && github
  const spinner = <LoaderCircle className="animate-spin" aria-hidden="true" />
  return (
    <>
      {google && (
        <Button
          variant="secondary"
          size="lg"
          className={cn(providerButton, !both && "auth-wide")}
          disabled={disabled}
          onClick={onGoogle}
          aria-label={SIGN_IN_LABELS.google}
        >
          {busy ? spinner : <GoogleMark />}
          {both ? "Google" : SIGN_IN_LABELS.google}
        </Button>
      )}
      {github && (
        <Button
          variant="secondary"
          size="lg"
          className={cn(providerButton, !both && "auth-wide")}
          disabled={disabled}
          onClick={onGithub}
          aria-label={SIGN_IN_LABELS.github}
        >
          {busy ? spinner : <GitHubMark />}
          {both ? "GitHub" : SIGN_IN_LABELS.github}
        </Button>
      )}
    </>
  )
}

/**
 * The workspace's single sign-on, OIDC and SAML, for those that are on: full
 * width in the same grid, in the words a person reads rather than protocol
 * names (unless both kinds are on, when each says which).
 */
export function EnterpriseSSOButtons({ oidc, saml, disabled }: { oidc: boolean; saml: boolean; disabled: boolean }) {
  const both = oidc && saml
  return (
    <>
      {oidc && (
        <Button variant="secondary" size="lg" className={cn(providerButton, "auth-wide")} disabled={disabled} onClick={() => authService.loginWithOIDC()}>
          <Building2 aria-hidden="true" />
          {both ? SIGN_IN_LABELS.oidc : SIGN_IN_LABELS.sso}
        </Button>
      )}
      {saml && (
        <Button variant="secondary" size="lg" className={cn(providerButton, "auth-wide")} disabled={disabled} onClick={() => authService.loginWithSAML()}>
          <Building2 aria-hidden="true" />
          {both ? SIGN_IN_LABELS.saml : SIGN_IN_LABELS.sso}
        </Button>
      )}
    </>
  )
}
