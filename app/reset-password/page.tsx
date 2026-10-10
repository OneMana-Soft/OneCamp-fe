"use client"

import { LoaderCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useRef, useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthField, AuthHeading, AuthShell, FormProblem, PasswordField, authControl } from "@/components/auth/AuthShell"
import { SpotError } from "@/components/ui/graphics/spots"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Where the server's answer left things: the form, done, or a link that
  // can't be used (old or used, or an account with no password here).
  const [outcome, setOutcome] = useState<"form" | "reset" | "link_refused" | "sso_managed">("form")
  const [error, setError] = useState("")
  // Which field the error is about; null for the form as a whole (the server's answer).
  const [errorField, setErrorField] = useState<"password" | "confirm" | null>(null)
  // The field an error is about gets the cursor, so the fix starts there.
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  if (!token) {
    return (
      <>
        <AuthHeading title="This link is incomplete" art={<SpotError />}>
          It&apos;s missing the part that says whose password to reset. Ask for a new link and open it from the email.
        </AuthHeading>
        <Button variant="outline" className={authControl} asChild><Link href="/forgot-password">Ask for a new link</Link></Button>
      </>
    )
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setErrorField(null)

    if (password !== confirmPassword) {
      setError("The two passwords are different. Type the same one in both.")
      setErrorField("confirm")
      confirmRef.current?.focus()
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
      const result = await authService.resetPassword(token, password)
      if (result.status === "failed") setError(result.msg)
      else setOutcome(result.status)
    } catch {
      setError("Your password wasn't changed. Try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (outcome === "reset") {
    return (
      <div role="status">
        <AuthHeading title="Your password is changed">
          Sign in with the new one.
        </AuthHeading>
        <Button className={authControl} asChild><Link href="/">Go to sign in</Link></Button>
      </div>
    )
  }

  // No password typed into the form would get past these, so the form goes
  // and the way on takes its place.
  if (outcome === "link_refused") {
    return (
      <div role="status">
        <AuthHeading title="This link has expired" art={<SpotError />}>
          A reset link works once, for an hour. Ask for a new one and open it from the email.
        </AuthHeading>
        <Button className={authControl} asChild><Link href="/forgot-password">Ask for a new link</Link></Button>
      </div>
    )
  }

  if (outcome === "sso_managed") {
    return (
      <div role="status">
        <AuthHeading title="Your account signs in with single sign-on">
          It has no OneCamp password to reset. Sign in with single sign-on instead.
        </AuthHeading>
        <Button className={authControl} asChild><Link href="/">Go to sign in</Link></Button>
      </div>
    )
  }

  return (
    <>
      <AuthHeading title="Choose a new password" />

      <form onSubmit={handleReset} className="space-y-4">
        <PasswordField
          ref={passwordRef}
          id="password"
          name="new-password"
          label="New password"
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

        <AuthField
          ref={confirmRef}
          id="confirm-password"
          name="confirm-password"
          label="Type it again"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          hint={password && confirmPassword && password === confirmPassword ? "They match." : undefined}
          error={errorField === "confirm" ? error : undefined}
          // The show button on the first field shows both.
          type={showPassword ? "text" : "password"}
        />

        {errorField === null && <FormProblem>{error}</FormProblem>}

        <Button type="submit" className={authControl} disabled={isLoading}>
          {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isLoading ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
