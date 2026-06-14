"use client"

// ConnectorsCard — the user-facing connector directory. Each connector lets the
// workspace AI read and (with confirmation) act on the user's external account.
// We surface exactly what each connector can see/do (read vs write permissions)
// so consent is informed, and connect/disconnect is one click.

import React, { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Github, Mail, Calendar, ShieldCheck, Check, Eye, Loader2, RefreshCw } from "@/lib/icons"
import { Plug } from "lucide-react"
import { listConnectors, startConnect, disconnectConnector } from "@/services/connectorService"
import type { ConnectorStatus } from "@/types/connector"

const ICONS: Record<string, React.ReactNode> = {
    gmail: <Mail className="h-5 w-5" />,
    calendar: <Calendar className="h-5 w-5" />,
    github: <Github className="h-5 w-5" />,
}

export default function ConnectorsCard() {
    const { toast } = useToast()
    const { data: connectors, isLoading, mutate } = useSWR("user-connectors", listConnectors, {
        revalidateOnFocus: false,
    })

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
            toast({ title: "Connection failed", description: "We couldn't complete the connection.", variant: "destructive" })
        }
        if (status) {
            window.history.replaceState({}, document.title, window.location.pathname)
        }
    }, [toast, mutate])

    const handleConnect = useCallback(async (c: ConnectorStatus) => {
        setBusyId(c.id)
        try {
            await startConnect(c.id) // redirects away on success
        } catch {
            setBusyId(null)
            toast({
                title: "Couldn't start connection",
                description: `${c.name} may not be configured by your admin yet.`,
                variant: "destructive",
            })
        }
    }, [toast])

    const handleDisconnect = useCallback(async () => {
        if (!confirmDisconnect) return
        setBusyId(confirmDisconnect.id)
        try {
            await disconnectConnector(confirmDisconnect.id)
            toast({ title: "Disconnected" })
            setConfirmDisconnect(null)
            mutate()
        } catch {
            toast({ title: "Failed to disconnect", variant: "destructive" })
        } finally {
            setBusyId(null)
        }
    }, [confirmDisconnect, mutate, toast])

    return (
        <div className="flex flex-col">
            <div className="mb-5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Plug className="h-5 w-5 text-primary" /> Connectors
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Connect your accounts so the AI can help across your tools. The AI only ever uses your
                    own connections, and actions like sending email always ask for your confirmation first.
                </p>
            </div>

            <div className="space-y-2.5">
                {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Loading connectors…
                    </div>
                )}
                {!isLoading && (!connectors || connectors.length === 0) && (
                    <div className="text-center py-12 text-muted-foreground">
                        <Plug className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">No connectors are available yet.</p>
                        <p className="text-xs mt-1">Ask your admin to configure Google or GitHub OAuth.</p>
                    </div>
                )}
                {connectors?.map((c) => (
                    <div key={c.id} className="rounded-xl border border-border/70 bg-card p-4">
                        <div className="flex items-start gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center text-foreground">
                                {ICONS[c.icon_key] || <Plug className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{c.name}</span>
                                    {c.connected && (
                                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                            <Check className="h-3 w-3 mr-0.5" />Connected
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                                <ul className="mt-2 space-y-1">
                                    {c.permissions.map((p, i) => (
                                        <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                            {p.capability === "write"
                                                ? <ShieldCheck className="h-3 w-3 text-amber-500" />
                                                : <Eye className="h-3 w-3 text-muted-foreground" />}
                                            {p.description}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="shrink-0">
                                {c.connected ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setConfirmDisconnect(c)}
                                        disabled={busyId === c.id}
                                    >
                                        Disconnect
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={() => handleConnect(c)}
                                        disabled={busyId === c.id}
                                        className="gap-1.5"
                                    >
                                        {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                        Connect
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <Dialog open={!!confirmDisconnect} onOpenChange={(o) => !o && setConfirmDisconnect(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Disconnect {confirmDisconnect?.name}?</DialogTitle>
                        <DialogDescription>
                            The AI will no longer be able to access your {confirmDisconnect?.name} account. Your
                            stored access token is deleted. You can reconnect anytime.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmDisconnect(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDisconnect} disabled={busyId === confirmDisconnect?.id}>
                            {busyId === confirmDisconnect?.id ? "Disconnecting…" : "Disconnect"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
