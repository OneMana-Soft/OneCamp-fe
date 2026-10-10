"use client"

import { LoaderCircle, ArrowLeft } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useState } from "react"
import authService from "@/services/auth/AuthService"
import Link from "next/link"
import { AuthField, AuthHeading, AuthShell, authControl, authLink } from "@/components/auth/AuthShell"
import { cn } from "@/lib/utils/helpers/cn"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      const result = await authService.forgotPassword(email)
      if (result.ok) {
        setIsSent(true)
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
          <AuthHeading title="Check your email">
            If <span className="font-medium text-foreground">{email}</span> has an account here, a link to set a new
            password is on its way. It works for an hour. If it hasn&apos;t come in a few minutes, look in spam.
          </AuthHeading>
          <Button variant="outline" className={authControl} asChild>
            <Link href="/">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <AuthHeading title="Reset your password">
            Enter the email you sign in with and we&apos;ll send you a link to set a new one.
          </AuthHeading>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              error={error || undefined}
            />

            <Button type="submit" className={authControl} disabled={isLoading}>
              {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
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
