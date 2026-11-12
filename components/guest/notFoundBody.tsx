"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PublicGone } from "@/components/guest/publicStates"
import { app_home_path, app_login_path } from "@/types/paths"

/**
 * The global 404's body (app/not-found.tsx): drawn as every dead link is
 * (PublicGone), in the public frame on its paper card, "This page doesn't
 * exist or was deleted", with the way to the workspace and Sign in (PG2-01).
 * It comes in as a chunk of its own, only when a 404 is drawn (notFoundView).
 */
export default function NotFoundBody() {
    return (
        <PublicGone
            surface="not-found"
            noun="page"
            detail="The link may be old or mistyped, or what it pointed to was deleted."
            back={{ label: "Go to your workspace", href: app_home_path }}
            more={
                <Button asChild variant="ghost" size="sm">
                    <Link href={app_login_path}>Sign in</Link>
                </Button>
            }
        />
    )
}
