"use client"

// The first run (design v3, admin.md §5, mock M9): the camp lights up.
//
//   Step 1  the first admin's account, beside a grey outline ring on empty
//           dashed orbits: the camp before anyone arrives.
//   Then    the ignition: the form fades out, the gradient ring fades in over
//           the grey one on a spring, the spark burst fires from it (the
//           first of the area's four celebration moments) and the ember glow
//           steps up. At most 1.4s; Enter skips it. Reduced motion: the ring
//           is gradient at once, no burst, and a 140ms crossfade.
//   Step 2  make it yours: the camp's colour (components/auth/FirstRun).
//   Step 3  who's coming: invitations, each one joining the orbits.

import { LoaderCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { useCallback, useEffect, useRef, useState } from "react"
import authService from "@/services/auth/AuthService"
import { app_home_path } from "@/types/paths"
import { useRouter } from "next/navigation"
import {
  AuthField,
  AuthHeading,
  AuthPlaceholder,
  AuthShell,
  FormProblem,
  MatchCheck,
  PasswordField,
  StepPill,
  StrengthMeter,
  authControl,
  authControlXl,
  initialsOf,
} from "@/components/auth/AuthShell"
import { CampBand, FirstRunCamp, useHost, useReducedMotion } from "@/components/auth/CampArt"
import { ThemeStep, TeamStep } from "@/components/auth/FirstRun"
import { SpotError } from "@/components/ui/graphics/spots"
import { celebrate } from "@/lib/celebrate"
import { hueFor } from "@/lib/campHue"

/** How long the ignition plays before step 2 (the spec's ceiling is 1.4s). */
const IGNITION_MS = 1300
/** Under reduced motion: a crossfade, no more. */
const IGNITION_REDUCED_MS = 140

type Step = "account" | "igniting" | "theme" | "team"

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
  const host = useHost()
  const reduced = useReducedMotion()

  const [step, setStep] = useState<Step>("account")
  // The theme a swatch under the pointer previews on the whole page.
  const [preview, setPreview] = useState<string | null>(null)
  const [people, setPeople] = useState<string[]>([])
  const heroRef = useRef<HTMLDivElement>(null)

  // The check got no answer: say so here rather than send the operator of a
  // fresh install to a sign-in page on a server with no accounts.
  const [unreachable, setUnreachable] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    authService.getAdminSetupStatus().then(({ required, pinned, unreachable }) => {
      if (unreachable) {
        setUnreachable(true)
        setIsChecking(false)
      } else if (!required) {
        router.push("/")
      } else {
        setUnreachable(false)
        setPinned(pinned)
        setIsChecking(false)
      }
    })
  }, [router, attempt])

  // The ignition, then step 2; Enter skips straight there.
  const toTheme = useCallback(() => setStep((s) => (s === "igniting" ? "theme" : s)), [])
  useEffect(() => {
    if (step !== "igniting") return
    if (!reduced) {
      const ring = heroRef.current?.querySelector("[data-ignite]") ?? null
      celebrate(ring, { count: 10 })
    }
    const timer = window.setTimeout(toTheme, reduced ? IGNITION_REDUCED_MS : IGNITION_MS)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") toTheme()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("keydown", onKey)
    }
  }, [step, reduced, toTheme])

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
        setStep("igniting")
      } else {
        setError(result.msg)
      }
    } catch {
      setError("The admin account wasn't created. Try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const lit = step !== "account"
  const camp = (
    <div ref={heroRef} className="grid flex-1">
      <FirstRunCamp
        lit={lit}
        instant={reduced}
        preview={preview}
        caption={host ? `${host} · on your server` : "On your server"}
        people={people.map((p) => ({ key: p, hue: hueFor(p), initials: initialsOf(p) }))}
      />
    </div>
  )
  const band = <CampBand height={200} ring={64} grey lit={lit} instant={reduced} />

  if (unreachable && !isChecking) {
    return (
      <AuthShell side={camp} band={band}>
        <AuthHeading title="Couldn't reach this server" art={<SpotError size={96} />}>
          OneCamp didn&apos;t answer while checking whether it needs its first admin. It may still be starting: wait a moment, then check again.
        </AuthHeading>
        <Button
          variant="secondary"
          size="lg"
          className={authControl}
          onClick={() => {
            setIsChecking(true)
            setAttempt((n) => n + 1)
          }}
        >
          Check again
        </Button>
      </AuthShell>
    )
  }

  if (isChecking) {
    return (
      <AuthShell side={camp} band={band}>
        <AuthPlaceholder label="Checking this server" fields={4} />
      </AuthShell>
    )
  }

  const matches = confirmPassword.length > 0 && password === confirmPassword

  return (
    // A previewed theme applies to everything under it (themes.css sets the
    // accent and the glow on the class), so the camp and the primary follow
    // the swatch under the pointer.
    <div className={preview ? `theme-${preview}` : undefined} data-first-run={step}>
      <AuthShell side={camp} band={band}>
        {step === "theme" ? (
          <ThemeStep onPreview={setPreview} onDone={() => { setPreview(null); setStep("team") }} />
        ) : step === "team" ? (
          <TeamStep onPeople={setPeople} onFinish={() => router.push(app_home_path)} />
        ) : (
          <div className={step === "igniting" ? (reduced ? "opacity-0" : "auth-fade-out") : undefined} aria-hidden={step === "igniting" || undefined}>
            <AuthHeading display kicker={<StepPill step={1} label="Your account" />} title="Set up your camp">
              Nobody has an account on this server yet. The one you make now is its admin.
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
                readOnly={isLoading}
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
                readOnly={isLoading}
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
                readOnly={isLoading}
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
                readOnly={isLoading}
                error={errorField === "confirm" ? error : undefined}
                end={matches ? <MatchCheck /> : undefined}
                // The show button on the first field shows both.
                type={showPassword ? "text" : "password"}
              />

              {errorField === null && <FormProblem>{error}</FormProblem>}

              <Button type="submit" size="lg" className={authControlXl} aria-busy={isLoading || undefined}>
                {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isLoading ? "Creating your account…" : "Create admin account"}
              </Button>
            </form>
          </div>
        )}
      </AuthShell>
    </div>
  )
}
