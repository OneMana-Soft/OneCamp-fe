import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AuthHeading, AuthShell } from "@/components/auth/AuthShell"
import { app_home_path, app_login_path } from "@/types/paths"

/**
 * Global 404 page, in the frame of the signed-out pages: the product's name
 * at the top, and one column that says what happened and offers the way on.
 *
 * It was a centred icon tile over an "ERROR 404" eyebrow over a centred
 * paragraph over two equal buttons: the shape of every template's 404, and
 * the status code is the server's business, not the reader's.
 */
export default function NotFoundPage() {
    return (
        <AuthShell>
            <AuthHeading title="This page doesn't exist">
                The link may be old or mistyped, or what it pointed to was deleted.
            </AuthHeading>
            <div className="space-y-4">
                {/* authControl's classes written out: this is a server component, and a
                    plain value imported from a client module arrives here as a reference. */}
                <Button asChild className="h-11 w-full md:h-10">
                    <Link href={app_home_path}>Go to your workspace</Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                    Not signed in?{" "}
                    <Link href={app_login_path} className="font-medium text-foreground underline-offset-4 hover:underline">
                        Sign in
                    </Link>
                </p>
            </div>
        </AuthShell>
    )
}
