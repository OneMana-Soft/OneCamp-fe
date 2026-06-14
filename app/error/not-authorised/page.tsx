"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ShieldAlert, Home } from "@/lib/icons"
import { app_home_path, app_login_path } from "@/types/paths"

/**
 * /error/not-authorised — 401 / 403 surface.
 *
 * Reached when the API returns 401/403 and the auth interceptor redirects
 * here. The page now reads as a recovery surface rather than a stark
 * "401 / Not Authorised" message: explains what happened, offers two
 * paths forward (sign in again, go home), and stays on-brand.
 */

export default function NotAuthorised() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-foreground">
            <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                    <ShieldAlert className="h-7 w-7" />
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-medium tracking-wider uppercase text-muted-foreground">
                        Error 401
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        You&apos;re not signed in
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Your session may have expired or you don&apos;t have access
                        to this resource. Sign in again to continue.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button asChild className="gap-2">
                        <Link href={app_login_path}>
                            <ArrowLeft className="h-4 w-4" />
                            Sign in
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                        <Link href={app_home_path}>
                            <Home className="h-4 w-4" />
                            Go home
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
