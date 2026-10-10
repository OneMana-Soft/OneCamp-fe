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
 *
 * A settings section like its neighbours on the Integrations tab, with the
 * connections plug while nothing is connected. Unlinking a channel and
 * disconnecting both ask first: each stops messages crossing over.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { StatusWord } from "@/components/ui/statusWord"
import { cn } from "@/lib/utils/helpers/cn"
import { SpotPlug } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { ConnectionSkeleton } from "@/components/admin/integrationParts"
import { AlertTriangle, Copy, ExternalLink, Loader2, Unlink } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
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
    type SlackBridgeLink,
    type SlackBridgeStatus,
    type SlackChannel,
} from "@/services/slackBridgeService"

const SlackBridgeCard: React.FC = () => {
    const { toast } = useToast()
    const confirm = useConfirm()
    const [status, setStatus] = useState<SlackBridgeStatus | null>(null)
    const [loadFailed, setLoadFailed] = useState(false)
    const [loadError, setLoadError] = useState("")
    const [retrying, setRetrying] = useState(false)
    const [token, setToken] = useState("")
    const [secret, setSecret] = useState("")
    const [busy, setBusy] = useState("") // "connect", "disconnect", "link", or the id of a link being removed
    const [formError, setFormError] = useState("")
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
            setLoadFailed(false)
        } catch (e) {
            setLoadError(apiErrorMessage(e))
            setLoadFailed(true)
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
            setSlackChannels(null)
            await load()
            toast({ title: "Slack disconnected", description: "Messages already bridged stay in both apps." })
        } catch (e) {
            toast({
                title: "Couldn't disconnect Slack",
                description: apiErrorMessage(e, "Try again in a moment."),
                variant: "destructive",
            })
        } finally {
            setBusy("")
        }
    }

    const askDisconnect = () =>
        confirm({
            title: "Disconnect Slack?",
            description:
                "Every linked channel stops bridging, in both directions. Messages already bridged stay in both apps.",
            confirmText: "Disconnect Slack",
            destructive: true,
            onConfirm: () => void disconnect(),
        })

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
            toast({ title: "Channels unlinked", description: "Past messages stay where they are." })
        } catch (e) {
            toast({
                title: "Couldn't unlink the channels",
                description: apiErrorMessage(e, "Try again in a moment."),
                variant: "destructive",
            })
        } finally {
            setBusy("")
        }
    }

    const askUnlink = (l: SlackBridgeLink) =>
        confirm({
            title: `Unlink the #${l.slack_channel_name} channel?`,
            description: `Messages stop going between #${l.slack_channel_name} in Slack and ${
                l.channel_name ? `#${l.channel_name}` : "the deleted channel"
            } here. Past messages stay where they are.`,
            confirmText: "Unlink channel",
            destructive: true,
            onConfirm: () => void unlink(l.id),
        })

    let body: React.ReactNode
    if (!status && loadFailed) {
        body = (
            <ErrorState
                compact
                subject="the Slack bridge"
                detail={loadError || undefined}
                retrying={retrying}
                onRetry={() => {
                    setRetrying(true)
                    void load().finally(() => setRetrying(false))
                }}
            />
        )
    } else if (!status) {
        body = <ConnectionSkeleton label="Loading the Slack bridge" />
    } else if (!status.connected) {
        body = (
            <>
                <EmptyState
                    illustration={<SpotPlug hue={ADMIN_GROUP_HUE.connections} />}
                    title="Slack isn't connected yet"
                    description="Two steps: create the app in Slack, then paste its two keys here."
                    className="py-6"
                />
                <ol className="divide-y divide-border rounded-lg border border-border">
                    <li className="space-y-2 px-4 py-3">
                        <h3 className="text-sm font-medium">1. Create the app in Slack</h3>
                        <p className="text-xs text-muted-foreground text-pretty">
                            Slack opens with everything filled in. Choose your workspace, create the app, then click{" "}
                            <span className="font-medium text-foreground">Install to Workspace</span>.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm" className={sectionActionClass}>
                                <a href={status.manifest_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink aria-hidden="true" /> Create the app in Slack
                                </a>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className={sectionActionClass}
                                onClick={() => void copy(status.manifest, "Paste it under “From a manifest” in Slack.")}
                            >
                                <Copy aria-hidden="true" /> Copy the manifest
                            </Button>
                        </div>
                    </li>
                    <li className="space-y-3 px-4 py-3">
                        <h3 className="text-sm font-medium">2. Paste the app&apos;s two keys</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="slack-bot-token" className="text-xs text-muted-foreground">
                                    Bot token
                                </Label>
                                {/* new-password: a browser never fills the admin's own
                                    saved password into a key field. */}
                                <Input
                                    id="slack-bot-token"
                                    type="password"
                                    autoComplete="new-password"
                                    spellCheck={false}
                                    placeholder="xoxb-…"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    aria-describedby="slack-bot-token-help"
                                    className="h-8"
                                />
                                <p id="slack-bot-token-help" className="text-xs text-muted-foreground">
                                    In Slack, under OAuth &amp; Permissions, as Bot User OAuth Token.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="slack-signing-secret" className="text-xs text-muted-foreground">
                                    Signing secret
                                </Label>
                                <Input
                                    id="slack-signing-secret"
                                    type="password"
                                    autoComplete="new-password"
                                    spellCheck={false}
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value)}
                                    aria-describedby="slack-signing-secret-help"
                                    className="h-8"
                                />
                                <p id="slack-signing-secret-help" className="text-xs text-muted-foreground">
                                    In Slack, under Basic Information.
                                </p>
                            </div>
                        </div>
                        {formError && (
                            <p role="alert" className="text-sm text-danger-ink">
                                {formError}
                            </p>
                        )}
                        {/* The one filled button here: the step that connects. */}
                        <Button
                            size="sm"
                            className={cn(sectionActionClass, "w-fit")}
                            onClick={() => void connect()}
                            disabled={!token.trim() || !secret.trim() || busy === "connect"}
                        >
                            {busy === "connect" && <Loader2 className="animate-spin" aria-hidden="true" />}
                            Connect Slack
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Slack delivers messages to{" "}
                            <code className="break-all rounded-sm bg-muted px-1 py-0.5 font-mono">{status.events_url}</code>.
                            The manifest sets this for you.
                        </p>
                    </li>
                </ol>
            </>
        )
    } else {
        body = (
            <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* A dot and a word, like the sign-in providers beside it:
                        connected, and to what. */}
                    <StatusWord tone="success" className="text-sm">
                        <span>
                            <span className="font-medium">Connected</span> to{" "}
                            <span className="font-medium">{status.team_name || "Slack"}</span>
                        </span>
                    </StatusWord>
                    <Button
                        variant="outline"
                        size="sm"
                        className={sectionActionClass}
                        onClick={askDisconnect}
                        disabled={busy === "disconnect"}
                    >
                        {busy === "disconnect" && <Loader2 className="animate-spin" aria-hidden="true" />}
                        Disconnect
                    </Button>
                </div>

                {status.last_error && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5" role="alert">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink" aria-hidden="true" />
                        <p className="text-sm">{status.last_error}</p>
                    </div>
                )}

                <div className="space-y-2">
                    <h3 className="text-sm font-medium">Linked channels</h3>
                    {status.links.length === 0 ? (
                        <p className="text-sm text-muted-foreground">None yet. Link your first pair below.</p>
                    ) : (
                        <ul className="divide-y divide-border rounded-lg border border-border">
                            {status.links.map((l) => (
                                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2">
                                    <span className="min-w-0 truncate text-sm">
                                        <span className="text-muted-foreground">Slack</span> #{l.slack_channel_name}
                                        <span className="mx-2 text-muted-foreground" aria-hidden="true">↔</span>
                                        <span className="sr-only"> linked with </span>
                                        <span className="text-muted-foreground">OneCamp</span>{" "}
                                        {l.channel_name ? (
                                            `#${l.channel_name}`
                                        ) : (
                                            <span className="text-muted-foreground">a deleted channel</span>
                                        )}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => askUnlink(l)}
                                        disabled={busy === l.id}
                                        aria-label={`Unlink #${l.slack_channel_name}`}
                                    >
                                        {busy === l.id ? (
                                            <Loader2 className="animate-spin" aria-hidden="true" />
                                        ) : (
                                            <Unlink aria-hidden="true" />
                                        )}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="space-y-2">
                    <h3 className="text-sm font-medium">Link a channel</h3>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="slack-link-slack" className="text-xs text-muted-foreground">
                                Slack channel
                            </Label>
                            <Select value={pickSlack} onValueChange={setPickSlack}>
                                <SelectTrigger id="slack-link-slack" className="h-11 md:h-8">
                                    <SelectValue placeholder={slackChannels === null ? "Loading Slack channels…" : "Choose a channel"} />
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
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="slack-link-onecamp" className="text-xs text-muted-foreground">
                                OneCamp channel
                            </Label>
                            <Select value={pickOneCamp} onValueChange={setPickOneCamp}>
                                <SelectTrigger id="slack-link-onecamp" className="h-11 md:h-8">
                                    <SelectValue placeholder="Choose a channel" />
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
                        </div>
                        <Button
                            size="sm"
                            className={sectionActionClass}
                            onClick={() => void link()}
                            disabled={!pickSlack || !pickOneCamp || busy === "link"}
                        >
                            {busy === "link" && <Loader2 className="animate-spin" aria-hidden="true" />}
                            Link
                        </Button>
                    </div>
                    {slackChannelsError && <p className="text-sm text-danger-ink">{slackChannelsError}</p>}
                    {formError && (
                        <p role="alert" className="text-sm text-danger-ink">
                            {formError}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground text-pretty">
                        Everyone in the Slack channel will read what is written in the OneCamp one, so link a
                        private channel only to a Slack channel with the same people. The app joins a public Slack
                        channel itself; for a private one, type /invite @OneCamp in it first. Files shared in Slack
                        arrive as links; replies from agents and workflows stay in OneCamp.
                    </p>
                </div>
            </>
        )
    }

    return (
        <SettingsSection
            title="Slack bridge"
            description="Keep a Slack channel and a OneCamp channel in one conversation while your team moves over. Messages, thread replies, edits and deletions go both ways, each under the name of the person who wrote it. People in Slack don't need a OneCamp account or a seat."
        >
            {body}
        </SettingsSection>
    )
}

export default SlackBridgeCard
