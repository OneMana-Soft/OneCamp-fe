"use client"

// Forgot password (design v3, admin.md F6): the centred shell with the soft
// canvas glow. The sent state shows the envelope, the address masked, and
// "Send again" after a 30 second countdown, so a second email is one press
// away without inviting a flood of them.

import { LoaderCircle, ArrowLeft } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import authService from "@/services/auth/AuthService"
import Link from "next/link"
import { AuthField, AuthHeading, AuthShell, authControl, authLink } from "@/components/auth/AuthShell"
import { SpotInbox } from "@/components/ui/graphics/spots"
import { cn } from "@/lib/utils/helpers/cn"

/** Seconds before the link can be sent again. */
const RESEND_AFTER_S = 30

/** "priya@kestrel.studio" as "p•••@kestrel.studio": enough to recognise, not to read off a shoulder. */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@")
  if (!domain) return email
  return `${name.slice(0, 1)}•••@${domain}`
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState("")
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(t)
  }, [wait])

  const send = async () => {
    setError("")
    setIsLoading(true)
    try {
      const result = await authService.forgotPassword(email)
      if (result.ok) {
        setIsSent(true)
        setWait(RESEND_AFTER_S)
      } else {
        setError(result.msg)
      }
    } catch {
      setError("The link wasn't sent. Try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthShell>
      {isSent ? (
        <div role="status">
          <AuthHeading title="Check your email" art={<SpotInbox size={96} />}>
            If <span className="font-medium text-foreground" translate="no">{maskEmail(email)}</span> has an account here, a
            link to set a new password is on its way. It works for 1 hour.
          </AuthHeading>
          <div className="space-y-2">
            <Button variant="ghost" size="lg" className={authControl} disabled={wait > 0 || isLoading} onClick={() => void send()}>
              {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {wait > 0 ? (
                <>
                  Send again in <span className="auth-countdown">0:{String(wait).padStart(2, "0")}</span>
                </>
              ) : (
                "Send again"
              )}
            </Button>
            {error && <p role="alert" className="auth-field-error">{error}</p>}
            <p className="text-sm">
              <Link href="/" className={cn(authLink, "rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline")}>
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to sign in
              </Link>
            </p>
          </div>
        </div>
      ) : (
        <>
          <AuthHeading title="Reset your password">
            Enter the email you sign in with and we&apos;ll send you a link to set a new one.
          </AuthHeading>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            className="space-y-4"
          >
            <AuthField
              id="email"
              name="email"
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              readOnly={isLoading}
              error={error || undefined}
            />

            <Button type="submit" size="lg" className={authControl} busy={isLoading}>
              {isLoading ? "Sending…" : "Send reset link"}
            </Button>
          </form>

          <p className="mt-6 text-sm">
            <Link href="/" className={cn(authLink, "rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline")}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
