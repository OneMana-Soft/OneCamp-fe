"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AuthHeading, AuthShell, authControl } from "@/components/auth/AuthShell"
import { SpotShieldLock } from "@/components/auth/authSpots"
import { app_home_path, app_login_path } from "@/types/paths"

/**
 * /error/not-authorised: where the API's 401 or 403 sends the browser (design
 * v3, admin.md F10). The centred shell, the shield-with-a-lock spot, one
 * sentence, "Go to Home" as the way on.
 *
 * Nothing is broken, so it is not drawn as an error (no red, no "Error 401").
 * The spec's "Ask an admin" is left out: this page can't know who the admins
 * are (it may be reached signed out), so it offers signing in again, which is
 * what a 401 needs, as the second action.
 */
export default function NotAuthorised() {
    return (
        <AuthShell>
            <AuthHeading title="You don't have access to this" art={<SpotShieldLock />} center>
                Your session may have ended, or this page belongs to an account you aren&apos;t signed in with.
            </AuthHeading>
            <div className="space-y-2">
                <Button size="lg" asChild className={authControl}>
                    <Link href={app_home_path}>Go to Home</Link>
                </Button>
                <Button size="lg" variant="secondary" asChild className={authControl}>
                    <Link href={app_login_path}>Sign in again</Link>
                </Button>
            </div>
        </AuthShell>
    )
}
