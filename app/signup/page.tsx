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

import { LoaderCircle, User, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Users } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/themeProvider/theme-toggle"
import { useEffect, useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { app_home_path } from "@/types/paths"
import { landingPath } from "@/lib/landing"
import { nameProblem } from "@/lib/validation/names"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Input } from "@/components/ui/input"
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
  const [tokenInvalid, setTokenInvalid] = useState(false)
  // Until /auth/providers answers, a password is the one way offered.
  const [providers, setProviders] = useState<Providers>({ email: true, google: false, github: false, oidc: false, saml: false, ldap: false })
  // Joined: who they are now, and where they are going.
  const [joined, setJoined] = useState<{ name: string; handle: string; destination: string } | null>(null)

  useEffect(() => {
    if (!token) {
      setTokenInvalid(true)
      setIsValidating(false)
      return
    }

    authService.getEnabledProviders().then((p) => {
      if (p) setProviders(p)
    })
    authService.validateInvitationToken(token).then((result) => {
      if (result.valid) {
        setInvitationEmail(result.email)
        setInvitedBy({ inviter: result.inviterName, workspace: result.workspace })
        // A name an import already knows them by; theirs to change.
        if (result.name) setName((typed) => typed || result.name)
      } else {
        setTokenInvalid(true)
        setError(result.msg)
      }
      setIsValidating(false)
    })
  }, [token])

  // Says who they are, then opens the workspace on its own.
  useEffect(() => {
    if (!joined) return
    const timer = window.setTimeout(() => router.push(joined.destination), WELCOME_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [joined, router])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const problem = nameProblem("person", "Your name", name)
    if (problem) {
      setError(problem)
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    if (password.length > 72) {
      setError("Password must not exceed 72 characters")
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
      <div className="flex flex-col items-center gap-4">
        <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Validating invitation…</p>
      </div>
    )
  }

  if (tokenInvalid) {
    return (
      <div className="space-y-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-lg font-semibold">Invalid Invitation</h2>
        <p className="text-sm text-muted-foreground">
          {error || "This invitation link is invalid or has expired. Please contact your administrator for a new invitation."}
        </p>
        <Button variant="outline" className="mt-4" asChild><Link href="/">Back to Login</Link></Button>
      </div>
    )
  }

  if (joined) {
    return (
      <div className="space-y-4 text-center" role="status" aria-live="polite">
        <CheckCircle className="h-12 w-12 text-success mx-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re in, {joined.name}</h1>
        <p className="text-sm text-muted-foreground">
          Your handle is <span className="font-medium text-foreground">@{joined.handle}</span>. People can mention you with it,
          and you can change it in your profile.
        </p>
        <Button className="w-full h-11 md:h-10" onClick={() => router.push(joined.destination)}>
          Continue
        </Button>
      </div>
    )
  }

  const hasOAuth = providers.google || providers.github
  const hasSSO = providers.oidc || providers.saml
  const hasOtherWays = hasOAuth || hasSSO || providers.ldap

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Join the workspace</h1>
        {(invitedBy.inviter || invitedBy.workspace) && (
          <p className="text-sm text-muted-foreground">
            {invitedBy.inviter ? <><span className="font-medium text-foreground">{invitedBy.inviter}</span> invited you</> : "You're invited"}
            {invitedBy.workspace && <> to <span className="font-medium text-foreground">{invitedBy.workspace}</span></>}.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          You were invited as <span className="font-medium text-foreground">{invitationEmail}</span>
        </p>
      </div>

      {hasOtherWays && (
        <div className="space-y-4">
          <p className="text-xs text-center text-muted-foreground">
            Use the account for {invitationEmail}, or set a password below.
          </p>
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
            <Button variant="outline" className="w-full border-border/50 hover:bg-muted/50 transition-colors" asChild>
              <Link href="/?tab=directory">
                <Users className="mr-2 h-4 w-4" />
                Sign in with your directory account
              </Link>
            </Button>
          )}
        </div>
      )}

      {providers.email && (
        <>
          {hasOtherWays && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or set a password</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">Your name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="How your team will see you"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={60}
                  autoComplete="name"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors md:h-9 md:w-9"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full h-11 md:h-10" disabled={isLoading}>
              {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create account
            </Button>
          </form>
        </>
      )}

      {!providers.email && error && (
        <p role="alert" className="text-sm text-destructive text-center">{error}</p>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Already have an account?{" "}
        <Link href="/" className="text-foreground hover:underline">Sign in</Link>
      </p>
    </div>
  )
}

export default function SignupPage() {
  return (
    <div className="min-h-screen text-foreground flex flex-col justify-center items-center px-4 py-12 relative">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm mb-8 flex justify-center">
        <img src="/logo.svg" alt="OneCamp Logo" width={48} height={48} className="h-12 w-12 mx-auto" />
      </div>

      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="flex justify-center"><LoaderCircle className="h-8 w-8 animate-spin" /></div>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  )
}
