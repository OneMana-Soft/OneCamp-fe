import { NotFoundView } from "@/components/guest/notFoundView"

/**
 * Global 404 page, drawn as every dead link is (PublicGone, PG2-01). A
 * signed-in person's /app link gets app/app/not-found.tsx, inside the shell.
 */
export default function NotFoundPage() {
    return <NotFoundView />
}
