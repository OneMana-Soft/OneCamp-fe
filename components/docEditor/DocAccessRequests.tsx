"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"

import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { cn } from "@/lib/utils/helpers/cn"
import { displayNameOf } from "@/lib/personName"
import { accessRequestsKey, answerRequest } from "@/lib/docs/accessRequests"
import type { DocAccessRequest, DocAccessRequests as Requests } from "@/types/docAccess"

const WANTS: Record<DocAccessRequest["level_wanted"], string> = { view: "view", comment: "comment on", edit: "edit" }

/**
 * The open requests for access to a doc, for whoever can answer them (its
 * owner and the people with full access): who asked, for what, and Approve or
 * Decline, under the title. A request reached its owner as an inbox notice
 * with nowhere to answer it (docs incident, 14 Oct 2026; QA DSA-03). The
 * asker is told the answer by the server.
 */
export function DocAccessRequests({ docId, className }: { docId: string; className?: string }) {
    const key = docId ? accessRequestsKey(docId) : ""
    const list = useFetch<{ data?: Requests }>(key, undefined, undefined, OWN_ERRORS)
    const [busy, setBusy] = React.useState<string | null>(null)
    const [answered, setAnswered] = React.useState<Record<string, string>>({})
    const open = (list.data?.data?.incoming ?? []).filter((r) => r.doc_uuid === docId && r.status === "pending" && !answered[r.id])
    if (open.length === 0) return null

    const answer = async (r: DocAccessRequest, approve: boolean) => {
        setBusy(r.id)
        try {
            await answerRequest(r, { approve })
            setAnswered((a) => ({ ...a, [r.id]: approve ? "approved" : "declined" }))
        } catch {
            // The request stays listed: the service's toast says what went wrong.
        } finally {
            setBusy(null)
        }
    }

    return (
        <ul data-doc-access-requests="" className={cn("flex flex-col gap-1", className)} aria-label="Requests for access">
            {open.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-sm text-ink-2">
                    <span>
                        <span className="font-[510] text-ink">{displayNameOf(r.requester) || "Someone"}</span> asked to {WANTS[r.level_wanted] ?? "open"} this doc
                        {r.note ? <span className="text-ink-3">: “{r.note}”</span> : null}
                    </span>
                    <span className="flex items-center gap-1">
                        <Button size="sm" className="h-7 px-2" disabled={busy === r.id} onClick={() => void answer(r, true)}>
                            Approve
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={busy === r.id} onClick={() => void answer(r, false)}>
                            Decline
                        </Button>
                    </span>
                </li>
            ))}
        </ul>
    )
}
