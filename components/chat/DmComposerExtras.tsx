"use client"

import { useSelector } from "react-redux"
import { useFetch } from "@/hooks/useFetch"
import { HeldNotificationsBar } from "@/components/messages/heldNotificationsBar"
import PendingActionsTray from "@/components/ai/PendingActionsTray"
import { Sparkles } from "@/lib/icons"
import { ChatGet } from "@/services/endpoints/chat"
import { escapeText } from "@/lib/codec/htmlEscape"
import { CACHE_ONLY } from "@/lib/http/cacheOnly"
import { adapterOf } from "@/lib/conversation/adapters"
import { boxIsBlank, heldRows, listIdOf } from "@/store/conversations"
import type { ConversationRef } from "@/lib/conversation/types"
import type { RootState } from "@/store/store"

/**
 * What sits on a DM's message box, on a computer and a phone: starters to
 * ask an AI peer in a DM with nothing in it yet, actions an agent waits on,
 * and a teammate holding their notifications.
 */
export function DmComposerExtras({ conversation, send, peerName, isBot }: {
    conversation: ConversationRef
    send: (html: string) => void
    peerName?: string
    isBot: boolean
}) {
    const other = listIdOf(conversation)
    // Only once the DM is known to be empty and its box holds nothing, so they
    // never flash over a conversation: its latest page (the one its list asks
    // for) answered with none, and nothing is held. Holding none lets a list
    // go, so a DM with nothing in it is never held empty. The page is watched
    // only while nothing is held: a held list (a link's page too) shows no
    // starters, and a watcher there first would take the page's refreshes from
    // its list (lib/http/cacheOnly).
    const unheld = useSelector((state: RootState) => isBot && heldRows(state, conversation) === undefined)
    const adapter = adapterOf(conversation)
    const latest = useFetch<unknown>(unheld ? adapter.latestKey(conversation) : "", undefined, CACHE_ONLY)
    const answeredEmpty = adapter.answered(latest.data) && adapter.rowsOf(latest.data, "latest").length === 0
    const blank = useSelector((state: RootState) => unheld && answeredEmpty && boxIsBlank(state, conversation))
    const starters = useFetch<{ data: string[] }>(blank ? `${ChatGet.GetDMAISuggestions}?peer=${other}` : "")
    const shown = (blank && starters.data?.data) || []
    return (
        <>
            {shown.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-agent" aria-hidden="true" /> Try asking
                    </span>
                    {shown.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => send(`<p>${escapeText(s)}</p>`)}
                            className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-foreground transition-colors hover:bg-highlight active:bg-primary/5"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
            <PendingActionsTray surfaceId={conversation.id} />
            <HeldNotificationsBar userUUID={other} name={peerName} isBot={isBot} />
        </>
    )
}
