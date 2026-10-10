"use client"

import { LoaderCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useEffect, useRef, useState } from "react"
import authService from "@/services/auth/AuthService"
import { app_home_path } from "@/types/paths"
import { useRouter } from "next/navigation"
import { AuthField, AuthHeading, AuthPlaceholder, AuthShell, FormProblem, PasswordField, authControl } from "@/components/auth/AuthShell"

export default function AdminSetupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [username, setUsername] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  // The install can name the one address allowed to claim this workspace. When it
  // has, say so under the field, so the operator is not left to learn the rule
  // from a refusal.
  const [pinned, setPinned] = useState(false)
  const [error, setError] = useState("")
  // Which field the error is about; null for the form as a whole (the server's answer).
  const [errorField, setErrorField] = useState<"email" | "password" | "confirm" | null>(null)
  // The field an error is about gets the cursor, so the fix starts there.
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    authService.getAdminSetupStatus().then(({ required, pinned }) => {
      if (!required) {
        router.push("/")
      } else {
        setPinned(pinned)
        setIsChecking(false)
      }
    })
  }, [router])

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setErrorField(null)

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(email)) {
      setError("Enter an email address like you@company.com.")
      setErrorField("email")
      emailRef.current?.focus()
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

    if (password !== confirmPassword) {
      setError("The two passwords are different. Type the same one in both.")
      setErrorField("confirm")
      confirmRef.current?.focus()
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.adminSetup(email, password, username)
      if (result.ok) {
        router.push(app_home_path)
      } else {
        setError(result.msg)
      }
    } catch {
      setError("The admin account wasn't created. Try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isChecking) {
    return (
      <AuthShell>
        <AuthPlaceholder label="Checking this server" fields={4} />
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthHeading title="Set up your workspace">
        Nobody has an account on this server yet. The one you make now is its admin, and you&apos;ll invite your team
        from inside.
      </AuthHeading>

      <form onSubmit={handleSetup} className="space-y-4" noValidate>
        <AuthField
          ref={emailRef}
          id="email"
          name="email"
          label="Your email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          hint={pinned ? "Use the address you gave when you installed OneCamp. This server accepts only that one." : undefined}
          error={errorField === "email" ? error : undefined}
        />

        <AuthField
          id="username"
          name="nickname"
          label={<>Username <span className="font-normal text-muted-foreground">(optional)</span></>}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={25}
          autoComplete="nickname"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          hint="Leave it empty to use what comes before the @ in your email."
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
          // The show button on the first field shows both.
          type={showPassword ? "text" : "password"}
        />

        {errorField === null && <FormProblem>{error}</FormProblem>}

        <Button type="submit" className={authControl} disabled={isLoading}>
          {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isLoading ? "Creating your account…" : "Create admin account"}
        </Button>
      </form>
    </AuthShell>
  )
}
