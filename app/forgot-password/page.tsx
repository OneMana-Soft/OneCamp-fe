"use client"

import { LoaderCircle, Mail, CheckCircle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/themeProvider/theme-toggle"
import { useState } from "react"
import authService from "@/services/auth/AuthService"
import Link from "next/link"

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
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen text-foreground flex flex-col justify-center items-center px-4 py-12 relative">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm mb-8 flex justify-center">
        <img src="/logo.svg" alt="OneCamp Logo" width={48} height={48} className="h-12 w-12 mx-auto" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        {isSent ? (
          <div className="space-y-4 text-center animate-in fade-in duration-300">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If an account with <span className="font-medium text-foreground">{email}</span> exists, we&apos;ve sent a password reset link.
            </p>
            <p className="text-xs text-muted-foreground">
              The link expires in 1 hour. Don&apos;t forget to check your spam folder.
            </p>
            <Link href="/">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Forgot password?</h1>
              <p className="text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send Reset Link
              </Button>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              <Link href="/" className="text-foreground hover:underline flex items-center justify-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Back to Login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
