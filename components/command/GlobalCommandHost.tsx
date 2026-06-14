"use client"

// GlobalCommandHost surfaces async, conversation-independent slash-command
// results — chiefly fired /remind reminders and external app callbacks that
// arrive over MQTT after the originating request returned. Per-conversation
// cards are handled by CommandSurface; this host catches the "global" ones.
//
// Mount once near the app root (inside MqttProvider so the socket is live).
// It renders a small stack of dismissible cards pinned bottom-right plus a
// toast for immediate awareness.

import React, { useEffect, useState, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import BlockKitCard from "./BlockKitCard"
import MarkdownMessage from "@/components/ai/MarkdownMessage"
import { Button } from "@/components/ui/button"
import { Bell, X } from "@/lib/icons"
import type { CommandResponse } from "@/types/command"
import { MemberInviteDialog } from "@/components/invite/MemberInviteDialog"

interface HostedCard {
    id: string
    response: CommandResponse
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
                toast({ title: "Reminder", description: resp.text.replace(/^⏰\s*/, "") })
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
            <MemberInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
            {cards.length > 0 && (
                <div
                    className="fixed right-2 z-[var(--z-toast,400)] flex w-[min(360px,calc(100vw-1rem))] flex-col gap-2"
                    style={{
                        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
                    }}
                >
                    {cards.map((card) => (
                        <div
                            key={card.id}
                            className="relative rounded-xl border border-border bg-card p-3 shadow-lg animate-msg-fade-in"
                        >
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <Bell className="h-3 w-3" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    {card.response.blocks && card.response.blocks.length > 0 ? (
                                        <BlockKitCard blocks={card.response.blocks} />
                                    ) : card.response.text ? (
                                        <div className="text-[13px] leading-relaxed text-foreground">
                                            <MarkdownMessage content={card.response.text} />
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
                </div>
            )}
        </>
    )
}

export default GlobalCommandHost
