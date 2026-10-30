"use client"

// CommandSurface renders the ephemeral/interactive slash-command cards for a
// single conversation surface (channel or DM) and wires the command runner
// (catalog provider + event handling + interaction). Mount it just above the
// composer in each conversation view. It renders nothing when there are no
// active cards, so it has zero visual footprint until a command produces one.

import React, { useMemo } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { useCommandRunner, type CommandSurfaceContext } from "./useCommandRunner"
import BlockKitCard from "./BlockKitCard"
import { Button } from "@/components/ui/button"
import { X, Zap } from "@/lib/icons"
import type { BlockElement } from "@/types/command"
import { mentionPlaceAttrs } from "@/lib/conversation/mentionPlace"

const EMPTY: never[] = []

const CommandSurface: React.FC<CommandSurfaceContext> = (ctx) => {
    const { handleInteract, dismiss } = useCommandRunner(ctx)

    const cards = useSelector(
        (s: RootState) => s.command.cards[ctx.surfaceKey] || EMPTY,
    )

    // Track which action is in-flight per card for button busy states.
    const [busy, setBusy] = React.useState<Record<string, string | null>>({})

    const onAction = useMemo(
        () => (triggerId: string, command: string) => async (el: BlockElement) => {
            setBusy((b) => ({ ...b, [triggerId]: el.action_id }))
            try {
                await handleInteract(triggerId, command, el)
            } finally {
                setBusy((b) => ({ ...b, [triggerId]: null }))
            }
        },
        [handleInteract],
    )

    // Marks the conversation beside its composer, so a command typed there
    // runs here and nowhere else (commandSurfaceOf, FE-BUG-11).
    // And for its "@" list: the conversation it writes in (lib/conversation/mentionPlace).
    const place = ctx.channelId
        ? mentionPlaceAttrs("channel", ctx.channelId)
        : ctx.dmGroupId ? mentionPlaceAttrs(ctx.dmGroupId.includes(" ") ? "dm" : "group", ctx.dmGroupId) : {}
    const marker = <span hidden data-command-surface={ctx.surfaceKey} {...place} />

    if (cards.length === 0) return marker

    return (
        <>
        {marker}
        {/* Marked for a phone's "Jump to latest", which hangs above the answers
            when they show over the box (MessageListVirtua). */}
        <div data-command-answers="" className="flex flex-col gap-2 px-1 pb-2">
            {cards.map((card) => {
                const resp = card.response
                // The originating command name is stored on the card (poll, giphy,
                // …) so interaction round-trips can be routed back to the right
                // handler.
                const command = card.command || ""
                return (
                    <div
                        key={card.trigger_id}
                        className="relative rounded-xl border border-border/70 bg-muted/40 p-2.5 animate-msg-fade-in"
                    >
                        <div className="flex items-start gap-2">
                            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Zap className="h-3 w-3" />
                            </span>
                            <div className="min-w-0 flex-1">
                                {resp.blocks && resp.blocks.length > 0 ? (
                                    <BlockKitCard
                                        blocks={resp.blocks}
                                        busyActionId={busy[card.trigger_id]}
                                        onAction={onAction(card.trigger_id, command)}
                                    />
                                ) : resp.text ? (
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                        {resp.text}
                                    </div>
                                ) : null}
                                {resp.ephemeral && (
                                    <div className="mt-1 text-2xs text-muted-foreground/70">
                                        Only visible to you
                                    </div>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => dismiss(card.trigger_id)}
                                aria-label="Dismiss"
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
        </>
    )
}

export default CommandSurface
