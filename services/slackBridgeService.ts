import axiosInstance from "@/lib/axiosInstance"

// The live Slack bridge: one Slack workspace, channels linked in pairs.
// Everything Slack-specific (the manifest, the events URL, why a link failed)
// comes from the server, so this file holds no hostnames.

export interface SlackBridgeLink {
    id: string
    slack_channel_id: string
    slack_channel_name: string
    channel_uuid: string
    /** "" when the OneCamp channel has since been deleted. */
    channel_name: string
    created_at: string
}

export interface SlackBridgeStatus {
    connected: boolean
    team_name?: string
    team_id?: string
    /** The Request URL Slack delivers events to. */
    events_url: string
    /** Opens Slack's "create app" flow with the manifest filled in. */
    manifest_url: string
    manifest: string
    links: SlackBridgeLink[]
    /** The last delivery failure, in words the admin can act on. */
    last_error?: string
    last_error_at?: string
}

export interface SlackChannel {
    id: string
    name: string
    is_private: boolean
    /** The app is already in the channel. A private one must invite it. */
    is_member: boolean
}

export const slackBridgeUrl = "/admin/slack-bridge"

export async function getSlackBridge(): Promise<SlackBridgeStatus> {
    return (await axiosInstance.get<{ data: SlackBridgeStatus }>(slackBridgeUrl)).data.data
}

export async function connectSlackBridge(botToken: string, signingSecret: string): Promise<SlackBridgeStatus> {
    const res = await axiosInstance.put<{ data: SlackBridgeStatus }>(slackBridgeUrl, {
        bot_token: botToken.trim(),
        signing_secret: signingSecret.trim(),
    })
    return res.data.data
}

export async function disconnectSlackBridge(): Promise<void> {
    await axiosInstance.delete(slackBridgeUrl)
}

export async function listSlackChannels(): Promise<SlackChannel[]> {
    return (await axiosInstance.get<{ data: SlackChannel[] }>(`${slackBridgeUrl}/slack-channels`)).data.data ?? []
}

export async function linkSlackChannel(slackChannelId: string, channelUuid: string): Promise<SlackBridgeLink> {
    const res = await axiosInstance.post<{ data: SlackBridgeLink }>(`${slackBridgeUrl}/links`, {
        slack_channel_id: slackChannelId,
        channel_uuid: channelUuid,
    })
    return res.data.data
}

export async function unlinkSlackChannel(id: string): Promise<void> {
    await axiosInstance.delete(`${slackBridgeUrl}/links/${encodeURIComponent(id)}`)
}

/** OneCamp channels not yet in a link: each side belongs to one link at most. */
export function linkableChannels<T extends { ch_uuid: string }>(channels: T[], links: SlackBridgeLink[]): T[] {
    const taken = new Set(links.map((l) => l.channel_uuid))
    return channels.filter((c) => !taken.has(c.ch_uuid))
}

/** How a Slack channel reads in the picker, including what linking it needs. */
export function slackChannelLabel(c: SlackChannel): string {
    if (c.is_private && !c.is_member) return `#${c.name} (private: /invite @OneCamp there first)`
    return `#${c.name}${c.is_private ? " (private)" : ""}`
}
