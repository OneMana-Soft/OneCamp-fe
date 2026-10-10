"use client"

// Accepting an invitation.
//
// As few steps as joining can take. It asks for the person's name, in any
// language (the server makes their @handle from it and the page shows it),
// and one password with a show button, not two; and it offers every way of
// signing in this workspace has turned on, because an invitation admits its
// address through Google, GitHub or single sign-on as well as by password.
// Someone an import already knows finds their name filled in. It says who
// invited them and to which workspace, as the email did.

import { LoaderCircle, Users } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useCallback, useEffect, useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { app_home_path } from "@/types/paths"
import { landingPath } from "@/lib/landing"
import { nameProblem } from "@/lib/validation/names"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthDivider, AuthField, AuthHeading, AuthShell, FormProblem, PasswordField, authControl } from "@/components/auth/AuthShell"
import { EnterpriseSSOButtons, OAuthButtons } from "@/components/auth/ProviderButtons"

/** How long the page says who they are before opening the workspace. */
const WELCOME_PAUSE_MS = 2500

/** What this workspace lets people sign in with, as /auth/providers says. */
interface Providers {
  email: boolean
  google: boolean
  github: boolean
  oidc: boolean
  saml: boolean
  ldap: boolean
}

function SignupForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const router = useRouter()

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [invitationEmail, setInvitationEmail] = useState("")
  // Who invited them, and the workspace's address; either may be unknown.
  const [invitedBy, setInvitedBy] = useState({ inviter: "", workspace: "" })
  const [error, setError] = useState("")
  // Which field the error is about, so it is said under that field; null for the form as a whole.
  const [errorField, setErrorField] = useState<"name" | "password" | null>(null)
  const [tokenInvalid, setTokenInvalid] = useState(false)
  // The check got no answer about the link: not the same as a dead link.
  const [checkFailed, setCheckFailed] = useState(false)
  // Until /auth/providers answers, a password is the one way offered.
  const [providers, setProviders] = useState<Providers>({ email: true, google: false, github: false, oidc: false, saml: false, ldap: false })
  // Joined: who they are now, and where they are going.
  const [joined, setJoined] = useState<{ name: string; handle: string; destination: string } | null>(null)

  const checkInvitation = useCallback(() => {
    setIsValidating(true)
    setCheckFailed(false)
    authService.validateInvitationToken(token).then((result) => {
      if (result.valid) {
        setInvitationEmail(result.email)
        setInvitedBy({ inviter: result.inviterName, workspace: result.workspace })
        // A name an import already knows them by; theirs to change.
        if (result.name) setName((typed) => typed || result.name)
      } else if (result.unreachable) {
        setCheckFailed(true)
      } else {
        setTokenInvalid(true)
        setError(result.msg)
      }
      setIsValidating(false)
    })
  }, [token])

  useEffect(() => {
    if (!token) {
      setTokenInvalid(true)
      setIsValidating(false)
      return
    }

    authService.getEnabledProviders().then((p) => {
      if (p) setProviders(p)
    })
    checkInvitation()
  }, [token, checkInvitation])

  // Says who they are, then opens the workspace on its own.
  useEffect(() => {
    if (!joined) return
    const timer = window.setTimeout(() => router.push(joined.destination), WELCOME_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [joined, router])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setErrorField(null)

    const problem = nameProblem("person", "Your name", name)
    if (problem) {
      setError(problem)
      setErrorField("name")
      return
    }

    if (password.length < 8) {
      setError("Use at least 8 characters.")
      setErrorField("password")
      return
    }

    if (password.length > 72) {
      setError("Use 72 characters or fewer.")
      setErrorField("password")
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.signup(token, name.trim(), password)
      if (result.ok) {
        // Into the channel they were put in, with the message box ready.
        const destination = landingPath(result.landing) ?? app_home_path
        if (result.handle) {
          setJoined({ name: result.name || name.trim(), handle: result.handle, destination })
        } else {
          router.push(destination)
        }
      } else {
        setError(result.msg)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidating) {
    return (
      <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking your invitation…
      </div>
    )
  }

  if (checkFailed) {
    return (
      <>
        <AuthHeading title="Couldn't check your invitation">
          This workspace didn&apos;t answer, so the link may well be fine. Check your connection and try again.
        </AuthHeading>
        <Button className={authControl} onClick={checkInvitation}>
          Try again
        </Button>
      </>
    )
  }

  if (tokenInvalid) {
    return (
      <>
        <AuthHeading title="This invitation can't be used">
          {error || "The link is incomplete or has expired. Ask whoever invited you to send a new one."}
        </AuthHeading>
        <Button variant="outline" className={authControl} asChild><Link href="/">Go to sign in</Link></Button>
      </>
    )
  }

  if (joined) {
    return (
      <div role="status" aria-live="polite">
        <AuthHeading title={`You're in, ${joined.name}`}>
          Your handle is <span className="font-medium text-foreground">@{joined.handle}</span>. You can change it in your
          profile.
        </AuthHeading>
        <Button className={authControl} onClick={() => router.push(joined.destination)}>
          Continue
        </Button>
      </div>
    )
  }

  const hasOAuth = providers.google || providers.github
  const hasSSO = providers.oidc || providers.saml
  const hasOtherWays = hasOAuth || hasSSO || providers.ldap

  return (
    <>
      <AuthHeading title="Join your team">
        <p>
          {invitedBy.inviter ? <><span className="font-medium text-foreground">{invitedBy.inviter}</span> invited you</> : "You're invited"}
          {invitedBy.workspace && <> to <span className="font-medium text-foreground" translate="no">{invitedBy.workspace}</span></>}
          {" as "}<span className="font-medium text-foreground">{invitationEmail}</span>.
        </p>
      </AuthHeading>

      <div className="space-y-6">
      {hasOtherWays && (
        <div className="space-y-2">
          {hasOAuth && (
            <OAuthButtons
              google={providers.google}
              github={providers.github}
              disabled={isLoading}
              onGoogle={() => void authService.loginWithGoogle()}
              onGithub={() => void authService.loginWithGithub()}
            />
          )}
          {hasSSO && <EnterpriseSSOButtons oidc={providers.oidc} saml={providers.saml} disabled={isLoading} />}
          {providers.ldap && (
            <Button variant="outline" className={authControl} asChild>
              <Link href="/?tab=directory">
                <Users aria-hidden="true" />
                Sign in with your directory account
              </Link>
            </Button>
          )}
          <p className="pt-1 text-xs text-muted-foreground">
            Use the account for {invitationEmail}.
          </p>
        </div>
      )}

      {providers.email && (
        <>
          {hasOtherWays && <AuthDivider>or set a password</AuthDivider>}

          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            <AuthField
              id="name"
              name="name"
              label="Your name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              autoComplete="name"
              hint="How your team will see you, in any language."
              error={errorField === "name" ? error : undefined}
            />

            <PasswordField
              id="password"
              name="new-password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              hint="At least 8 characters."
              error={errorField === "password" ? error : undefined}
              visible={showPassword}
              onVisibleChange={setShowPassword}
            />

            {/* Hidden from view, there for a password manager: the address the
                new password belongs to, so it saves under the right account. */}
            <input type="email" name="email" autoComplete="username" value={invitationEmail} readOnly hidden />

            {errorField === null && <FormProblem>{error}</FormProblem>}

            <Button type="submit" className={authControl} disabled={isLoading}>
              {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isLoading ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </>
      )}

      {!providers.email && <FormProblem>{error}</FormProblem>}

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
      </div>
    </>
  )
}

export default function SignupPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  )
}
