"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"

import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { cn } from "@/lib/utils/helpers/cn"
import { levelSentence, type DocLevel } from "@/lib/docs/abilities"
import { accessRequestsKey, docAccessKey, requestAccess } from "@/lib/docs/accessRequests"
import type { DocAccess, DocAccessRequests } from "@/types/docAccess"

/**
 * What someone who can't change a doc may do with it, said where they are
 * (docs incident, 14 Oct 2026, D3): under the title, and in the comments
 * panel instead of a box that silently isn't there. "You can view this doc",
 * or "comment on", with Request access when a request would reach someone
 * who can answer it (the server's can_request: never the demo's own people,
 * never from its shared visitor), and "Request sent" once one is open.
 *
 * Admins see the same, and why: being an admin opens no doc.
 */
export function DocAccessNote({
    docId,
    level,
    want,
    suffix = "",
    admin = false,
    action,
    className,
}: {
    docId: string
    level: DocLevel
    /** The level a request asks for. */
    want: "comment" | "edit"
    /** Words after the level's sentence (", so you can't comment on it"). */
    suffix?: string
    admin?: boolean
    /** More to offer beside Request access (Ask AI, for a reader). */
    action?: React.ReactNode
    className?: string
}) {
    const access = useFetch<{ data?: DocAccess }>(docId ? docAccessKey(docId) : "", undefined, undefined, OWN_ERRORS)
    const locked = !!access.data?.data?.locked
    const canRequest = access.data?.data?.can_request === true
    const requests = useFetch<{ data?: DocAccessRequests }>(canRequest ? accessRequestsKey(docId) : "", undefined, undefined, OWN_ERRORS)
    const open = (requests.data?.data?.outgoing ?? []).some((r) => r.doc_uuid === docId && r.status === "pending")
    const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle")

    const ask = async () => {
        setState("sending")
        try {
            await requestAccess(docId, want)
            setState("sent")
        } catch {
            setState("failed")
        }
    }

    const sentence = levelSentence(level, locked)
    if (!sentence) return null
    const sent = state === "sent" || open
    return (
        <div
            data-doc-access-note=""
            role="note"
            className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-sm text-ink-2", className)}
        >
            <span>
                {sentence}
                {suffix}.
                {admin && <span className="text-ink-3"> Being an admin doesn&apos;t open docs or change what you can do in them.</span>}
            </span>
            {sent ? (
                <span className="text-ink-3">Request sent</span>
            ) : (
                canRequest &&
                !locked && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" disabled={state === "sending"} onClick={() => void ask()}>
                        {want === "edit" ? "Request edit access" : "Request access to comment"}
                    </Button>
                )
            )}
            {state === "failed" && <span className="text-ink-3">Couldn&apos;t send the request. Try again.</span>}
            {action}
        </div>
    )
}
