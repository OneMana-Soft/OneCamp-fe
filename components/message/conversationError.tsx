"use client"

import { useState } from "react"
import { ErrorState } from "@/components/ui/error-state"

/**
 * A conversation whose messages failed to load (design v3 chat, its states):
 * it says so and offers Try again. It drew the empty conversation instead,
 * "This is the start of #engineering" with Say hello, over a history it had
 * only failed to fetch, so a reader could believe their messages were gone.
 * Shown only when nothing is on screen: a refresh that fails under messages
 * already shown leaves them where they are.
 */
export function ConversationLoadError({ subject, retry }: { subject: string; retry: () => Promise<unknown> | unknown }) {
    const [retrying, setRetrying] = useState(false)
    const onRetry = () => {
        setRetrying(true)
        Promise.resolve(retry())
            .catch(() => undefined)
            .finally(() => setRetrying(false))
    }
    return (
        <div data-conversation-error="" className="flex h-full w-full items-center justify-center px-5">
            <ErrorState subject={subject} onRetry={onRetry} retrying={retrying} />
        </div>
    )
}
