"use client"

import { LoaderCircle, User, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/themeProvider/theme-toggle"
import { useEffect, useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { app_home_path } from "@/types/paths"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

function SignupForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const router = useRouter()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [invitationEmail, setInvitationEmail] = useState("")
  const [error, setError] = useState("")
  const [tokenInvalid, setTokenInvalid] = useState(false)

  useEffect(() => {
    if (!token) {
      setTokenInvalid(true)
      setIsValidating(false)
      return
    }

    authService.validateInvitationToken(token).then((result) => {
      if (result.valid) {
        setInvitationEmail(result.email)
      } else {
        setTokenInvalid(true)
        setError(result.msg)
      }
      setIsValidating(false)
    })
  }, [token])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
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

    if (username.trim().length === 0) {
      setError("Username is required")
      return
    }

    if (username.length > 25) {
      setError("Username must be 25 characters or less")
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.signup(token, username, password)
      if (result.ok) {
        router.push(app_home_path)
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
        <p className="text-sm text-muted-foreground">Validating invitation...</p>
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
        <Link href="/">
          <Button variant="outline" className="mt-4">Back to Login</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Setting up account for <span className="font-medium text-foreground">{invitationEmail}</span>
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="username">Username</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="username"
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={25}
              className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full pl-10 pr-10 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="confirm-password">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {password && confirmPassword && password === confirmPassword && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Passwords match
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create Account
        </Button>
      </form>

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
