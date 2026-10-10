"use client"

// Tells a workspace admin that this install cannot send email.
//
// WHY IT EXISTS AT ALL. The installer clears the mail key on purpose, so every new
// workspace starts unable to send anything, and it is a state nobody can see from
// the inside: /auth/forgot-password answers "check your email" whether or not it
// could send (it always does, so nobody can use it to discover which addresses have
// accounts), and an invitation that never arrives looks like a slow mail server.
// The first person to find out is usually an admin who has locked themselves out
// and now has no way back in over HTTP.
//
// The settings page already shows a "Not configured" badge. That only helps someone
// who went to settings; this is for the admin who never did.
//
// ADMINS ONLY, because they are the only people who can fix it. A member seeing it
// learns nothing they can act on and reads it as the product being broken.
//
// DISMISSIBLE, and remembered. It is a nudge, not an alarm — an admin who has
// decided to run without email should not be nagged on every page for the life of
// the workspace.

import { useState } from "react"
import Link from "next/link"
import { NoticeBar } from "@/components/banner/NoticeBar"
import { useClientConfig } from "@/hooks/useClientConfig"

const DISMISSED_KEY = "onecamp:email-off-banner-dismissed"

export function EmailOffBanner({ isAdmin }: { isAdmin?: boolean }) {
    const { email_enabled } = useClientConfig()
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === "undefined") return false
        try {
            return window.localStorage.getItem(DISMISSED_KEY) === "1"
        } catch {
            // Private browsing and some embedded webviews throw here. A banner is
            // not worth breaking the app over.
            return false
        }
    })

    if (!isAdmin || email_enabled || dismissed) return null

    function dismiss() {
        setDismissed(true)
        try {
            window.localStorage.setItem(DISMISSED_KEY, "1")
        } catch {
            // Same as above: dismissing for this session only is an acceptable
            // outcome, crashing is not.
        }
    }

    return (
        <NoticeBar tone="warning" onDismiss={dismiss}>
            {/* Says what an admin sees happen, then the one fix. */}
            This workspace can&apos;t send email yet, so invitations and password resets won&apos;t arrive.{" "}
            <Link href="/app/admin?tab=email-settings" className="font-medium underline underline-offset-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                Add a sending key in Admin settings
            </Link>
            .
        </NoticeBar>
    )
}
