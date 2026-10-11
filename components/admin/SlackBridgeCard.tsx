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
 * A connection card like its neighbours on the Integrations tab (design v3,
 * A18). Unlinking a channel and disconnecting (behind ⋯) both ask first:
 * each stops messages crossing over.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState } from "@/components/ui/error-state"
import { sectionActionClass } from "@/components/ui/settingsSection"
import { cn } from "@/lib/utils/helpers/cn"
import { BridgeMarks, ConnectionBanner, ConnectionNote, ConnectionSkeleton } from "@/components/admin/integrationParts"
import { ConnectionCard, RowMenu, StateWord } from "@/components/admin/connectParts"
import { Copy, ExternalLink, Link2, Loader2, Unlink } from "@/lib/icons"
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

/** What the bridge does, said once inside its card. */
const INTRO =
    "Keep a Slack channel and a OneCamp channel in one conversation while your team moves over. Messages, thread replies, edits and deletions go both ways, each under the name of the person who wrote it. People in Slack don't need a OneCamp account or a seat."

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
            <div className="cx-int-note">
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
            </div>
        )
    } else if (!status) {
        body = <ConnectionSkeleton label="Loading the Slack bridge" />
    } else if (!status.connected) {
        // Two steps as two rows of the card: Slack needs its workspace admin
        // to create and install the app before there is anything to paste.
        body = (
            <>
                <ConnectionNote>{INTRO} Two steps: create the app in Slack, then paste its two keys here.</ConnectionNote>
                <ol>
                    <li className="cx-int-step space-y-2">
                        <h3 className="text-sm font-medium">1. Create the app in Slack</h3>
                        <p className="text-xs text-muted-foreground text-pretty">
                            Slack opens with everything filled in. Choose your workspace, create the app, then click{" "}
                            <span className="font-medium text-foreground">Install to Workspace</span>.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="secondary" size="sm" className={sectionActionClass}>
                                <a href={status.manifest_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink aria-hidden="true" /> Create the app in Slack
                                </a>
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                className={sectionActionClass}
                                onClick={() => void copy(status.manifest, "Paste it under “From a manifest” in Slack.")}
                            >
                                <Copy aria-hidden="true" /> Copy the manifest
                            </Button>
                        </div>
                    </li>
                    <li className="cx-int-step space-y-3">
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
                            <code className="break-all rounded-sm bg-sunken px-1 py-0.5 font-mono">{status.events_url}</code>.
                            The manifest sets this for you.
                        </p>
                    </li>
                </ol>
            </>
        )
    } else {
        body = (
            <>
                {status.last_error && <ConnectionBanner tone="danger">{status.last_error}</ConnectionBanner>}

                <div>
                    <h3 id="slack-linked-channels" className="cx-int-subhead">Linked channels</h3>
                    {status.links.length === 0 ? (
                        <ConnectionNote className="pt-0">None yet. Link your first pair below.</ConnectionNote>
                    ) : (
                        <ul aria-labelledby="slack-linked-channels">
                            {status.links.map((l) => (
                                <li key={l.id} data-linked-row="" className="cx-linked">
                                    <Link2 aria-hidden="true" className="cx-linked-glyph" />
                                    <p className="min-w-0 flex-1 truncate text-sm">
                                        <span className="text-muted-foreground">Slack</span>{" "}
                                        <span className="font-medium">#{l.slack_channel_name}</span>
                                        <span className="mx-2 text-ink-3" aria-hidden="true">⇄</span>
                                        <span className="sr-only"> linked with </span>
                                        <span className="text-muted-foreground">OneCamp</span>{" "}
                                        {l.channel_name ? (
                                            <span className="font-medium">#{l.channel_name}</span>
                                        ) : (
                                            <span className="text-muted-foreground">a deleted channel</span>
                                        )}
                                    </p>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-11 shrink-0 md:size-8"
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

                <div className="cx-int-step space-y-2">
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

    const connected = !!status?.connected
    return (
        // A connection card (design v3, A18) with the bridge's two marks: the
        // dot between them travels while a channel is linked.
        <ConnectionCard
            id="integrations-slack"
            level={2}
            mark={<BridgeMarks syncing={connected && (status?.links.length ?? 0) > 0} />}
            name="Slack bridge"
            state={
                status ? (
                    <StateWord tone={connected ? "success" : "neutral"}>
                        {connected ? `Connected to ${status.team_name || "Slack"}` : "Not connected"}
                    </StateWord>
                ) : null
            }
            action={
                connected ? (
                    <RowMenu
                        label="Slack bridge actions"
                        items={[{ label: "Disconnect Slack", icon: Unlink, destructive: true, disabled: busy === "disconnect", onSelect: askDisconnect }]}
                    />
                ) : null
            }
        >
            {connected && <ConnectionNote>{INTRO}</ConnectionNote>}
            {body}
        </ConnectionCard>
    )
}

export default SlackBridgeCard
