"use client"

import { memo } from "react"
import { useDispatch } from "react-redux"
import { ShieldCheck } from "@/lib/icons"
import { firstNameOf } from "@/lib/personName"
import { openUI } from "@/store/slice/uiSlice"

/** Who an agent acted for on this message, read from the run, never the channel. */
export interface AgentAsker {
    name: string
    userUUID?: string
}

/**
 * The line under every agent post (design v3 chat, C11): on whose behalf it
 * acted, that it could do only what they can, and that the act is on the
 * record. It is the product's governance story told where the act happens.
 *
 * The asker comes from the run's own trail: the message the agent replied to,
 * or the thread it answered in. When the conversation doesn't say who asked
 * (a scheduled post, an answer that lost its thread), the line says so in
 * general terms rather than guess a name: naming the wrong person would be the
 * one thing worse than naming nobody.
 */
export const AgentProvenance = memo(function AgentProvenance({ asker }: { asker?: AgentAsker | null }) {
    const dispatch = useDispatch()
    // "Sam" from "Sam Rivera": the line names the person once in full.
    const first = asker ? firstNameOf(asker.name) || asker.name : ""
    return (
        <p data-provenance="" className="mt-1.5 flex min-w-0 items-center gap-1.5 text-meta text-ink-3">
            <ShieldCheck className="size-3 shrink-0 text-agent" aria-hidden="true" />
            <span className="min-w-0 truncate">
                {asker ? (
                    <>
                        Acting for{" "}
                        {asker.userUUID ? (
                            <button
                                type="button"
                                onClick={() => dispatch(openUI({ key: "otherUserProfile", data: { userUUID: asker.userUUID! } }))}
                                className="rounded-[3px] text-ink-2 underline decoration-line-3 underline-offset-2 transition-colors hover:text-ink hover:decoration-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                                {asker.name}
                            </button>
                        ) : (
                            <span className="text-ink-2">{asker.name}</span>
                        )}
                        {" · "}can do only what {first} can · on the record
                    </>
                ) : (
                    "Acts only for whoever asks · can do only what they can · on the record"
                )}
            </span>
        </p>
    )
})
