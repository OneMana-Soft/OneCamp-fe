"use client"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotError } from "@/components/ui/graphics/spots"
import { loadFailure, useSaysLoadFailure } from "@/lib/http/loadFailure"

/**
 * A thread that couldn't be opened (TN-BUG-4). A failed read leaves no data,
 * and the thread views drew "loading" for no data before they looked at the
 * error, so a thread that failed to load spun for ever, and the error state
 * under it (Retry reloaded the whole window) was never reached.
 *
 * Gone (deleted, or no longer the reader's) says so, with Close where there is
 * a panel to close; anything else says nothing is lost and offers Try again,
 * which reads the thread again. threadLoadFailed.test.tsx holds it.
 */
export function ThreadLoadFailed({ error, onRetry, retrying, onClose }: {
    error: unknown
    onRetry: () => void
    retrying?: boolean
    /** Closes the panel. The phone's thread page has its own way back. */
    onClose?: () => void
}) {
    // Gone or no longer theirs (no-access) read the same from the thread's side.
    const gone = loadFailure(error) !== "failed"
    // Said here, so the read's toast stays quiet (ErrorState says it for the rest).
    useSaysLoadFailure(gone)
    if (gone) {
        return (
            <EmptyState
                illustration={<SpotError />}
                title="This thread isn't available"
                description="Its message was deleted, or you're no longer in this conversation."
                action={onClose ? <Button variant="outline" size="sm" onClick={onClose}>Close</Button> : undefined}
                className="m-auto"
            />
        )
    }
    return <ErrorState subject="this thread" onRetry={onRetry} retrying={retrying} className="m-auto" />
}
