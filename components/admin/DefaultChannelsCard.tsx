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
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { Hash, Loader2 } from "@/lib/icons"
import { getDefaultChannels, setDefaultChannels, type DefaultChannels } from "@/services/settingsService"

/** The same choice, whatever order it was made in. Pure. */
export function sameChoice(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    const set = new Set(a)
    return b.every((id) => set.has(id))
}

/** The server's refusal, in its own words, or a plain fallback. */
const refusal = (err: unknown) => serverMessage(err, "Try again in a moment.")

export default function DefaultChannelsCard() {
    const { toast } = useToast()
    const [view, setView] = useState<DefaultChannels | null>(null)
    const [failed, setFailed] = useState(false)
    const [loading, setLoading] = useState(true)
    const [picked, setPicked] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    const show = (next: DefaultChannels | null) => {
        setView(next)
        setPicked(next?.channels.map((c) => c.ch_uuid) ?? [])
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

    const saved = useMemo(() => view?.channels.map((c) => c.ch_uuid) ?? [], [view])
    const changed = !sameChoice(saved, picked)

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

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">Where new members start</CardTitle>
                </div>
                <CardDescription>
                    Everyone who joins is added to these channels, and opens on #general when it&apos;s one of them,
                    otherwise on the first, ready to say hello. Only public channels that aren&apos;t archived can be chosen.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading channels…
                    </div>
                ) : failed ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <span>Couldn&apos;t load the channels new members join.</span>
                        <Button size="sm" variant="outline" onClick={load}>Try again</Button>
                    </div>
                ) : (view?.available.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        There are no public channels yet. Create one, and you can choose it here.
                    </p>
                ) : (
                    <>
                        {!view?.chosen && (
                            <p className="text-xs text-muted-foreground">
                                Nobody has chosen yet, so new members join #general.
                            </p>
                        )}
                        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                            {view?.available.map((ch) => {
                                const id = `default-channel-${ch.ch_uuid}`
                                return (
                                    <li key={ch.ch_uuid} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
                                        <Checkbox
                                            id={id}
                                            checked={picked.includes(ch.ch_uuid)}
                                            onCheckedChange={(v) => toggle(ch.ch_uuid, v === true)}
                                            disabled={saving}
                                        />
                                        <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-sm">
                                            <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                        <Button size="sm" variant="outline" onClick={save} disabled={!changed || saving}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
