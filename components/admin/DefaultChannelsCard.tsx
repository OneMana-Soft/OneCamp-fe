"use client"

// Where new members start.
//
// Everyone who joins the workspace, by invitation, Google, GitHub, single
// sign-on or the directory, is put in these channels and opens with the message
// box ready on #general when it is one of them, otherwise on the first in the
// saved order (the server's landingOf). Until an admin chooses, it is #general,
// the channel every workspace starts with. Only public channels that aren't
// archived can be chosen: a private one would hand every newcomer a channel
// its members never opened to them.
//
// Design v3 (admin A7, mock M1): instant. A tick saves the choice at once and
// says "Saved" beside the channel; a refusal puts the box back and says why.
// The list is part of the card, 40px rows, and never scrolls inside itself:
// the first six show, then "Show N more". The channel a member opens on
// carries a neutral "Opens here" tag. While #general isn't chosen, any other
// chosen channel can be made the landing one from its ⋯ menu (it is saved
// first in the order, which is what the server lands on). While #general is
// chosen it always wins (landingOf), so the menu isn't offered: the server
// has no field to choose a landing channel over #general.

import { useEffect, useMemo, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Hash, MoreHorizontal } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { getDefaultChannels, setDefaultChannels, type ChannelChoice, type DefaultChannels } from "@/services/settingsService"

/** How many channels show before "Show N more". */
export const CHANNELS_SHOWN = 6

/** The same choice, whatever order it was made in. Pure. */
export function sameChoice(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    const set = new Set(a)
    return b.every((id) => set.has(id))
}

const isGeneral = (c: ChannelChoice | undefined) => c?.ch_name === "general"

/**
 * Where a new member opens, as the server decides it (landingOf): #general
 * when it is among the chosen, otherwise the first in the saved order. Pure.
 */
export function landingOf(chosen: ChannelChoice[]): string | null {
    return (chosen.find(isGeneral) ?? chosen[0])?.ch_uuid ?? null
}

/**
 * The order to save: the landing channel first (when it is still chosen),
 * then the rest in the order the list shows. Pure.
 */
export function saveOrder(picked: string[], available: ChannelChoice[], landing: string | null): string[] {
    const rest = available.map((c) => c.ch_uuid).filter((id) => picked.includes(id) && id !== landing)
    return landing && picked.includes(landing) ? [landing, ...rest] : rest
}

