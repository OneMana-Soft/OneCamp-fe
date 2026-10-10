"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AuthHeading, AuthShell, authControl } from "@/components/auth/AuthShell"
import { SpotError } from "@/components/ui/graphics/spots"
import { app_home_path, app_login_path } from "@/types/paths"

/**
 * /error/not-authorised: where the API's 401 or 403 sends the browser.
 *
 * Nothing is broken, so it is not drawn as an error (no red shield, no
 * "Error 401"): the session ended or the page is someone else's, and the way
 * on is to sign in again.
 */
export default function NotAuthorised() {
    return (
        <AuthShell>
            <AuthHeading title="Sign in again to carry on" art={<SpotError />}>
                Your session ended, or this page belongs to an account you aren&apos;t signed in with.
            </AuthHeading>
            <div className="space-y-4">
                <Button asChild className={authControl}>
                    <Link href={app_login_path}>Sign in</Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                    <Link href={app_home_path} className="font-medium text-foreground underline-offset-4 hover:underline">
                        Go to your workspace
                    </Link>{" "}
                    if you&apos;re still signed in.
                </p>
            </div>
        </AuthShell>
    )
}
