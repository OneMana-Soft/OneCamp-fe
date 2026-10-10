"use client"

// Where new members start.
//
// Everyone who joins the workspace, by invitation, Google, GitHub, single
// sign-on or the directory, is put in these channels and opens with the message
// box ready on #general when it is one of them, otherwise on the first in the
// order below (the server's landingOf). Until an admin chooses, it is #general, the
// channel every workspace starts with. Only public channels that aren't
// archived can be chosen: a private one would hand every newcomer a channel
// its members never opened to them.

import { serverMessage } from "@/lib/http/serverMessage"
import { useEffect, useMemo, useRef, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SaveBar, SettingsSection } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { Hash } from "@/lib/icons"
import { getDefaultChannels, setDefaultChannels, type DefaultChannels } from "@/services/settingsService"

/** The same choice, whatever order it was made in. Pure. */
export function sameChoice(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    const set = new Set(a)
    return b.every((id) => set.has(id))
}

/** The server's refusal, in its own words, or a plain fallback. */
const refusal = (err: unknown) => serverMessage(err, "Try again in a moment.")

/**
 * An unsaved choice, kept while the admin looks at another section: the admin
 * page shows one section at a time, so leaving General unmounted this card and
 * the ticks were gone when they came back. They come back now, with the bar.
 */
let keptChoice: string[] | null = null
/** For tests: start each one with nothing kept. */
export function forgetKeptChoice() {
    keptChoice = null
}

export default function DefaultChannelsCard() {
    const { toast } = useToast()
    const [view, setView] = useState<DefaultChannels | null>(null)
    const [failed, setFailed] = useState(false)
    const [loading, setLoading] = useState(true)
    const [picked, setPicked] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    const show = (next: DefaultChannels | null, choice?: string[] | null) => {
        setView(next)
        setPicked(choice ?? next?.channels.map((c) => c.ch_uuid) ?? [])
    }

    const load = () => {
        setLoading(true)
        setFailed(false)
        getDefaultChannels()
            .then((next) => {
                show(next, keptChoice)
                keptChoice = null
            })
            .catch(() => setFailed(true))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const saved = useMemo(() => view?.channels.map((c) => c.ch_uuid) ?? [], [view])
    const changed = !!view && !sameChoice(saved, picked)

    // The choice as it is at unmount, kept only while it differs from what's saved.
    const latest = useRef({ picked, changed })
    latest.current = { picked, changed }
    useEffect(() => () => {
        keptChoice = latest.current.changed ? latest.current.picked : null
    }, [])

    const toggle = (id: string, on: boolean) =>
        setPicked((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id)))

    const save = async () => {
        setSaving(true)
        try {
            // Kept in the order the list shows, so where a new member lands is
            // predictable: #general when it is chosen, otherwise the first.
            const order = (view?.available ?? []).map((c) => c.ch_uuid).filter((id) => picked.includes(id))
            const next = await setDefaultChannels(order)
            show(next)
            toast({
                title: order.length ? "New members will join these channels" : "New members will start in no channel",
            })
        } catch (err) {
            toast({ title: "Couldn't save the channels new members join", description: refusal(err), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    let body: React.ReactNode
    if (loading) {
        // The list it is about to show, not a spinner.
        body = (
            <ul aria-busy="true" aria-label="Loading the channels new members join" className="space-y-1 rounded-lg border border-border p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-2 px-2 py-1.5" aria-hidden="true">
                        <Skeleton className="h-4 w-4 shrink-0" />
                        <Skeleton className={i % 2 === 0 ? "h-3.5 w-24" : "h-3.5 w-32"} />
                    </li>
                ))}
            </ul>
        )
    } else if (failed) {
        body = <ErrorState subject="the channels new members join" onRetry={load} />
    } else if ((view?.available.length ?? 0) === 0) {
        body = (
            <p className="text-sm text-muted-foreground">
                There are no public channels yet. Create one, and you can choose it here.
            </p>
        )
    } else {
        body = (
            <>
                {!view?.chosen && (
                    <p className="text-xs text-muted-foreground">
                        Nobody has chosen yet, so new members join #general.
                    </p>
                )}
                <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {view?.available.map((ch) => {
                        const id = `default-channel-${ch.ch_uuid}`
                        return (
                            <li key={ch.ch_uuid} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-highlight">
                                <Checkbox
                                    id={id}
                                    checked={picked.includes(ch.ch_uuid)}
                                    onCheckedChange={(v) => toggle(ch.ch_uuid, v === true)}
                                    disabled={saving}
                                />
                                <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-sm">
                                    <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                    <span className="truncate">{ch.ch_name}</span>
                                </label>
                            </li>
                        )
                    })}
                </ul>
                {picked.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                        With none chosen, new members start on Home and find channels themselves.
                    </p>
                )}
                {/* The choice waits here until it is saved or put back, and stays
                    in view while the page scrolls. */}
                <SaveBar
                    dirty={changed}
                    saving={saving}
                    onSave={() => void save()}
                    onDiscard={() => setPicked(saved)}
                    what="channels for new members"
                />
            </>
        )
    }

    return (
        <SettingsSection
            title="Where new members start"
            description={
                <>
                    Everyone who joins is added to these channels, and opens on #general when it&apos;s one of them,
                    otherwise on the first, ready to say hello. Only public channels that aren&apos;t archived can be chosen.
                </>
            }
        >
            {body}
        </SettingsSection>
    )
}
