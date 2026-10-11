"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useLogout } from "@/hooks/useLogout"
import { AuthShell, authLink } from "@/components/auth/AuthShell"
import { GradientRing } from "@/components/auth/CampArt"

/**
 * The page shown while signing out (design v3, admin.md F7): the centred
 * shell, the gradient ring at 48 breathing gently (1 to 1.04 over 1.2s; still
 * under reduced motion) and "Signing you out…". useLogout ends the session
 * and then loads the sign-in page; the link is there for the moment that
 * takes, or in case it doesn't happen.
 */
export default function LogoutPage() {
  const { logout } = useLogout()
  // Once: logout is a new function on every render, and a second call would
  // send a second logout request.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void logout()
  }, [logout])

  return (
    <AuthShell>
      <div role="status" aria-live="polite" className="flex flex-col items-center text-center">
        <span className="auth-breathe mb-5 inline-flex" aria-hidden="true" data-breathing-ring="">
          <GradientRing size={48} />
        </span>
        <h1 className="text-body font-medium text-muted-foreground">Signing you out…</h1>
        <p className="mt-6 text-sm text-muted-foreground">
          Still here?{" "}
          <Link href="/" className={`${authLink} font-medium text-foreground underline-offset-4 hover:underline`}>
            Go to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
