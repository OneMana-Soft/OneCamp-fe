"use client"

import { LoaderCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthField, AuthHeading, AuthShell, FormProblem, PasswordField, authControl } from "@/components/auth/AuthShell"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isReset, setIsReset] = useState(false)
  const [error, setError] = useState("")
  // Which field the error is about; null for the form as a whole (the server's answer).
  const [errorField, setErrorField] = useState<"password" | "confirm" | null>(null)

  if (!token) {
    return (
      <>
        <AuthHeading title="This link is incomplete">
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
      const result = await authService.resetPassword(token, password)
      if (result.ok) {
        setIsReset(true)
      } else {
        setError(result.msg)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isReset) {
    return (
      <div role="status">
        <AuthHeading title="Your password is changed">
          Sign in with the new one.
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