export default function DefaultChannelsCard() {
    const [view, setView] = useState<DefaultChannels | null>(null)
    const [failed, setFailed] = useState(false)
    const [loading, setLoading] = useState(true)
    // The choice as shown: ahead of the server while a save is in flight.
    const [order, setOrder] = useState<string[]>([])
    const [expanded, setExpanded] = useState(false)
    // The row whose change is being saved, for its tick or its failure.
    const [touched, setTouched] = useState<string | null>(null)
    const { status, run } = useSaveStatus()

    const show = (next: DefaultChannels | null) => {
        setView(next)
        setOrder(next?.channels.map((c) => c.ch_uuid) ?? [])
    }

    const load = () => {
        setLoading(true)
        setFailed(false)
        getDefaultChannels()
            .then(show)
            .catch(() => setFailed(true))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const available = useMemo(() => view?.available ?? [], [view])
    const byId = useMemo(() => new Map(available.map((c) => [c.ch_uuid, c])), [available])
    const chosen = order.map((id) => byId.get(id)).filter((c): c is ChannelChoice => !!c)
    const landing = landingOf(chosen)
    const generalChosen = chosen.some(isGeneral)

    /** Saves an order at once; a refusal puts the last saved one back. */
    const commit = async (next: string[], row: string, what: string): Promise<boolean> => {
        const before = order
        setOrder(next)
        setTouched(row)
        const ok = await run(async () => {
            const answer = await setDefaultChannels(next)
            if (answer) show(answer)
        }, { what, undo: () => commit(before, row, what) })
        if (!ok) setOrder(before)
        return ok
    }

    const toggle = (id: string, on: boolean) => {
        const picked = on ? [...order, id] : order.filter((x) => x !== id)
        // The landing channel stays first while it is still chosen.
        void commit(saveOrder(picked, available, landing), id, `#${byId.get(id)?.ch_name} is ${on ? "on" : "off"}`)
    }

    const openHere = (id: string) => void commit(saveOrder(order, available, id), id, `New members open in #${byId.get(id)?.ch_name}`)

    let body: React.ReactNode
    if (loading) {
        // The list it is about to show, not a spinner.
        body = (
            <SettingsCard aria-label="Loading the channels new members join">
                <SettingsRowsSkeleton rows={3} control="button" />
            </SettingsCard>
        )
    } else if (failed) {
        body = (
            <SettingsCard>
                <SettingsCardError what="the channels new members join" onRetry={load} />
            </SettingsCard>
        )
    } else if (available.length === 0) {
        body = (
            <EmptyState
                icon={Hash}
                hue={ADMIN_GROUP_HUE.workspace}
                title="No public channels yet"
                description="Create one, and you can choose it here."
            />
        )
    } else {
        const hidden = Math.max(0, available.length - CHANNELS_SHOWN)
        const rows = expanded ? available : available.slice(0, CHANNELS_SHOWN)
        const failedRow = status.state === "error" ? touched : null
        body = (
            <SettingsCard>
                <ul data-channel-list="" aria-label="Channels new members join" className="set-rows">
                    {rows.map((ch) => {
                        const id = `default-channel-${ch.ch_uuid}`
                        const picked = order.includes(ch.ch_uuid)
                        const opens = picked && ch.ch_uuid === landing
                        const canLand = picked && !opens && !generalChosen
                        return (
                            <li key={ch.ch_uuid} data-channel-row="" className="cfg-channel-row set-row">
                                <Checkbox
                                    id={id}
                                    checked={picked}
                                    onCheckedChange={(v) => toggle(ch.ch_uuid, v === true)}
                                    disabled={status.state === "saving"}
                                />
                                <label htmlFor={id} className="flex min-w-0 cursor-pointer items-center gap-1.5 text-sm text-foreground">
                                    <span aria-hidden="true" className="text-ink-3">#</span>
                                    <span className="truncate">{ch.ch_name}</span>
                                </label>
                                {opens && (
                                    <span data-opens-here="" className="chip shrink-0">
                                        Opens here
                                    </span>
                                )}
                                {touched === ch.ch_uuid && <SavedTick status={status} />}
                                {failedRow === ch.ch_uuid && (
                                    <span aria-hidden="true" data-save-failed="" className="size-1.5 shrink-0 rounded-full bg-destructive" />
                                )}
                                {canLand && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger
                                            aria-label={`More for #${ch.ch_name}`}
                                            className="ml-auto inline-grid size-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                                        >
                                            <MoreHorizontal className="size-4" aria-hidden="true" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => openHere(ch.ch_uuid)}>Open new members here</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </li>
                        )
                    })}
                    {hidden > 0 && (
                        <li className="cfg-channel-row set-row">
                            <button
                                type="button"
                                aria-expanded={expanded}
                                onClick={() => setExpanded((e) => !e)}
                                className="rounded-sm px-0.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                                {expanded ? "Show fewer" : `Show ${hidden} more`}
                            </button>
                        </li>
                    )}
                </ul>
                {(failedRow || !view?.chosen || order.length === 0) && (
                    <p
                        role={failedRow ? "alert" : undefined}
                        className={cn("set-row flex items-center text-xs text-pretty", failedRow ? "text-danger-ink" : "text-muted-foreground")}
                    >
                        {failedRow
                            ? status.error
                            : order.length === 0
                              ? "With none chosen, new members start on Home and find channels themselves."
                              : "Nobody has chosen yet, so new members join #general."}
                    </p>
                )}
            </SettingsCard>
        )
    }

    return (
        <SettingsSection
            id="general-channels"
            title="Where new members start"
            description="New people join these channels and open on #general when it's one of them, otherwise on the first."
        >
            {body}
        </SettingsSection>
    )
}
