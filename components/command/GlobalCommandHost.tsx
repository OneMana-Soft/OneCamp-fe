"use client"

// GlobalCommandHost surfaces async, conversation-independent slash-command
// results — chiefly fired /remind reminders and external app callbacks that
// arrive over MQTT after the originating request returned. Per-conversation
// cards are handled by CommandSurface; this host catches the "global" ones.
//
// Mount once near the app root (inside MqttProvider so the socket is live).
// It renders a small stack of dismissible cards pinned bottom-right plus a
// toast for immediate awareness.

import { CornerCard } from "@/components/ui/CornerStack"
import React, { useEffect, useState, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Bell, X, Zap } from "@/lib/icons"
import type { Block, CommandResponse } from "@/types/command"
import { LazyMemberInviteDialog } from "@/components/invite/LazyMemberInviteDialog"
import { lazyPart } from "@/lib/lazy/lazyPart"

// The host's rare pieces come when they are wanted: the invite dialog when it
// is asked for (LazyMemberInviteDialog), a late answer's card or text when one
// arrives. Until 17 Oct 2026 they rode in with every signed-in first screen,
// and the text renderer brings charts, query plans and the tables service with
// it (app/firstLoad.test.ts, SHELL_LAZY). Each is a lazy part
// (lib/lazy/lazyPart): an answer's text reads as plain text until its renderer
// is in, or if it can't come, and a card that can't come says so in its place.
const NoCardYet = () => null
const CardUnavailable = ({ retry }: { retry: () => void }) => (
    <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-ink-2">{"Couldn't show this answer. Check your connection, then try again."}</p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
        </Button>
    </div>
)
const answerCard = lazyPart<{ blocks: Block[] }>(() => import("./BlockKitCard").then((m) => m.default), {
    placeholder: NoCardYet,
    failed: CardUnavailable,
})

interface HostedCard {
    id: string
    response: CommandResponse
}

/**
 * A late answer's toast title, from what the server says it is. Every one was
 * titled "Reminder", an app's answer too (MC-BUG-8); one that doesn't say has
 * no title.
 */
function lateAnswerTitle(kind: CommandResponse["kind"]): string | undefined {
    if (kind === "reminder") return "Reminder"
    if (kind === "app") return "Reply from an app"
    return undefined
}

const GlobalCommandHost: React.FC = () => {
    const { toast } = useToast()
    const [cards, setCards] = useState<HostedCard[]>([])
    const [inviteOpen, setInviteOpen] = useState(false)

    const dismiss = useCallback((id: string) => {
        setCards((prev) => prev.filter((c) => c.id !== id))
    }, [])

    // Open the member invite dialog when the command palette fires the event.
    useEffect(() => {
        const onInvite = () => setInviteOpen(true)
        window.addEventListener("open-invite-people", onInvite)
        return () => window.removeEventListener("open-invite-people", onInvite)
    }, [])

    useEffect(() => {
        const handler = (e: Event) => {
            const resp = (e as CustomEvent).detail as CommandResponse
            if (!resp) return

            // Toast for immediate awareness (especially reminders).
            if (resp.text) {
                toast({ title: lateAnswerTitle(resp.kind), description: resp.text.replace(/^⏰\s*/, "") })
            }

            // Also keep a dismissible card so the user can act on blocks.
            const id = resp.trigger_id || `ev_${Date.now()}_${Math.random().toString(36).slice(2)}`
            setCards((prev) => [...prev.slice(-4), { id, response: resp }])
        }
        window.addEventListener("command-ephemeral", handler)
        return () => window.removeEventListener("command-ephemeral", handler)
    }, [toast])

    return (
        <>
            <LazyMemberInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
            {cards.length > 0 && (
                // The right-hand corner stack places them (components/ui/CornerStack),
                // above the demo prompt and under the toasts.
                <CornerCard side="right" order={1} className="flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
                    {cards.map((card) => (
                        <div
                            key={card.id}
                            className="relative rounded-xl bg-pop p-3.5 text-ink shadow-e3"
                        >
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    {/* A bell for a reminder; anything else is a command's answer. */}
                                    {card.response.kind === "reminder" ? <Bell className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    {card.response.blocks && card.response.blocks.length > 0 ? (
                                        <answerCard.Part blocks={card.response.blocks} />
                                    ) : card.response.text ? (
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                            {card.response.text}
                                        </div>
                                    ) : null}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => dismiss(card.id)}
                                    aria-label="Dismiss"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </CornerCard>
            )}
        </>
    )
}

export default GlobalCommandHost
