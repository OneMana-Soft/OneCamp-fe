import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PublicGone } from "@/components/guest/publicStates"
import { app_home_path, app_login_path } from "@/types/paths"

/**
 * Global 404 page: drawn as every dead link is (PublicGone), in the public
 * frame on its paper card, "This page doesn't exist or was deleted", with
 * the way to the workspace and Sign in. The 404s, the guest links, the forms
 * and the booking pages each drew their own (PG2-01).
 *
 * A signed-in person never sees this one for an /app link:
 * app/app/not-found.tsx draws theirs inside the shell, the same way.
 */
export default function NotFoundPage() {
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
