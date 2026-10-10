"use client"

// ConnectorsCard — the user-facing connector directory. Each connector lets the
// workspace AI read and (with confirmation) act on the user's external account.
// We surface exactly what each connector can see/do (read vs write permissions)
// so consent is informed, and connect/disconnect is one click.
//
// The page's header (app/app/settings/connectors) names the section and says
// what connecting does; this is the list under it.

import React, { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { Github, Mail, Calendar, ShieldCheck, Eye, Loader2 } from "@/lib/icons"
import { Plug } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsList } from "@/components/ui/settingsSection"
import { Tile } from "@/components/ui/graphics/Tile"
import { hueFor, type CampHue } from "@/lib/campHue"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { listConnectors, startConnect, disconnectConnector } from "@/services/connectorService"
import type { ConnectorStatus } from "@/types/connector"

const ICONS: Record<string, React.ReactNode> = {
    gmail: <Mail />,
    calendar: <Calendar />,
    github: <Github />,
}

/**
 * A connector's own hue, fixed per provider so it reads the same everywhere:
 * Gmail berry, Google Calendar sky, GitHub dusk. One the list doesn't know
 * yet takes a stable hue from its id.
 */
const HUES: Record<string, CampHue> = { gmail: "berry", calendar: "sky", github: "dusk" }
const hueOf = (c: ConnectorStatus): CampHue => HUES[c.icon_key] ?? hueFor(c.id)

/** The section's hue (lib/settingsSections), for the list's empty state. */
const SECTION_HUE: CampHue = "lake"

/** The list's rows while it loads: a tile, two lines and a button's place each. */
function LoadingRows() {
    return (
        <div role="status" aria-label="Loading your connectors">
            <SettingsList>
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} aria-hidden="true" className="flex items-start gap-3 px-4 py-3">
                        <Skeleton className="size-8 shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1 space-y-2 pt-1">
                            <Skeleton className={i % 2 ? "h-3.5 w-24" : "h-3.5 w-32"} />
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                        <Skeleton className="h-8 w-20 shrink-0" />
                    </div>
                ))}
            </SettingsList>
        </div>
    )
}

export default function ConnectorsCard() {
    const { data: connectors, error, isLoading, mutate } = useSWR("user-connectors", listConnectors, {
        revalidateOnFocus: false,
    })
    const isError = !!error

    const [confirmDisconnect, setConfirmDisconnect] = useState<ConnectorStatus | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    // Surface the OAuth callback result (?connector=success|error) as a toast.
    useEffect(() => {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const status = params.get("connector")
        if (status === "success") {
            toast({ title: "Connected", description: "Your account is now connected." })
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

    const handleDisconnect = useCallback(async () => {
        if (!confirmDisconnect) return
        setBusyId(confirmDisconnect.id)
        try {
            await disconnectConnector(confirmDisconnect.id)
            toast({ title: `${confirmDisconnect.name} disconnected` })
            setConfirmDisconnect(null)
            mutate()
        } catch (e) {
            toast({
                title: `Couldn't disconnect ${confirmDisconnect.name}`,
                description: apiErrorMessage(e, "Check your connection and try again."),
                variant: "destructive",
            })
        } finally {
            setBusyId(null)
        }
    }, [confirmDisconnect, mutate])

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
                    icon={Plug}
                    hue={SECTION_HUE}
                    title="No connectors are set up on this server"
                    description="They appear here once an admin sets up Google or GitHub sign-in, under Admin, Integrations."
                />
            ) : (
                <SettingsList>
                    {connectors.map((c) => (
                        <div key={c.id} data-connector={c.id} className="flex items-start gap-3 px-4 py-3">
                            <Tile hue={hueOf(c)} size="md">
                                {ICONS[c.icon_key] || <Plug />}
                            </Tile>
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-sm font-medium leading-5">{c.name}</span>
                                    {/* A status is a dot and a word, in the status colour. */}
                                    {c.connected && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-ink">
                                            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                                            Connected
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground text-pretty">{c.description}</p>
                                <ul className="space-y-0.5 pt-1">
                                    {c.permissions.map((p, i) => (
                                        <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            {p.capability === "write"
                                                ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
                                                : <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                                            {p.description}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="shrink-0">
                                {/* Outlined, both: a list where every row carried a
                                    filled button had no one primary action. */}
                                {c.connected ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        aria-label={`Disconnect ${c.name}`}
                                        onClick={() => setConfirmDisconnect(c)}
                                        disabled={busyId === c.id}
                                    >
                                        Disconnect
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        aria-label={`Connect ${c.name}`}
                                        onClick={() => handleConnect(c)}
                                        disabled={busyId === c.id}
                                    >
                                        {busyId === c.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                                        Connect
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </SettingsList>
            )}

            <Dialog open={!!confirmDisconnect} onOpenChange={(o) => !o && setConfirmDisconnect(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Disconnect {confirmDisconnect?.name}?</DialogTitle>
                        <DialogDescription>
                            The AI will no longer be able to access your {confirmDisconnect?.name} account. Your
                            stored access token is deleted. You can connect it again any time.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmDisconnect(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDisconnect} disabled={busyId === confirmDisconnect?.id}>
                            {busyId === confirmDisconnect?.id ? "Disconnecting…" : `Disconnect ${confirmDisconnect?.name ?? ""}`.trim()}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
