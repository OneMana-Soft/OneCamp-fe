"use client"

import { LoaderCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useEffect, useRef, useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthField, AuthHeading, AuthShell, FormProblem, MatchCheck, PasswordField, StrengthMeter, authControl } from "@/components/auth/AuthShell"
import { SpotKey } from "@/components/auth/authSpots"
import { toast } from "@/hooks/use-toast"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const router = useRouter()

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

  // A link that can't be used says so as the page opens, not after a new
  // password has been typed twice (QA SH-20). An unanswered check leaves the
  // form: its submit hears what the server says.
  useEffect(() => {
    if (!token) return
    let live = true
    void authService.checkResetLink(token).then((link) => {
      if (live && link === "refused") setOutcome((now) => (now === "form" ? "link_refused" : now))
    })
    return () => {
      live = false
    }
  }, [token])

  // Changed: back to sign-in, where the toast says what to do next.
  useEffect(() => {
    if (outcome !== "reset") return
    toast({ title: "Password changed. Sign in with the new one.", tone: "success" })
    router.push("/")
  }, [outcome, router])

  if (!token) {
    return (
      <>
        <AuthHeading title="This link is missing or used" art={<SpotKey />}>
          It&apos;s missing the part that says whose password to reset. Ask for a new link and open it from the email.
        </AuthHeading>
        <Button size="lg" className={authControl} asChild><Link href="/forgot-password">Request a new one</Link></Button>
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
        <Button size="lg" className={authControl} asChild><Link href="/">Go to sign in</Link></Button>
      </div>
    )
  }

  // No password typed into the form would get past these, so the form goes
  // and the way on takes its place.
  if (outcome === "link_refused") {
    return (
      <div role="status">
        <AuthHeading title="This link has expired" art={<SpotKey />}>
          A reset link works once, for an hour. Ask for a new one and open it from the email.
        </AuthHeading>
        <Button size="lg" className={authControl} asChild><Link href="/forgot-password">Request a new one</Link></Button>
      </div>
    )
  }

  if (outcome === "sso_managed") {
    return (
      <div role="status">
        <AuthHeading title="Your account signs in with single sign-on">
          It has no OneCamp password to reset. Sign in with single sign-on instead.
        </AuthHeading>
        <Button size="lg" className={authControl} asChild><Link href="/">Go to sign in</Link></Button>
      </div>
    )
  }

  const matches = confirmPassword.length > 0 && password === confirmPassword
  // The second field rings in danger once it is as long as the first and still differs.
  const mismatch = confirmPassword.length >= password.length && confirmPassword.length > 0 && !matches

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
          below={<StrengthMeter password={password} />}
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
          error={errorField === "confirm" ? error : undefined}
          aria-invalid={errorField === "confirm" || mismatch ? true : undefined}
          end={matches ? <MatchCheck /> : undefined}
          // The show button on the first field shows both.
          type={showPassword ? "text" : "password"}
        />

        {errorField === null && <FormProblem>{error}</FormProblem>}

        <Button type="submit" size="lg" className={authControl} aria-busy={isLoading || undefined}>
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
