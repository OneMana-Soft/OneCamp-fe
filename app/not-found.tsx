import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Home, HelpCircle } from "@/lib/icons"
import { app_home_path, app_login_path } from "@/types/paths"

/**
 * Global 404 page.
 *
 * Friendlier than the previous "404 / This page could not be found" wall.
 * Surfaces both a primary recovery path (back to the workspace home for
 * authenticated users, login otherwise) and a back-history shortcut.
 *
 * The Back button is a `<Link>` to `app_login_path` because Next's App
 * Router doesn't expose router.back() in server components — clicking
 * Home is the correct primary action regardless. We render the auth
 * fallback link only at the bottom for users who landed here logged out.
 */
export default function NotFoundPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-foreground">
            <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
                    <HelpCircle className="h-7 w-7" />
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-medium tracking-wider uppercase text-muted-foreground">
                        Error 404
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Page not found
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        The page you&apos;re looking for doesn&apos;t exist, was moved,
                        or you may not have access to it.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button asChild className="gap-2">
                        <Link href={app_home_path}>
                            <Home className="h-4 w-4" />
                            Go home
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                        <Link href={app_login_path}>
                            <ArrowLeft className="h-4 w-4" />
                            Sign in
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
