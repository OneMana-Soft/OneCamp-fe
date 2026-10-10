"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useLogout } from "@/hooks/useLogout"
import { AuthHeading, AuthShell } from "@/components/auth/AuthShell"

/**
 * The page shown while signing out, in the frame the other signed-out pages
 * share. useLogout ends the session and then loads the sign-in page; the link
 * is there for the moment that takes, or in case it doesn't happen.
 *
 * It was a large centred "OneCamp | Logging you out…" with a "Go to login
 * page" button that navigated by script, so it couldn't be opened in a new tab
 * or read as a link.
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
      <div role="status" aria-live="polite">
        <AuthHeading title="Signing you out…">You&apos;ll be on the sign-in page in a moment.</AuthHeading>
      </div>
      <p className="text-sm text-muted-foreground">
        Still here?{" "}
        <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </p>
    </AuthShell>
  )
}
