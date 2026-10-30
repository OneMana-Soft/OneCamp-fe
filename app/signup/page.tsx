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

import { Users } from "@/lib/icons";
import { SpotError, SpotInbox, SpotWelcome } from "@/components/ui/graphics/spots"
import { Button } from "@/components/ui/button"
import { useCallback, useEffect, useRef, useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { app_home_path } from "@/types/paths"
import { landingPath } from "@/lib/landing"
import { nameProblem } from "@/lib/validation/names"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthDivider, AuthField, AuthHeading, AuthPlaceholder, AuthShell, FormProblem, IdentityChip, PasswordField, StrengthMeter, authControl, authControlXl, initialsOf } from "@/components/auth/AuthShell"
import { InviteHero } from "@/components/auth/CampArt"
import { EnterpriseSSOButtons, OAuthButtons } from "@/components/auth/ProviderButtons"
import { useNamedWorkspace } from "@/hooks/useWorkspaceName"

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
  // The field an error is about gets the cursor, so the fix starts there.
  const nameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
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
      nameRef.current?.focus()
      return
    }

    if (password.length < 8) {
      setError("Use at least 8 characters.")
      setErrorField("password")
      passwordRef.current?.focus()
      return
    }

    if (password.length > 72) {
      setError("Use 72 characters or fewer.")
      setErrorField("password")
      passwordRef.current?.focus()
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
      setError("Your account wasn't created. Try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // The camp you are joining: the inviter beside its ring, and you, waiting
  // on the orbit until you join.
  const nameInitials = (n: string) => {
    const parts = n.trim().split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? "").toUpperCase()
  }
  const hero = (
    <InviteHero
      inviter={invitedBy.inviter}
      inviterInitials={nameInitials(invitedBy.inviter)}
      you={invitationEmail || token}
      youInitials={joined ? nameInitials(joined.name) || initialsOf(invitationEmail) : initialsOf(invitationEmail)}
      joined={joined !== null}
    />
  )
  const shell = (body: React.ReactNode) => <AuthShell side={hero}>{body}</AuthShell>
  // The workspace's name, the server's first (hooks/useWorkspaceName), else its address.
  const workspace = useNamedWorkspace() || invitedBy.workspace

  if (isValidating) {
    return shell(<AuthPlaceholder label="Checking your invitation" fields={2} />)
  }

  if (checkFailed) {
    return shell(
      <>
        <AuthHeading title="Couldn't check your invitation" art={<SpotError />}>
          This workspace didn&apos;t answer, so the link may well be fine. Check your connection and try again.
        </AuthHeading>
        <Button size="lg" className={authControl} onClick={checkInvitation}>
          Try again
        </Button>
      </>,
    )
  }

  if (tokenInvalid) {
    return shell(
      <>
        {/* The envelope with its sun spark: an invitation, not a breakage. */}
        <AuthHeading title="This invitation can't be used" art={<SpotInbox size={96} />}>
          {error || "The link is incomplete or has expired. Ask whoever invited you to send a new one."}
        </AuthHeading>
        <Button variant="secondary" size="lg" className={authControl} asChild><Link href="/">Go to sign in</Link></Button>
      </>,
    )
  }

  if (joined) {
    return shell(
      <div role="status" aria-live="polite">
        <AuthHeading title={`You're in, ${joined.name}`} art={<SpotWelcome />}>
          Your handle is <span className="font-medium text-foreground">@{joined.handle}</span>. You can change it in your
          profile.
        </AuthHeading>
        <Button size="lg" className={authControl} onClick={() => router.push(joined.destination)}>
          Continue
        </Button>
      </div>,
    )
  }

  const hasOAuth = providers.google || providers.github
  const hasSSO = providers.oidc || providers.saml
  const hasOtherWays = hasOAuth || hasSSO || providers.ldap

  const joinLabel = workspace ? `Join ${workspace}` : "Join your team"

  return shell(
    <>
      <AuthHeading display title={workspace ? <>Join <span translate="no">{workspace}</span></> : "Join your team"}>
        <p>
          {invitedBy.inviter ? <><span className="font-medium text-foreground">{invitedBy.inviter}</span> invited </> : "An invitation for "}
          <span className="font-medium text-foreground" translate="no">{invitationEmail}</span>.
        </p>
      </AuthHeading>

      <div className="space-y-6">
      {/* The address is the invitation's, so it is shown, not asked for. */}
      <IdentityChip email={invitationEmail} />

      {hasOtherWays && (
        <div className="space-y-2">
          <div className="auth-providers">
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
            <Button variant="secondary" size="lg" className={`${authControl} auth-wide`} asChild>
              <Link href="/?tab=directory">
                <Users aria-hidden="true" />
                Sign in with your directory account
              </Link>
            </Button>
          )}
          </div>
          <p className="auth-hint">
            Use the account for {invitationEmail}.
          </p>
        </div>
      )}

      {providers.email && (
        <>
          {hasOtherWays && <AuthDivider>or set a password</AuthDivider>}

          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            <AuthField
              ref={nameRef}
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
              ref={passwordRef}
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
              below={<StrengthMeter password={password} />}
            />

            {/* Hidden from view, there for a password manager: the address the
                new password belongs to, so it saves under the right account. */}
            <input type="email" name="email" autoComplete="username" value={invitationEmail} readOnly hidden />

            {errorField === null && <FormProblem>{error}</FormProblem>}

            <Button type="submit" size="lg" className={authControlXl} busy={isLoading}>
              {isLoading ? "Joining…" : joinLabel}
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
    </>,
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
