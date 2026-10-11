"use client"

// ConnectorsCard — the user-facing connector directory. Each connector lets the
// workspace AI read and (with confirmation) act on the user's external account.
// We surface exactly what each connector can see/do (read vs write permissions)
// so consent is informed, and connect/disconnect is one click.
//
// The page's header (app/app/settings/connectors) names the section and says
// what connecting does; this is the list under it.
//
// Design v3 (admin §S3): each connector is a connection card, as on the
// Integrations tab: its neutral mark, its name, a dot and a word, and Connect
// (the one primary) or ⋯ with Disconnect behind a confirm. A connected card
// shows the account it reads from; a connection the provider stopped
// accepting shows a sun row with Reconnect. A provider is never a hue.

import React, { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Calendar, Eye, Loader2, Mail, ShieldCheck, Unlink, type LucideIcon } from "@/lib/icons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotPlug } from "@/components/ui/graphics/spots"
import type { CampHue } from "@/lib/campHue"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { listConnectors, startConnect, disconnectConnector } from "@/services/connectorService"
import type { ConnectorStatus } from "@/types/connector"
import { ConnectionCard, RowMenu, SourceMark, StateWord } from "@/components/admin/connectParts"
import { ConnectionBanner, markConnecting, useConnectMorph } from "@/components/admin/integrationParts"

/** Gmail and Google Calendar share an initial, so each has its kind's glyph. */
const GLYPHS: Record<string, LucideIcon> = { gmail: Mail, calendar: Calendar }

/** The section's hue (lib/settingsSections), for the list's empty state. */
const SECTION_HUE: CampHue = "lake"

/**
 * What the server may add to a connector's status: the account it reads from,
 * when it was connected, and whether the provider stopped accepting our
 * access. Drawn only when present; the backend doesn't send them yet.
 */
type ConnectorView = ConnectorStatus & {
    account?: string
    connected_at?: string
    failing?: boolean
}

