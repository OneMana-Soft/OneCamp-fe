"use client"

import { LoaderCircle, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/themeProvider/theme-toggle"
import { useState, Suspense } from "react"
import authService from "@/services/auth/AuthService"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isReset, setIsReset] = useState(false)
  const [error, setError] = useState("")

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-lg font-semibold">Invalid Reset Link</h2>
        <p className="text-sm text-muted-foreground">
          This password reset link is invalid. Please request a new one.
        </p>
        <Link href="/forgot-password">
          <Button variant="outline" className="mt-4">Request New Link</Button>
        </Link>
      </div>
    )
  }

  const handleReset = async (e: React.FormEvent) => {
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
      <div className="space-y-4 text-center animate-in fade-in duration-300">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">Password Updated!</h1>
        <p className="text-sm text-muted-foreground">
          Your password has been successfully reset. You can now sign in with your new password.
        </p>
        <Link href="/">
          <Button className="mt-4">Go to Login</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Set new password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your new password below.
        </p>
      </div>

      <form onSubmit={handleReset} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">New Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="New password (min 8 chars)"
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
              placeholder="Confirm new password"
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
          Reset Password
        </Button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
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
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
