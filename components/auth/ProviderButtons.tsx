"use client"

// The sign-in methods a workspace has turned on, as buttons.
//
// The sign-in page and the sign-up page offer the same ones: an invitation
// admits its address through Google, GitHub or single sign-on as well as by
// password, so someone accepting one can pick the account they already use
// rather than make up a password. Which are on comes from /auth/providers.

import { cn } from "@/lib/utils/helpers/cn"
import { eyebrowClass } from "@/components/ui/eyebrow"
import { LoaderCircle } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import authService from "@/services/auth/AuthService"

interface OAuthButtonsProps {
  google: boolean
  github: boolean
  disabled: boolean
  /** Shows a spinner in place of the logos while a sign-in is under way. */
  busy?: boolean
  onGoogle: () => void
  onGithub: () => void
}

/** Continue with Google and Continue with GitHub, for those that are on. */
export function OAuthButtons({ google, github, disabled, busy, onGoogle, onGithub }: OAuthButtonsProps) {
  return (
    <div className="space-y-4">
      {google && (
        <Button variant="outline" className="w-full border-border/50 hover:bg-muted/50 transition-colors" disabled={disabled} onClick={onGoogle}>
          {busy ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>
          ) : (
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>)}
          Continue with Google
        </Button>
      )}

      {github && (
        <Button variant="outline" className="w-full border-border/50 hover:bg-muted/50 transition-colors" disabled={disabled} onClick={onGithub}>
          {busy ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>
          ) : (
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
            <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"
            />
            </svg>
          )}
          Continue with GitHub
        </Button>
      )}
    </div>
  )
}

/** The OIDC and SAML buttons under an Enterprise SSO divider, for those that are on. */
export function EnterpriseSSOButtons({ oidc, saml, disabled }: { oidc: boolean; saml: boolean; disabled: boolean }) {
  return (
    <div className="space-y-4">
      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-border/40"></div>
        <span className={cn(eyebrowClass, "flex-shrink mx-3")}>Enterprise SSO</span>
        <div className="flex-grow border-t border-border/40"></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {oidc && (
          <Button 
            variant="outline" 
            className="w-full text-xs py-2 h-9 border-border/50 hover:bg-muted/50 transition duration-200" 
            disabled={disabled} 
            onClick={() => authService.loginWithOIDC()}
          >
            <svg className="w-4 h-4 mr-1.5 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2zm1 10h-2v4h2v-4zm0-4h-2v2h2V8z" fill="currentColor"/>
            </svg>
            OIDC SSO
          </Button>
        )}
        {saml && (
          <Button 
            variant="outline" 
            className="w-full text-xs py-2 h-9 border-border/50 hover:bg-muted/50 transition duration-200" 
            disabled={disabled} 
            onClick={() => authService.loginWithSAML()}
          >
            <svg className="w-4 h-4 mr-1.5 text-success shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor"/>
            </svg>
            SAML 2.0
          </Button>
        )}
      </div>
    </div>
  )
}