/** "Connected 3 Oct". */
export function connectedOn(iso?: string): string | null {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 1971) return null
    return `Connected ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
}

/** The list's cards while it loads: a header row each, in a card's shape. */
function LoadingRows() {
    return (
        <div role="status" aria-label="Loading your connectors" className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} aria-hidden="true" className="cx-conn">
                    <div className="cx-conn-head">
                        <Skeleton className="ml-1 size-8 shrink-0 rounded-[9px]" />
                        <Skeleton className={i % 2 ? "h-3.5 w-24" : "h-3.5 w-32"} />
                        <Skeleton className="ml-auto h-7 w-20 shrink-0" />
                    </div>
                    <div className="cx-int-note space-y-2">
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                </div>
            ))}
        </div>
    )
}

/** The account a connected card reads from: a 20px mark, the address, and when. */
function AccountChip({ c }: { c: ConnectorView }) {
    const when = connectedOn(c.connected_at)
    if (!c.account && !when) return null
    return (
        <span data-account-chip="" className="cx-int-account">
            <SourceMark vendor={c.icon_key} name={c.name} glyph={GLYPHS[c.icon_key]} size={20} />
            {c.account && <span className="min-w-0 truncate font-medium text-foreground">{c.account}</span>}
            {when && <span className="shrink-0 text-muted-foreground">{when}</span>}
        </span>
    )
}

function ConnectorCard({
    c,
    busy,
    returned,
    onConnect,
    onDisconnect,
}: {
    c: ConnectorView
    busy: boolean
    returned: boolean
    onConnect: () => void
    onDisconnect: () => void
}) {
    const morph = useConnectMorph(`connector:${c.id}`, c.connected, returned)
    const connectButton = (label = "Connect") => (
        <Button size="sm" className="h-11 md:h-7" aria-label={`${label} ${c.name}`} onClick={onConnect} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {label}
        </Button>
    )
    return (
        <ConnectionCard
            level={2}
            aria-label={c.name}
            mark={<SourceMark vendor={c.icon_key} name={c.name} glyph={GLYPHS[c.icon_key]} />}
            name={c.name}
            state={
                c.connected && c.failing ? (
                    <StateWord tone="warning">Needs attention</StateWord>
                ) : (
                    <StateWord tone={morph.tone} className={morph.morphing ? "cx-int-morph" : undefined}>
                        {c.connected ? "Connected" : "Not connected"}
                    </StateWord>
                )
            }
            action={
                c.connected ? (
                    <RowMenu
                        label={`${c.name} actions`}
                        items={[{ label: `Disconnect ${c.name}`, icon: Unlink, destructive: true, disabled: busy, onSelect: onDisconnect }]}
                    />
                ) : (
                    connectButton()
                )
            }
        >
            {c.connected && c.failing && (
                <ConnectionBanner action={connectButton("Reconnect")}>
                    {c.name} stopped accepting our access.
                </ConnectionBanner>
            )}
            <div data-connector={c.id} className="cx-int-note space-y-2">
                {c.connected && <AccountChip c={c} />}
                <p className="text-xs text-muted-foreground text-pretty">{c.description}</p>
                <ul className="space-y-0.5">
                    {c.permissions.map((p, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {p.capability === "write"
                                ? <ShieldCheck className="size-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
                                : <Eye className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />}
                            {p.description}
                        </li>
                    ))}
                </ul>
            </div>
        </ConnectionCard>
    )
}

export default function ConnectorsCard() {
    const { data: connectors, error, isLoading, mutate } = useSWR("user-connectors", listConnectors, {
        revalidateOnFocus: false,
    })
    const isError = !!error
    const confirm = useConfirm()
    const [busyId, setBusyId] = useState<string | null>(null)
    // Back from a provider's sign-in: the connected card's dot morphs once.
    const [returned, setReturned] = useState(false)

    // Surface the OAuth callback result (?connector=success|error) as a toast.
    useEffect(() => {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const status = params.get("connector")
        if (status === "success") {
            toast({ title: "Connected", description: "Your account is now connected.", tone: "success" })
            setReturned(true)
            mutate()
        } else if (status === "error") {
            toast({
                title: "Couldn't connect your account",
                description: "The sign-in didn't finish. Press Connect to try again.",
                variant: "destructive",
            })
        }
        if (status) {
            window.history.replaceState({}, document.title, window.location.pathname)
        }
    }, [mutate])

    const handleConnect = useCallback(async (c: ConnectorStatus) => {
        setBusyId(c.id)
        try {
            markConnecting(`connector:${c.id}`)
            await startConnect(c.id) // redirects away on success
        } catch (e) {
            setBusyId(null)
            toast({
                title: `Couldn't connect ${c.name}`,
                description: apiErrorMessage(e, `${c.name} may not be set up on this server yet. Ask an admin.`),
                variant: "destructive",
            })
        }
    }, [])

    const disconnect = useCallback(
        async (c: ConnectorStatus) => {
            setBusyId(c.id)
            try {
                await disconnectConnector(c.id)
                toast({ title: `${c.name} disconnected` })
                mutate()
            } catch (e) {
                toast({
                    title: `Couldn't disconnect ${c.name}`,
                    description: apiErrorMessage(e, "Check your connection and try again."),
                    variant: "destructive",
                })
            } finally {
                setBusyId(null)
            }
        },
        [mutate],
    )

    const askDisconnect = (c: ConnectorStatus) =>
        confirm({
            title: `Disconnect your ${c.name} account?`,
            description: `The AI will no longer be able to access your ${c.name} account. Your stored access token is deleted. You can connect it again any time.`,
            confirmText: "Disconnect account",
            destructive: true,
            onConfirm: () => void disconnect(c),
        })

    return (
        <div className="flex flex-col">
            {isLoading ? (
                <LoadingRows />
            ) : isError ? (
                // Before the empty case: a failed request is not a server with
                // nothing to connect, which is what it used to say.
                <ErrorState subject="your connectors" onRetry={() => void mutate()} />
            ) : !connectors || connectors.length === 0 ? (
                <EmptyState
                    tone="accent"
                    illustration={<SpotPlug hue={SECTION_HUE} />}
                    title="No connectors are set up on this server"
                    description="They appear here once an admin sets up Google or GitHub sign-in, under Admin, Integrations."
                />
            ) : (
                <div className="space-y-3">
                    {(connectors as ConnectorView[]).map((c) => (
                        <ConnectorCard
                            key={c.id}
                            c={c}
                            busy={busyId === c.id}
                            returned={returned}
                            onConnect={() => void handleConnect(c)}
                            onDisconnect={() => askDisconnect(c)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
