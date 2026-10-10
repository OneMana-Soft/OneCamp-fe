"use client"

/**
 * SlackBridgeCard: keep a Slack channel and a OneCamp channel in one
 * conversation.
 *
 * Teams rarely leave Slack in a day, and a switch that strands half the team
 * in the old tool does not happen at all. With a channel linked, what someone
 * writes in Slack appears in OneCamp under their name, and what someone writes
 * in OneCamp appears in Slack under theirs. Thread replies, edits and
 * deletions follow. Slack people need no OneCamp account.
 *
 * Setup is two steps because Slack requires the workspace admin to create and
 * install the app themselves: the server hands us a manifest link that opens
 * Slack's "create app" page already filled in.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, Unlink } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { ChannelInfoListInterfaceResp } from "@/types/channel"
import {
    connectSlackBridge,
    disconnectSlackBridge,
    getSlackBridge,
    linkableChannels,
    linkSlackChannel,
    listSlackChannels,
    slackChannelLabel,
    unlinkSlackChannel,
    type SlackBridgeStatus,
    type SlackChannel,
} from "@/services/slackBridgeService"

const SlackBridgeCard: React.FC = () => {
    const { toast } = useToast()
    const [status, setStatus] = useState<SlackBridgeStatus | null>(null)
    const [loadError, setLoadError] = useState("")
    const [token, setToken] = useState("")
    const [secret, setSecret] = useState("")
    const [busy, setBusy] = useState("") // "connect", "disconnect", "link", or the id of a link being removed
    const [formError, setFormError] = useState("")
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)
    const [slackChannels, setSlackChannels] = useState<SlackChannel[] | null>(null)
    const [slackChannelsError, setSlackChannelsError] = useState("")
    const [pickSlack, setPickSlack] = useState("")
    const [pickOneCamp, setPickOneCamp] = useState("")

    const { data: channelsData } = useFetch<ChannelInfoListInterfaceResp>(
        status?.connected ? GetEndpointUrl.GetAllActiveChannelList : "",
    )

    const load = useCallback(async () => {
        try {
            setStatus(await getSlackBridge())
            setLoadError("")
        } catch (e) {
            setLoadError(apiErrorMessage(e, "Couldn't load the Slack bridge."))
        }
    }, [])

    const loadSlackChannels = useCallback(async () => {
        setSlackChannelsError("")
        try {
            setSlackChannels(await listSlackChannels())
        } catch (e) {
            setSlackChannels([])
            setSlackChannelsError(apiErrorMessage(e, "Couldn't list your Slack channels."))
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    useEffect(() => {
        if (status?.connected) void loadSlackChannels()
    }, [status?.connected, loadSlackChannels])

    const oneCampChoices = useMemo(
        () => linkableChannels(channelsData?.channels_list ?? [], status?.links ?? []),
        [channelsData, status?.links],
    )

    const copy = useCallback(
        async (text: string, what: string) => {
            try {
                await navigator.clipboard.writeText(text)
                toast({ title: "Copied", description: what })
            } catch {
                toast({ title: "Couldn't copy", description: "Select the text and copy it yourself.", variant: "destructive" })
            }
        },
        [toast],
    )

    const connect = async () => {
        setBusy("connect")
        setFormError("")
        try {
            setStatus(await connectSlackBridge(token, secret))
            setToken("")
            setSecret("")
            toast({ title: "Slack connected", description: "Now link a Slack channel to a OneCamp channel." })
        } catch (e) {
            setFormError(apiErrorMessage(e, "Couldn't connect Slack."))
        } finally {
            setBusy("")
        }
    }

    const disconnect = async () => {
        setBusy("disconnect")
        try {
            await disconnectSlackBridge()
            setConfirmDisconnect(false)
            setSlackChannels(null)
            await load()
            toast({ title: "Slack disconnected", description: "Messages already bridged stay in both apps." })
        } catch (e) {
            toast({ title: "Couldn't disconnect", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
        } finally {
            setBusy("")
        }
    }

    const link = async () => {
        setBusy("link")
        setFormError("")
        try {
            const created = await linkSlackChannel(pickSlack, pickOneCamp)
            setPickSlack("")
            setPickOneCamp("")
            await Promise.all([load(), loadSlackChannels()])
            toast({
                title: "Channels linked",
                description: `#${created.slack_channel_name} in Slack and #${created.channel_name} here now share one conversation.`,
            })
        } catch (e) {
            setFormError(apiErrorMessage(e, "Couldn't link those channels."))
        } finally {
            setBusy("")
        }
    }

    const unlink = async (id: string) => {
        setBusy(id)
        try {
            await unlinkSlackChannel(id)
            await Promise.all([load(), loadSlackChannels()])
            toast({ title: "Unlinked", description: "Past messages stay where they are." })
        } catch (e) {
            toast({ title: "Couldn't unlink", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
        } finally {
            setBusy("")
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base font-semibold">Slack bridge</CardTitle>
                <CardDescription>
                    Keep a Slack channel and a OneCamp channel in one conversation while your team moves over. Messages,
                    thread replies, edits and deletions go both ways, each under the name of the person who wrote it.
                    People in Slack don&apos;t need a OneCamp account or a seat.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {loadError && <p className="text-sm text-destructive">{loadError}</p>}
                {!status && !loadError && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </p>
                )}

                {status && !status.connected && (
                    <ol className="space-y-5">
                        <li className="space-y-2">
                            <p className="text-sm font-medium">1. Create the app in Slack</p>
                            <p className="text-sm text-muted-foreground">
                                Slack opens with everything filled in. Choose your workspace, create the app, then click{" "}
                                <span className="font-medium text-foreground">Install to Workspace</span>.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button asChild size="sm">
                                    <a href={status.manifest_url} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="mr-2 h-4 w-4" /> Create the app in Slack
                                    </a>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void copy(status.manifest, "Paste it under “From a manifest” in Slack.")}
                                >
                                    <Copy className="mr-2 h-4 w-4" /> Copy the manifest
                                </Button>
                            </div>
                        </li>
                        <li className="space-y-3">
                            <p className="text-sm font-medium">2. Paste the app&apos;s two keys</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="slack-bot-token">Bot User OAuth Token</Label>
                                    <Input
                                        id="slack-bot-token"
                                        type="password"
                                        autoComplete="off"
                                        placeholder="xoxb-…"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">In Slack: OAuth &amp; Permissions.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="slack-signing-secret">Signing Secret</Label>
                                    <Input
                                        id="slack-signing-secret"
                                        type="password"
                                        autoComplete="off"
                                        value={secret}
                                        onChange={(e) => setSecret(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">In Slack: Basic Information.</p>
                                </div>
                            </div>
                            {formError && <p className="text-sm text-destructive">{formError}</p>}
                            <Button size="sm" onClick={() => void connect()} disabled={!token.trim() || !secret.trim() || busy === "connect"}>
                                {busy === "connect" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Connect Slack
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Slack delivers messages to{" "}
                                <code className="break-all rounded bg-muted px-1 py-0.5 font-mono">{status.events_url}</code>. The
                                manifest sets this for you.
                            </p>
                        </li>
                    </ol>
                )}

                {status?.connected && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-success" />
                                Connected to <span className="font-medium">{status.team_name || "Slack"}</span>
                            </p>
                            {confirmDisconnect ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Stop bridging every channel?</span>
                                    <Button variant="destructive" size="sm" onClick={() => void disconnect()} disabled={busy === "disconnect"}>
                                        {busy === "disconnect" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Disconnect
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
                                    Disconnect
                                </Button>
                            )}
                        </div>

                        {status.last_error && (
                            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5" role="alert">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                <p className="text-sm">{status.last_error}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <p className="text-sm font-medium">Linked channels</p>
                            {status.links.length === 0 ? (
                                <p className="text-sm text-muted-foreground">None yet. Link your first pair below.</p>
                            ) : (
                                <ul className="divide-y divide-border rounded-lg border border-border">
                                    {status.links.map((l) => (
                                        <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                            <span className="min-w-0 truncate text-sm">
                                                <span className="text-muted-foreground">Slack</span> #{l.slack_channel_name}
                                                <span className="mx-2 text-muted-foreground" aria-label="and">↔</span>
                                                <span className="text-muted-foreground">OneCamp</span>{" "}
                                                {l.channel_name ? `#${l.channel_name}` : <em className="text-muted-foreground">deleted channel</em>}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => void unlink(l.id)}
                                                disabled={busy === l.id}
                                                aria-label={`Unlink #${l.slack_channel_name}`}
                                            >
                                                {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium">Link a channel</p>
                            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                <Select value={pickSlack} onValueChange={setPickSlack}>
                                    <SelectTrigger aria-label="Slack channel">
                                        <SelectValue placeholder={slackChannels === null ? "Loading Slack channels…" : "Slack channel"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {slackChannels?.length === 0 && (
                                            <div className="px-2 py-3 text-center text-sm text-muted-foreground">No channels left to link</div>
                                        )}
                                        {slackChannels?.map((c) => (
                                            <SelectItem key={c.id} value={c.id} disabled={c.is_private && !c.is_member}>
                                                {slackChannelLabel(c)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={pickOneCamp} onValueChange={setPickOneCamp}>
                                    <SelectTrigger aria-label="OneCamp channel">
                                        <SelectValue placeholder="OneCamp channel" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {oneCampChoices.length === 0 && (
                                            <div className="px-2 py-3 text-center text-sm text-muted-foreground">No channels left to link</div>
                                        )}
                                        {oneCampChoices.map((c) => (
                                            <SelectItem key={c.ch_uuid} value={c.ch_uuid}>
                                                #{c.ch_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button size="sm" className="h-10" onClick={() => void link()} disabled={!pickSlack || !pickOneCamp || busy === "link"}>
                                    {busy === "link" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Link
                                </Button>
                            </div>
                            {slackChannelsError && <p className="text-sm text-destructive">{slackChannelsError}</p>}
                            {formError && <p className="text-sm text-destructive">{formError}</p>}
                            <p className="text-xs text-muted-foreground">
                                Everyone in the Slack channel will read what is written in the OneCamp one, so link a
                                private channel only to a Slack channel with the same people. The app joins a public Slack
                                channel itself; for a private one, type /invite @OneCamp in it first. Files shared in Slack
                                arrive as links; replies from agents and workflows stay in OneCamp.
                            </p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}

export default SlackBridgeCard
